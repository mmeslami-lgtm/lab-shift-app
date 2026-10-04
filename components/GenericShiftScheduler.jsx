"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { OrgContext } from "../lib/orgContext";
import OrgBar from "./OrgBar";
import PublishPanel from "./PublishPanel";
import { Calendar, Users, AlertTriangle, RefreshCw, Plus, Trash2, Copy, Check, ClipboardList, Info } from "lucide-react";
import { genericStorage as storage } from "../lib/storage";

// Catches any crash anywhere in the render tree (not just inside click handlers) and shows the
// actual error instead of silently going blank — this is what a plain try/catch inside an event
// handler can't do, since React errors during rendering happen outside that handler's scope.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div dir="ltr" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }} className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-rose-200 rounded-2xl p-5">
            <h2 className="text-rose-800 font-semibold text-sm mb-2">Es ist ein Fehler aufgetreten</h2>
            <p className="text-xs text-slate-600 mb-3">Bitte diese Meldung weitergeben, damit sie behoben werden kann.</p>
            <pre className="text-[11px] font-mono whitespace-pre-wrap bg-rose-50 border border-rose-100 rounded-lg p-3 text-rose-800 max-h-64 overflow-auto">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-1.5"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}



const MONTHLY_HOUR_CAP = 160; // hard ceiling on paid hours per person per month
// Cycled through for any shift column (built-in or custom) so everything gets a distinct,
// readable color without needing per-key hardcoding.
const SHIFT_COLOR_PALETTE = [
  { bg: "bg-sky-50", text: "text-sky-800", chip: "bg-sky-100 text-sky-800 border-sky-200", hex: { soft: "E0F2FE", solid: "0EA5E9", ink: "075985" } },
  { bg: "bg-emerald-50", text: "text-emerald-800", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", hex: { soft: "D1FAE5", solid: "10B981", ink: "065F46" } },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-800", chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200", hex: { soft: "FAE8FF", solid: "D946EF", ink: "86198F" } },
  { bg: "bg-amber-50", text: "text-amber-800", chip: "bg-amber-100 text-amber-800 border-amber-200", hex: { soft: "FEF3C7", solid: "F59E0B", ink: "92400E" } },
  { bg: "bg-indigo-50", text: "text-indigo-800", chip: "bg-indigo-100 text-indigo-800 border-indigo-200", hex: { soft: "E0E7FF", solid: "6366F1", ink: "3730A3" } },
  { bg: "bg-rose-50", text: "text-rose-800", chip: "bg-rose-100 text-rose-800 border-rose-200", hex: { soft: "FFE4E6", solid: "F43F5E", ink: "9F1239" } },
  { bg: "bg-lime-50", text: "text-lime-800", chip: "bg-lime-100 text-lime-800 border-lime-200", hex: { soft: "ECFCCB", solid: "84CC16", ink: "3F6212" } },
];
const WEEKDAY_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTH_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// The "middle" shifts (was just Mitteldienst + Büro) are now a dynamic list the caller defines:
// each is either "daily" (needed every non-holiday day, like Mitteldienst was) or "quota"
// (needed only N times a month, spread across weekdays, preferring designated staff — like
// Büro was). F, S and N keep their special rules (adjacency, night rotation) internally.
function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

// shiftDefs entries: { key, label, time, frequency: 'daily'|'quota', quotaCount?, preferLead?,
// requiresRestAfter? }. "requiresRestAfter" is what used to be hardcoded to a single "N" key —
// now ANY shift (named whatever the supervisor wants) can be flagged this way, there can be
// zero, one, or several such shifts, and the 2-4 day block + mandatory 2-day rest + cooldown +
// Sat/Sun continuity logic runs independently for each one that's flagged.
function generateSchedule(staffList, year, monthIdx, holidaySet, shiftHours, shiftLabels, dayShiftDefs, perShiftCount, leaveMap, carryOver, wishes) {
  carryOver = carryOver || {};
  wishes = wishes || [];
  dayShiftDefs = dayShiftDefs || [];
  const total = daysInMonth(year, monthIdx);

  const restDefs = dayShiftDefs.filter((d) => d.requiresRestAfter && d.frequency !== "quota");
  const restKeys = new Set(restDefs.map((d) => d.key));
  const dailyKeys = dayShiftDefs.filter((d) => d.frequency !== "quota" && !d.requiresRestAfter).map((d) => d.key);
  const quotaDefs = dayShiftDefs.filter((d) => d.frequency === "quota");
  const allKeys = ["F", ...dayShiftDefs.map((d) => d.key), "S"];

  const days = [];
  for (let d = 1; d <= total; d++) {
    const weekday = new Date(year, monthIdx, d).getDay();
    const shifts = {};
    allKeys.forEach((k) => { shifts[k] = []; });
    days.push({ day: d, weekday, isWeekend: weekday === 0 || weekday === 6, isHoliday: holidaySet.has(d), shifts });
  }

  const ids = staffList.map((s) => s.id);
  const hours = {}, satCount = {}, sunCount = {}, forcedRest = {}, consecutiveWorkDays = {}, restCooldown = {}, shiftCount = {}, restShiftCountSoFar = {};
  const targetOf = {};
  const MAX_CONSECUTIVE_WORKDAYS = 6;
  const REST_COOLDOWN_EXTRA_DAYS = 2;
  ids.forEach((id) => { hours[id] = 0; satCount[id] = 0; sunCount[id] = 0; forcedRest[id] = new Set(); consecutiveWorkDays[id] = 0; restCooldown[id] = new Set(); shiftCount[id] = 0; restShiftCountSoFar[id] = 0; });
  staffList.forEach((s) => {
    const leaveDays = (leaveMap[s.id] && leaveMap[s.id].size) || 0;
    const availableDays = Math.max(0, total - leaveDays);
    targetOf[s.id] = Math.min((s.weeklyHours || 38.5) * (availableDays / 7), MONTHLY_HOUR_CAP);
  });
  const warnings = [];
  const notes = [];
  const isOnLeave = (id, dayNum) => leaveMap[id] && leaveMap[id].has(dayNum);
  const nameOf = (id) => staffList.find((s) => s.id === id)?.name || id;
  const labelOf = (key) => shiftLabels[key] || key;

  if (ids.length === 0) return { days, hours, satCount, sunCount, targetOf, warnings: ["Keine Mitarbeiter eingetragen."], notes };

  const fullTimeSet = new Set(staffList.filter((s) => (s.weeklyHours || 38.5) >= 35).map((s) => s.id));
  const FULLTIME_OVERTIME_CEILING = 190;
  function hardCapFor(id) {
    return fullTimeSet.has(id) ? Math.max(MONTHLY_HOUR_CAP, FULLTIME_OVERTIME_CEILING) : targetOf[id];
  }

  // ---- Wishes ----
  const validWishes = [];
  let droppedWishCount = 0;
  wishes.forEach((w) => {
    if (!ids.includes(w.staffId) || !shiftHours[w.shiftType] || w.day < 1 || w.day > total) return;
    if (isOnLeave(w.staffId, w.day)) { droppedWishCount++; return; }
    const wDay = days[w.day - 1];
    if (wDay && (wDay.isHoliday || wDay.isWeekend) && dailyKeys.includes(w.shiftType)) { droppedWishCount++; return; }
    validWishes.push(w);
  });
  if (droppedWishCount > 0) notes.push(`${droppedWishCount} Schichtwunsch/-wünsche wurden wegen Urlaub/Krankheit oder Feiertagsregel ignoriert`);

  const nonRestWishes = validWishes.filter((w) => !restKeys.has(w.shiftType));
  nonRestWishes.forEach((w) => {
    const day = days[w.day - 1];
    const desired = Math.max(1, perShiftCount[w.shiftType] || 1);
    if (day.shifts[w.shiftType].includes(w.staffId)) return;
    if (day.shifts[w.shiftType].length >= desired) {
      notes.push(`Tag ${w.day}: Wunsch von ${nameOf(w.staffId)} für ${labelOf(w.shiftType)} konnte nicht berücksichtigt werden (Schicht bereits voll)`);
      return;
    }
    day.shifts[w.shiftType].push(w.staffId);
    hours[w.staffId] += shiftHours[w.shiftType];
    if (day.weekday === 6) satCount[w.staffId]++;
    if (day.weekday === 0) sunCount[w.staffId]++;
  });

  // ---- Rest-requiring shift(s): block rotation, run independently per flagged shift key ----
  restDefs.forEach((rDef) => {
    const RKEY = rDef.key;
    const RHOURS = shiftHours[RKEY];
    const restWishesByStaff = {};
    validWishes.filter((w) => w.shiftType === RKEY).forEach((w) => {
      if (!restWishesByStaff[w.staffId]) restWishesByStaff[w.staffId] = [];
      if (!restWishesByStaff[w.staffId].includes(w.day)) restWishesByStaff[w.staffId].push(w.day);
    });

    const needed = Math.max(1, perShiftCount[RKEY] || 1);
    const of_ = Array.from({ length: total }, () => []);
    const usedToday = Array.from({ length: total }, () => new Set());
    let pool = staffList.filter((s) => !s.nightExempt).map((s) => s.id);
    if (pool.length === 0) { pool = [...ids]; if (ids.length > 0) warnings.push(`Alle Mitarbeiter waren von „${labelOf(RKEY)}“ befreit; diese Einschränkung wurde ignoriert, um die Schicht zu besetzen`); }

    function capForDay(dIdx) {
      const day = days[dIdx];
      return (day.isWeekend || day.isHoliday) ? 1 : needed;
    }

    Object.entries(restWishesByStaff).forEach(([staffId, dayList]) => {
      const sorted = [...dayList].sort((a, b) => a - b);
      let i = 0;
      while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        for (let k = i; k <= j; k++) {
          const dIdx = sorted[k] - 1;
          if (of_[dIdx].includes(staffId)) continue;
          of_[dIdx].push(staffId);
          usedToday[dIdx].add(staffId);
          hours[staffId] += RHOURS;
          restShiftCountSoFar[staffId]++;
          const wd = days[dIdx].weekday;
          if (wd === 6) satCount[staffId]++;
          if (wd === 0) sunCount[staffId]++;
        }
        const runLen = j - i + 1;
        if (runLen < 2 || runLen > 4) notes.push(`${nameOf(staffId)}: Wunsch für „${labelOf(RKEY)}“ über ${runLen} Tag(e) (Tag ${sorted[i]} bis ${sorted[j]}) weicht von der üblichen 2-4-Tage-Blocklänge ab`);
        const lastDay = sorted[j];
        for (let d = lastDay; d <= lastDay + 1 && d < total; d++) forcedRest[staffId].add(d);
        for (let d = lastDay; d <= lastDay + 1 + REST_COOLDOWN_EXTRA_DAYS && d < total; d++) restCooldown[staffId].add(d);
        i = j + 1;
      }
    });

    for (let track = 0; track < needed; track++) {
      let dayIdx = 0;
      while (dayIdx < total) {
        if (of_[dayIdx].length >= capForDay(dayIdx)) { dayIdx += 1; continue; }

        if (days[dayIdx].weekday === 0 && dayIdx > 0 && days[dayIdx - 1].weekday === 6) {
          for (const satPerson of [...of_[dayIdx - 1]]) {
            if (of_[dayIdx].length >= capForDay(dayIdx)) break;
            if (of_[dayIdx].includes(satPerson) || usedToday[dayIdx].has(satPerson)) continue;
            if (isOnLeave(satPerson, dayIdx + 1)) continue;
            if (hours[satPerson] + RHOURS > hardCapFor(satPerson)) continue;
            let priorLen = 0, dd = dayIdx - 1;
            while (dd >= 0 && of_[dd].includes(satPerson)) { priorLen++; dd--; }
            if (priorLen >= 4) continue;
            const oldRestDays = [...forcedRest[satPerson]].filter((d) => d >= dayIdx);
            oldRestDays.forEach((d) => forcedRest[satPerson].delete(d));
            oldRestDays.forEach((d) => { if (d + 1 < total) forcedRest[satPerson].add(d + 1); });
            const oldCooldownDays = [...restCooldown[satPerson]].filter((d) => d >= dayIdx);
            oldCooldownDays.forEach((d) => restCooldown[satPerson].delete(d));
            oldCooldownDays.forEach((d) => { if (d + 1 < total) restCooldown[satPerson].add(d + 1); });
            of_[dayIdx].push(satPerson);
            usedToday[dayIdx].add(satPerson);
            hours[satPerson] += RHOURS;
            shiftCount[satPerson]++;
            restShiftCountSoFar[satPerson]++;
            sunCount[satPerson]++;
          }
          if (of_[dayIdx].length >= capForDay(dayIdx)) { dayIdx += 1; continue; }
        }

        function searchCandidate(hourCapFor, restrictToFullTime) {
          let best = null, bestFeasibleLen = 0, bestScore = Infinity;
          let fallback = null, fallbackFeasibleLen = 0, fallbackScore = Infinity;
          for (const c of pool) {
            if (restrictToFullTime && !fullTimeSet.has(c)) continue;
            if (forcedRest[c].has(dayIdx) || usedToday[dayIdx].has(c) || isOnLeave(c, dayIdx + 1) || restCooldown[c].has(dayIdx) || hours[c] + RHOURS > hourCapFor(c)) continue;
            let len = 0;
            for (let d = dayIdx; d < Math.min(dayIdx + 4, total); d++) {
              if (forcedRest[c].has(d) || usedToday[d].has(c) || isOnLeave(c, d + 1) || of_[d].length >= capForDay(d) || hours[c] + RHOURS * (len + 1) > hourCapFor(c)) break;
              len++;
            }
            if (len === 0) continue;
            const t = targetOf[c] > 0 ? targetOf[c] : 1;
            const expectedByNow = t * ((dayIdx + 1) / total);
            const score = (hours[c] - expectedByNow) / t + Math.random() * 0.01;
            if (len >= 2 && score < bestScore) { best = c; bestFeasibleLen = len; bestScore = score; }
            if (score < fallbackScore) { fallback = c; fallbackFeasibleLen = len; fallbackScore = score; }
          }
          return { best, bestFeasibleLen, fallback, fallbackFeasibleLen };
        }
        let { best, bestFeasibleLen, fallback, fallbackFeasibleLen } = searchCandidate((c) => targetOf[c], false);
        if (best === null && fallback === null) {
          let r = searchCandidate((c) => hardCapFor(c), true);
          if (r.best === null && r.fallback === null) r = searchCandidate((c) => hardCapFor(c), false);
          ({ best, bestFeasibleLen, fallback, fallbackFeasibleLen } = r);
          if (best !== null || fallback !== null) warnings.push(`Tag ${dayIdx + 1}: persönliches Stundenziel für „${labelOf(RKEY)}“ überschritten, da niemand anders verfügbar war`);
        }
        const candidate = best !== null ? best : fallback;
        const feasibleLen = best !== null ? bestFeasibleLen : fallbackFeasibleLen;
        if (candidate === null || feasibleLen === 0) {
          warnings.push(`Tag ${dayIdx + 1}: Keine verfügbare Person für „${labelOf(RKEY)}“ gefunden`);
          dayIdx += 1;
          continue;
        }
        const candidateRatio = hours[candidate] / (targetOf[candidate] > 0 ? targetOf[candidate] : 1);
        let desiredLen;
        const r2 = Math.random();
        if (candidateRatio < 0.9) desiredLen = r2 < 0.45 ? 4 : r2 < 0.8 ? 3 : 2;
        else if (candidateRatio > 1.05) desiredLen = r2 < 0.6 ? 2 : r2 < 0.9 ? 3 : 4;
        else desiredLen = r2 < 0.33 ? 2 : r2 < 0.66 ? 3 : 4;
        const blockLen = Math.max(1, Math.min(desiredLen, feasibleLen, total - dayIdx));
        if (blockLen < 2) notes.push(`Tag ${dayIdx + 1}: Block für „${labelOf(RKEY)}“ wurde auf 1 Tag begrenzt (wegen Urlaub/anstehender Einschränkung)`);
        for (let d = dayIdx; d < dayIdx + blockLen; d++) {
          of_[d].push(candidate);
          usedToday[d].add(candidate);
          hours[candidate] += RHOURS;
          shiftCount[candidate]++;
          restShiftCountSoFar[candidate]++;
          const wd = days[d].weekday;
          if (wd === 6) satCount[candidate]++;
          if (wd === 0) sunCount[candidate]++;
        }
        const restStart = dayIdx + blockLen;
        const restEnd = Math.min(restStart + 1, total - 1);
        for (let d = restStart; d <= restEnd; d++) forcedRest[candidate].add(d);
        const cooldownEnd = Math.min(restStart + REST_COOLDOWN_EXTRA_DAYS + 1, total - 1);
        for (let d = restStart; d <= cooldownEnd; d++) restCooldown[candidate].add(d);
        dayIdx += blockLen;
      }
    }
    for (let d = 0; d < total; d++) days[d].shifts[RKEY] = of_[d];
  });

  // Safety net for the rare case of TWO OR MORE independently-flagged rest-requiring shifts:
  // each one's rotation above only knows about rest/cooldown windows that existed at the time
  // IT ran, not ones a later-processed shift will still create. If that leaves a genuine gap —
  // someone's rest-requiring block immediately followed by another rest-requiring assignment —
  // remove the later one rather than ever violate the rest rule, even in this edge case.
  if (restDefs.length > 1) {
    restDefs.forEach((rDef) => {
      const RKEY = rDef.key;
      staffList.forEach((s) => {
        let i = 0;
        while (i < total) {
          if ((days[i].shifts[RKEY] || []).includes(s.id)) {
            let j = i;
            while (j < total && (days[j].shifts[RKEY] || []).includes(s.id)) j++;
            for (let k = j; k < Math.min(j + 2, total); k++) {
              restDefs.forEach((otherDef) => {
                const OKEY = otherDef.key;
                const arr = days[k].shifts[OKEY];
                const idx = arr.indexOf(s.id);
                if (idx !== -1) {
                  arr.splice(idx, 1);
                  hours[s.id] -= shiftHours[OKEY];
                  warnings.push(`Tag ${k + 1}: ${nameOf(s.id)} wurde aus „${labelOf(OKEY)}“ entfernt, da die Ruhezeit nach „${labelOf(RKEY)}“ sonst verletzt worden wäre`);
                }
              });
            }
            i = j;
          } else i++;
        }
      });
    });
  }

  const weekendExemptSet = new Set(staffList.filter((s) => s.weekendExempt).map((s) => s.id));
  const teamLeadSet = new Set(staffList.filter((s) => s.isTeamLead).map((s) => s.id));

  function pickBest(pool, day) {
    if (pool.length === 0) return null;
    const scored = pool.map((id) => {
      const t = targetOf[id] > 0 ? targetOf[id] : 1;
      const carry = carryOver[id] || {};
      const expectedByNow = t * (day.day / total);
      const actualSoFar = hours[id] - (carry.hours || 0);
      let score = (actualSoFar - expectedByNow) / t;
      score += (consecutiveWorkDays[id] || 0) * 0.05;
      if (fullTimeSet.has(id)) score += (shiftCount[id] || 0) * 0.01;
      score += Math.random() * 0.01;
      if (!weekendExemptSet.has(id)) {
        const satNeed = 2 + (carry.satDeficit || 0);
        const sunNeed = 2 + (carry.sunDeficit || 0);
        if (day.weekday === 6 && satCount[id] < satNeed) score -= 1000;
        if (day.weekday === 0 && sunCount[id] < sunNeed) score -= 1000;
      }
      return { id, score };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].id;
  }

  const quotaTargetDaysByKey = {};
  quotaDefs.forEach((qd) => {
    const candidateDays = [];
    for (let d = 1; d <= total; d++) {
      const wd = new Date(year, monthIdx, d).getDay();
      if (wd !== 0 && wd !== 6 && !holidaySet.has(d)) candidateDays.push(d);
    }
    const targetDays = new Set();
    const qCount = Math.max(1, qd.quotaCount || 9);
    const step = candidateDays.length / qCount;
    for (let i = 0; i < qCount && i < candidateDays.length; i++) {
      targetDays.add(candidateDays[Math.min(candidateDays.length - 1, Math.round(i * step))]);
    }
    quotaTargetDaysByKey[qd.key] = targetDays;
  });
  function pickQuotaPerson(qd, day, todayAssigned) {
    const eligible = ids.filter((id) => !todayAssigned.has(id) && !forcedRest[id].has(day.day - 1) && !isOnLeave(id, day.day) && hours[id] + shiftHours[qd.key] <= hardCapFor(id));
    if (eligible.length === 0) return null;
    const preferred = qd.preferLead ? eligible.filter((id) => teamLeadSet.has(id)) : [];
    const pool = preferred.length > 0 ? preferred : eligible;
    pool.sort((a, b) => (shiftCount[a] - shiftCount[b]) || Math.random() - 0.5);
    return pool[0];
  }

  let weekendPairPick = {};

  for (let d = 0; d < total; d++) {
    const day = days[d];
    const todayAssigned = new Set(allKeys.flatMap((k) => day.shifts[k]));
    const prevDay = d > 0 ? days[d - 1] : null;
    const prevDayS = prevDay ? new Set(prevDay.shifts.S || []) : new Set();
    const neededShifts = (day.isHoliday || day.isWeekend) ? ["F", "S"] : ["F", ...dailyKeys, "S"];
    if (day.weekday === 6) weekendPairPick = {};

    quotaDefs.forEach((qd) => {
      if (quotaTargetDaysByKey[qd.key].has(day.day) && day.shifts[qd.key].length === 0) {
        const person = pickQuotaPerson(qd, day, todayAssigned);
        if (person) {
          day.shifts[qd.key].push(person);
          todayAssigned.add(person);
          hours[person] += shiftHours[qd.key];
          shiftCount[person]++;
          if (day.weekday === 6) satCount[person]++;
          if (day.weekday === 0) sunCount[person]++;
        } else {
          notes.push(`Tag ${d + 1}: ${labelOf(qd.key)} konnte an diesem geplanten Tag nicht besetzt werden`);
        }
      } else if (day.shifts[qd.key].length > 0) {
        day.shifts[qd.key].forEach((id) => shiftCount[id]++);
      }
    });

    for (const shiftType of neededShifts) {
      const desired = (day.isWeekend || day.isHoliday) ? 1 : Math.max(1, perShiftCount[shiftType] || 1);
      const minRequired = 1;
      let filled = day.shifts[shiftType].length;

      if (day.weekday === 0 && filled < desired && weekendPairPick[shiftType]) {
        const carryId = weekendPairPick[shiftType];
        const carryOk = !todayAssigned.has(carryId) && !forcedRest[carryId].has(d) && !isOnLeave(carryId, day.day) &&
          !(shiftType === "F" && prevDayS.has(carryId)) && hours[carryId] + shiftHours[shiftType] <= targetOf[carryId];
        if (carryOk) {
          day.shifts[shiftType].push(carryId);
          todayAssigned.add(carryId);
          hours[carryId] += shiftHours[shiftType];
          shiftCount[carryId]++;
          filled++;
          sunCount[carryId]++;
        }
      }

      for (let k = filled; k < desired; k++) {
        let pool = ids.filter((id) => {
          if (todayAssigned.has(id)) return false;
          if (forcedRest[id].has(d)) return false;
          if (isOnLeave(id, day.day)) return false;
          if (shiftType === "F" && prevDayS.has(id)) return false;
          if (hours[id] + shiftHours[shiftType] > targetOf[id]) return false;
          return true;
        });
        let relaxedNote = null;
        if (pool.length === 0 && k < minRequired) {
          pool = ids.filter((id) => !todayAssigned.has(id) && !forcedRest[id].has(d) && !isOnLeave(id, day.day) && hours[id] + shiftHours[shiftType] <= targetOf[id]);
          if (pool.length > 0) relaxedNote = "Die Regel „nach Spätdienst kein Frühdienst am nächsten Tag\u201c wurde ignoriert";
        }
        if (pool.length === 0 && k < minRequired) {
          const overTargetPool = ids.filter((id) => !todayAssigned.has(id) && !forcedRest[id].has(d) && !isOnLeave(id, day.day) && hours[id] + shiftHours[shiftType] <= hardCapFor(id));
          const fullTimeFirst = overTargetPool.filter((id) => fullTimeSet.has(id));
          pool = fullTimeFirst.length > 0 ? fullTimeFirst : overTargetPool;
          if (pool.length > 0) relaxedNote = "Das persönliche Stundenziel wurde überschritten (nur bei Vollzeit-Personal), da niemand anders verfügbar war";
        }
        if (pool.length === 0) break;
        const chosen = pickBest(pool, day);
        if (relaxedNote) warnings.push(`Tag ${d + 1} (${labelOf(shiftType)}): ${relaxedNote}`);
        day.shifts[shiftType].push(chosen);
        todayAssigned.add(chosen);
        hours[chosen] += shiftHours[shiftType];
        shiftCount[chosen]++;
        if (day.weekday === 6) satCount[chosen]++;
        if (day.weekday === 0) sunCount[chosen]++;
        filled++;
      }
      if (filled < minRequired) {
        warnings.push(`Tag ${d + 1}: Schicht ${labelOf(shiftType)} war unbesetzt (starker Personalmangel)`);
      } else if (filled < desired) {
        notes.push(`Tag ${d + 1}: ${labelOf(shiftType)} wurde mit ${filled} statt ${desired} Personen besetzt (Personalmangel/Urlaub)`);
      }
      if (day.weekday === 6 && day.shifts[shiftType].length > 0) {
        weekendPairPick[shiftType] = day.shifts[shiftType][0];
      }
    }

    for (const id of ids) {
      const workedToday = allKeys.some((k) => day.shifts[k].includes(id));
      if (workedToday) {
        consecutiveWorkDays[id] = (consecutiveWorkDays[id] || 0) + 1;
        if (consecutiveWorkDays[id] >= MAX_CONSECUTIVE_WORKDAYS) {
          forcedRest[id].add(d + 1);
          forcedRest[id].add(d + 2);
          consecutiveWorkDays[id] = 0;
        }
      } else {
        consecutiveWorkDays[id] = 0;
      }
    }
  }

  return { days, hours, satCount, sunCount, targetOf, warnings, notes };
}

function computeStatsAndWarnings(days, staffList, leaveMap, shiftHours, allKeys, restKeysList, shiftLabels) {
  leaveMap = leaveMap || {};
  shiftLabels = shiftLabels || {};
  const labelOf = (key) => shiftLabels[key] || key;
  restKeysList = restKeysList || [];
  const ids = staffList.map((s) => s.id);
  const hours = {}, satCount = {}, sunCount = {};
  ids.forEach((id) => { hours[id] = 0; satCount[id] = 0; sunCount[id] = 0; });
  days.forEach((day) => {
    allKeys.forEach((st) => {
      (day.shifts[st] || []).forEach((id) => {
        if (!(id in hours)) return;
        hours[id] += shiftHours[st] || 0;
        if (day.weekday === 6) satCount[id]++;
        if (day.weekday === 0) sunCount[id]++;
      });
    });
  });
  const total = days.length;
  const targetOf = {};
  staffList.forEach((s) => {
    const leaveDays = (leaveMap[s.id] && leaveMap[s.id].size) || 0;
    const availableDays = Math.max(0, total - leaveDays);
    targetOf[s.id] = Math.min((s.weeklyHours || 38.5) * (availableDays / 7), MONTHLY_HOUR_CAP);
  });
  const warnings = [];
  staffList.forEach((s) => {
    if (s.weekendExempt) return;
    if (satCount[s.id] < 2) warnings.push(`${s.name}: weniger als 2 Samstage gearbeitet (${satCount[s.id]})`);
    if (sunCount[s.id] < 2) warnings.push(`${s.name}: weniger als 2 Sonntage gearbeitet (${sunCount[s.id]})`);
  });
  staffList.forEach((s) => {
    const t = targetOf[s.id];
    const dev = t > 0 ? Math.abs(hours[s.id] - t) / t : 0;
    if (dev > 0.15) warnings.push(`${s.name}: große Abweichung vom Stundenziel (${hours[s.id].toFixed(1)} von ${t.toFixed(1)} Std.)`);
  });
  for (let d = 1; d < days.length; d++) {
    const prevS = new Set(days[d - 1].shifts.S || []);
    (days[d].shifts.F || []).forEach((id) => {
      if (prevS.has(id)) {
        const name = staffList.find((s) => s.id === id)?.name || id;
        warnings.push(`Tag ${days[d].day}: ${name} hat nach dem Spätdienst am Vortag einen Frühdienst`);
      }
    });
  }
  restKeysList.forEach((RKEY) => {
    staffList.forEach((s) => {
      let i = 0;
      while (i < days.length) {
        if ((days[i].shifts[RKEY] || []).includes(s.id)) {
          let j = i;
          while (j < days.length && (days[j].shifts[RKEY] || []).includes(s.id)) j++;
          const len = j - i;
          if (len < 2 || len > 4) warnings.push(`${s.name}: Block für „${labelOf(RKEY)}“ über ${len} Tage (Tag ${days[i].day} bis ${days[j - 1].day}) — sollte 2 bis 4 Tage sein`);
          let restOk = true;
          for (let k = j; k < Math.min(j + 2, days.length); k++) {
            if (allKeys.some((st) => (days[k].shifts[st] || []).includes(s.id))) restOk = false;
          }
          if (!restOk) warnings.push(`${s.name}: nach „${labelOf(RKEY)}“ bis Tag ${days[j - 1].day} wurden nicht mindestens 2 Ruhetage eingehalten`);
          i = j;
        } else i++;
      }
    });
    staffList.forEach((s) => {
      if (s.nightExempt) {
        const works = days.some((d) => (d.shifts[RKEY] || []).includes(s.id));
        if (works) warnings.push(`${s.name}: ist befreit von „${labelOf(RKEY)}“, hat aber eine Schicht davon im Plan`);
      }
    });
  });
  staffList.forEach((s) => {
    let i = 0;
    while (i < days.length) {
      const worksDay = (idx) => allKeys.some((st) => (days[idx].shifts[st] || []).includes(s.id));
      if (worksDay(i)) {
        let j = i;
        while (j < days.length && worksDay(j)) j++;
        const len = j - i;
        if (len > 6) warnings.push(`${s.name}: ${len} Tage am Stück gearbeitet (Tag ${days[i].day} bis ${days[j - 1].day}) — sollte alle 5–7 Arbeitstage mindestens 2 freie Tage haben`);
        i = j;
      } else i++;
    }
  });
  return { hours, satCount, sunCount, targetOf, warnings };
}

function todayMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Storage keys can't contain whitespace, slashes, or quotes — but staff names almost always
// have spaces, so the name itself is never used directly as (part of) a key. The real name is
// kept inside the stored value instead, and read back from there (see loadBalances above).
function sanitizeKey(name) {
  return String(name || "").replace(/[\s\/\\'"]+/g, "_").slice(0, 150);
}

function parseDayList(str, maxDay) {
  const out = new Set();
  String(str || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((token) => {
      const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        let a = parseInt(rangeMatch[1], 10), b = parseInt(rangeMatch[2], 10);
        if (a > b) [a, b] = [b, a];
        for (let n = a; n <= b; n++) if (n >= 1 && n <= maxDay) out.add(n);
      } else {
        const n = parseInt(token, 10);
        if (!isNaN(n) && n >= 1 && n <= maxDay) out.add(n);
      }
    });
  return out;
}

// Turns an editable "HH:MM-HH:MM" time range into paid hours (span minus 30 min unpaid break),
// handling shifts that cross midnight (like Nachtdienst). Falls back to a safe default on bad input.
function parseTimeRange(timeRange) {
  // Accepts "22:00-06:30" as well as shorthand like "22-06:30" or "8-16" (minutes optional).
  const m = String(timeRange || "").match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2] || "0", 10);
  const endMin = parseInt(m[3], 10) * 60 + parseInt(m[4] || "0", 10);
  return { startMin, endMin };
}
function computeShiftHours(timeRange) {
  const t = parseTimeRange(timeRange);
  if (!t) return 8;
  let endMin = t.endMin;
  if (endMin <= t.startMin) endMin += 24 * 60; // crosses midnight
  const hours = (endMin - t.startMin - 30) / 60;
  return Math.max(0.5, Math.round(hours * 100) / 100);
}


// ===================== Excel export =====================
// ============================================================================================
// Excel export (.xlsx) without any library: a tiny ZIP writer + SpreadsheetML generator.
// Produces a real, styled workbook (colours, borders, frozen headers, print setup, live
// formulas) from the generated Dienstplan.
// ============================================================================================
const XLSX_ENC = new TextEncoder();
const XLSX_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function xlsxCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = XLSX_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function xlsxZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  let cdSize = 0;
  files.forEach((f) => {
    const name = XLSX_ENC.encode(f.name);
    const data = f.data;
    const crc = xlsxCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    cdSize += 46 + name.length;
    offset += 30 + name.length + data.length;
  });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  all.forEach((a) => { out.set(a, p); p += a.length; });
  return out;
}
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function xlsxCol(n) { // 1 -> A
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ---- style registry: describe a look once, get back an index ----
function xlsxStyleBook() {
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = [], xfs = [], numFmts = [], dxfs = [];
  const maps = { font: {}, fill: {}, border: {}, xf: {}, num: {} };
  const rgb = (c) => "FF" + String(c).replace("#", "").toUpperCase();
  function fontId(f) {
    const x = f || {};
    const xml = `<font>${x.b ? "<b/>" : ""}${x.i ? "<i/>" : ""}<sz val="${x.sz || 10}"/><color rgb="${rgb(x.color || "1F2937")}"/><name val="Arial"/></font>`;
    if (maps.font[xml] === undefined) { maps.font[xml] = fonts.length; fonts.push(xml); }
    return maps.font[xml];
  }
  function fillId(c) {
    if (!c) return 0;
    const xml = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(c)}"/><bgColor indexed="64"/></patternFill></fill>`;
    if (maps.fill[xml] === undefined) { maps.fill[xml] = fills.length; fills.push(xml); }
    return maps.fill[xml];
  }
  function borderId(b) {
    const side = (n, v) => (v ? `<${n} style="${v[0]}"><color rgb="${rgb(v[1])}"/></${n}>` : `<${n}/>`);
    const x = b || {};
    const xml = `<border>${side("left", x.l)}${side("right", x.r)}${side("top", x.t)}${side("bottom", x.b)}<diagonal/></border>`;
    if (maps.border[xml] === undefined) { maps.border[xml] = borders.length; borders.push(xml); }
    return maps.border[xml];
  }
  function numId(fmt) {
    if (!fmt) return 0;
    if (maps.num[fmt] === undefined) { maps.num[fmt] = 164 + numFmts.length; numFmts.push(`<numFmt numFmtId="${maps.num[fmt]}" formatCode="${xmlEsc(fmt)}"/>`); }
    return maps.num[fmt];
  }
  borderId(null); // index 0 = no border
  fontId(null);   // index 0 = default font
  return {
    xf(spec) {
      const key = JSON.stringify(spec || {});
      if (maps.xf[key] !== undefined) return maps.xf[key];
      const s = spec || {};
      const al = s.al || {};
      const xml = `<xf numFmtId="${numId(s.num)}" fontId="${fontId(s.font)}" fillId="${fillId(s.fill)}" borderId="${borderId(s.border)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${al.h || "general"}" vertical="${al.v || "center"}"${al.wrap ? ' wrapText="1"' : ""}/></xf>`;
      maps.xf[key] = xfs.length; xfs.push(xml);
      return maps.xf[key];
    },
    dxf(font) { dxfs.push(`<dxf><font><b/><color rgb="${rgb(font)}"/></font></dxf>`); return dxfs.length - 1; },
    xml() {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : "") +
        `<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs></styleSheet>`;
    },
  };
}

function xlsxSheet(name, tab) {
  return { name, tab, cells: new Map(), merges: [], cols: [], rowH: new Map(), freeze: null, cf: [], titleRows: null, landscape: true };
}
function xlsxSet(ws, r, c, value, style) { ws.cells.set(r * 1000 + c, { r, c, v: value, s: style }); }
function xlsxMerge(ws, r1, c1, r2, c2, style) {
  ws.merges.push(`${xlsxCol(c1)}${r1}:${xlsxCol(c2)}${r2}`);
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!ws.cells.has(r * 1000 + c)) xlsxSet(ws, r, c, null, style);
}
function xlsxSheetXml(ws) {
  const rows = new Map();
  ws.cells.forEach((cell) => { if (!rows.has(cell.r)) rows.set(cell.r, []); rows.get(cell.r).push(cell); });
  const rowNums = [...new Set([...rows.keys(), ...ws.rowH.keys()])].sort((a, b) => a - b);
  let maxR = 1, maxC = 1;
  ws.cells.forEach((c) => { if (c.r > maxR) maxR = c.r; if (c.c > maxC) maxC = c.c; });
  let sd = "";
  rowNums.forEach((r) => {
    const ht = ws.rowH.get(r);
    const cells = (rows.get(r) || []).sort((a, b) => a.c - b.c);
    sd += `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>`;
    cells.forEach((cell) => {
      const ref = `${xlsxCol(cell.c)}${r}`;
      const s = cell.s ? ` s="${cell.s}"` : "";
      const v = cell.v;
      if (v === null || v === undefined || v === "") sd += `<c r="${ref}"${s}/>`;
      else if (typeof v === "number") sd += `<c r="${ref}"${s}><v>${v}</v></c>`;
      else if (typeof v === "object" && v.f) sd += `<c r="${ref}"${s}><f>${xmlEsc(v.f)}</f><v>${v.v}</v></c>`;
      else sd += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    });
    sd += `</row>`;
  });
  const cols = ws.cols.length ? `<cols>${ws.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  let pane = "";
  if (ws.freeze) {
    const [fr, fc] = ws.freeze; // rows above / columns left of the split
    pane = `<pane${fc ? ` xSplit="${fc}"` : ""}${fr ? ` ySplit="${fr}"` : ""} topLeftCell="${xlsxCol(fc + 1)}${fr + 1}" activePane="${fr && fc ? "bottomRight" : fr ? "bottomLeft" : "topRight"}" state="frozen"/>`;
  }
  const merges = ws.merges.length ? `<mergeCells count="${ws.merges.length}">${ws.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  let prio = 1;
  const cf = ws.cf.map((x) => `<conditionalFormatting sqref="${x.sqref}">${x.rules.map((r) => `<cfRule type="cellIs" dxfId="${r.dxf}" priority="${prio++}" operator="${r.op}"><formula>${r.val}</formula></cfRule>`).join("")}</conditionalFormatting>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr>${ws.tab ? `<tabColor rgb="FF${ws.tab}"/>` : ""}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${xlsxCol(maxC)}${maxR}"/>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
    `${cols}<sheetData>${sd}</sheetData>${merges}${cf}` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${ws.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
function xlsxWorkbook(sheets, styles) {
  const q = (n) => (/[^A-Za-z0-9_]/.test(n) ? `'${n}'` : n);
  const defined = sheets.map((ws, i) => (ws.titleRows ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${q(ws.name)}!$${ws.titleRows[0]}:$${ws.titleRows[1]}</definedName>` : "")).join("");
  const files = [
    { name: "[Content_Types].xml", xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((ws, i) => `<sheet name="${xmlEsc(ws.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", xml: styles.xml() },
    ...sheets.map((ws, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: xlsxSheetXml(ws) })),
  ];
  return xlsxZip(files.map((f) => ({ name: f.name, data: XLSX_ENC.encode(f.xml) })));
}

// ---- the actual Dienstplan workbook -------------------------------------------------------
// input: { title, subtitle, weekdayNames, weekdayShort, staff:[{id,name}], days, columns:[{key,label,time,slotIndex}],
//   shifts:[{key,code,label,time,hours,hex:{soft,solid,ink}}], skipKeys:Set, matrix, hours, targets, satCount, sunCount,
//   absentByDay, warnings, notes }
function buildScheduleXlsx(input) {
  const st = xlsxStyleBook();
  const TEAL = "134E4A", INK = "1F2937", MUTED = "6B7280", GRID = "D1D5DB", WEEKEND = "F1F5F9", HOLIDAY = "FEF3C7", WHITE = "FFFFFF";
  const line = ["thin", GRID];
  const box = { l: line, r: line, t: line, b: line };
  const shiftByKey = {};
  input.shifts.forEach((s) => { shiftByKey[s.key] = s; });
  const shiftByCode = {};
  input.shifts.forEach((s) => { shiftByCode[s.code] = s; });
  const center = { h: "center", v: "center", wrap: true };
  const sTitle = st.xf({ font: { b: true, sz: 16, color: TEAL }, al: { h: "left", v: "center" } });
  const sSub = st.xf({ font: { i: true, sz: 9, color: MUTED }, al: { h: "left", v: "center" } });
  const sHead = st.xf({ font: { b: true, color: WHITE }, fill: TEAL, border: box, al: center });
  const sHeadLeft = st.xf({ font: { b: true, color: WHITE }, fill: TEAL, border: box, al: { h: "left", v: "center", wrap: true } });
  const sDayNum = st.xf({ font: { b: true }, border: box, al: center });
  const sDayNumWk = st.xf({ font: { b: true }, fill: WEEKEND, border: box, al: center });
  const sDayNumHol = st.xf({ font: { b: true }, fill: HOLIDAY, border: box, al: center });
  const sWd = st.xf({ border: box, al: { h: "left", v: "center" } });
  const sWdWk = st.xf({ fill: WEEKEND, border: box, al: { h: "left", v: "center" } });
  const sWdHol = st.xf({ fill: HOLIDAY, border: box, al: { h: "left", v: "center" } });
  const sSkip = st.xf({ font: { color: "9CA3AF" }, fill: WEEKEND, border: box, al: center });
  const sOpen = st.xf({ font: { b: true, color: "B91C1C" }, fill: "FEE2E2", border: box, al: center });
  const sAbsent = st.xf({ font: { sz: 9, color: "065F46" }, border: box, al: { h: "left", v: "center", wrap: true } });
  const shiftCell = (s) => st.xf({ font: { b: true, color: s.hex.ink }, fill: s.hex.soft, border: box, al: center });
  const shiftHead = (s) => st.xf({ font: { b: true, color: s.hex.ink }, fill: s.hex.soft, border: { l: line, r: line, t: line, b: ["medium", s.hex.solid] }, al: center });
  const num1 = "0.0";

  // ===== Sheet 1: nach Tag =====
  const ws1 = xlsxSheet("Dienstplan", "134E4A");
  const nCols = 2 + input.columns.length + 1;
  ws1.cols = [6, 16, ...input.columns.map(() => 22), 30];
  xlsxSet(ws1, 1, 1, input.title, sTitle); xlsxMerge(ws1, 1, 1, 1, nCols, sTitle); ws1.rowH.set(1, 28);
  xlsxSet(ws1, 2, 1, input.subtitle, sSub); xlsxMerge(ws1, 2, 1, 2, nCols, sSub);
  ws1.rowH.set(3, 6);
  xlsxSet(ws1, 4, 1, "Tag", sHead); xlsxSet(ws1, 4, 2, "Wochentag", sHeadLeft);
  input.columns.forEach((col, i) => xlsxSet(ws1, 4, 3 + i, `${col.label}\n${col.time}`, shiftHead(shiftByKey[col.key])));
  xlsxSet(ws1, 4, nCols, "Urlaub / Überstundenfrei", sHead);
  ws1.rowH.set(4, 36);
  input.days.forEach((d, di) => {
    const r = 5 + di;
    const reduced = d.isWeekend || d.isHoliday;
    xlsxSet(ws1, r, 1, d.day, d.isHoliday ? sDayNumHol : d.isWeekend ? sDayNumWk : sDayNum);
    xlsxSet(ws1, r, 2, input.weekdayNames[d.weekday] + (d.isHoliday ? " (Feiertag)" : ""), d.isHoliday ? sWdHol : d.isWeekend ? sWdWk : sWd);
    input.columns.forEach((col, i) => {
      const s = shiftByKey[col.key];
      const id = (d.shifts[col.key] || [])[col.slotIndex];
      if (reduced && (input.skipKeys.has(col.key) || col.slotIndex >= 1)) xlsxSet(ws1, r, 3 + i, "–", sSkip); // weekends/holidays: 1 person per shift
      else if (id) xlsxSet(ws1, r, 3 + i, input.nameOf[id] || "", shiftCell(s));
      else if (input.quotaKeys && input.quotaKeys.has(col.key)) xlsxSet(ws1, r, 3 + i, "–", sSkip); // monthly-quota shift: most days are simply not needed
      else xlsxSet(ws1, r, 3 + i, "unbesetzt", sOpen);
    });
    xlsxSet(ws1, r, nCols, (input.absentByDay[d.day] || []).join(", "), sAbsent);
    ws1.rowH.set(r, 20);
  });
  ws1.freeze = [4, 2];
  ws1.titleRows = [4, 4];

  // ===== Sheet 3 first (legend cells are referenced by sheet 2's formulas) =====
  const nS = input.shifts.length;
  const legendFirst = 5, legendLast = 4 + nS;
  const nDays = input.days.length;
  const lastDayCol = xlsxCol(1 + nDays);
  const sheet2Name = "Nach Mitarbeiter";
  const sumName = "Zusammenfassung";
  const staffRow0 = 6;

  // cached values for formulas
  const codeHours = {};
  input.shifts.forEach((s) => { codeHours[s.code] = s.hours; });
  const countsOf = {};
  input.staff.forEach((p) => {
    const c = {};
    input.days.forEach((d) => { const code = input.matrix[p.id] && input.matrix[p.id][d.day]; if (code) c[code] = (c[code] || 0) + 1; });
    countsOf[p.id] = c;
  });
  const stdOf = {};
  input.staff.forEach((p) => { stdOf[p.id] = Object.keys(countsOf[p.id]).reduce((sum, code) => sum + (codeHours[code] ? countsOf[p.id][code] * codeHours[code] : 0), 0); });

  // ===== Sheet 2: nach Mitarbeiter =====
  const ws2 = xlsxSheet(sheet2Name, "0F766E");
  ws2.cols = [24, ...input.days.map(() => 4.3), 9, 9, 9];
  const stdC = 2 + nDays, sollC = stdC + 1, diffC = stdC + 2;
  xlsxSet(ws2, 1, 1, input.title + " — nach Mitarbeiter", sTitle); xlsxMerge(ws2, 1, 1, 1, diffC, sTitle); ws2.rowH.set(1, 28);
  xlsxSet(ws2, 2, 1, input.subtitle, sSub); xlsxMerge(ws2, 2, 1, 2, diffC, sSub);
  ws2.rowH.set(3, 6);
  xlsxSet(ws2, 4, 1, "Mitarbeiter", sHeadLeft); xlsxMerge(ws2, 4, 1, 5, 1, sHeadLeft);
  const sDayHead = st.xf({ font: { b: true, color: WHITE }, fill: TEAL, border: box, al: center });
  const sDayHeadWk = st.xf({ font: { b: true, color: WHITE }, fill: "0F766E", border: box, al: center });
  input.days.forEach((d, i) => {
    const wk = d.isWeekend || d.isHoliday;
    xlsxSet(ws2, 4, 2 + i, d.day, wk ? sDayHeadWk : sDayHead);
    xlsxSet(ws2, 5, 2 + i, input.weekdayShort[d.weekday], wk ? sDayHeadWk : sDayHead);
  });
  [["Std.", stdC], ["Soll", sollC], ["Diff.", diffC]].forEach(([t, c]) => { xlsxSet(ws2, 4, c, t, sHead); xlsxMerge(ws2, 4, c, 5, c, sHead); });
  ws2.rowH.set(4, 20); ws2.rowH.set(5, 16);
  const sName = st.xf({ font: { b: true }, border: box, al: { h: "left", v: "center" } });
  const sEmpty = st.xf({ border: box, al: center });
  const sEmptyWk = st.xf({ fill: WEEKEND, border: box, al: center });
  const sLeave = st.xf({ font: { b: true, color: "065F46" }, fill: "D1FAE5", border: box, al: center });
  const sSick = st.xf({ font: { b: true, color: "9A3412" }, fill: "FFEDD5", border: box, al: center });
  const sNum = st.xf({ border: box, num: num1, al: { h: "center", v: "center" } });
  const sNumB = st.xf({ font: { b: true }, border: box, num: num1, al: { h: "center", v: "center" } });
  const sInput = st.xf({ font: { color: "1D4ED8" }, border: box, num: num1, al: { h: "center", v: "center" } });
  const sInputHours = st.xf({ font: { color: "1D4ED8" }, border: box, num: "0.0#", al: { h: "center", v: "center" } });
  const sDiff = st.xf({ font: { b: true }, border: box, num: "+0.0;-0.0;0.0", al: { h: "center", v: "center" } });
  const dxfRed = st.dxf("B91C1C"), dxfGreen = st.dxf("047857");
  input.staff.forEach((p, pi) => {
    const r = staffRow0 + pi;
    xlsxSet(ws2, r, 1, p.name, sName);
    input.days.forEach((d, i) => {
      const code = input.matrix[p.id] && input.matrix[p.id][d.day];
      const wk = d.isWeekend || d.isHoliday;
      if (!code) xlsxSet(ws2, r, 2 + i, "", wk ? sEmptyWk : sEmpty);
      else if (code === "U") xlsxSet(ws2, r, 2 + i, "U", sLeave);
      else if (code === "K") xlsxSet(ws2, r, 2 + i, "K", sSick);
      else xlsxSet(ws2, r, 2 + i, code, shiftCell(shiftByCode[code] || input.shifts[0]));
    });
    const first = `$B${r}`, last = `$${lastDayCol}${r}`;
    const stdF = nS > 0 ? `SUMPRODUCT(COUNTIF(${first}:${last},${sumName}!$A$${legendFirst}:$A$${legendLast}),${sumName}!$D$${legendFirst}:$D$${legendLast})` : "0";
    xlsxSet(ws2, r, stdC, { f: stdF, v: round2(stdOf[p.id]) }, sNumB);
    xlsxSet(ws2, r, sollC, round2(input.targets[p.id] || 0), sInput);
    xlsxSet(ws2, r, diffC, { f: `${xlsxCol(stdC)}${r}-${xlsxCol(sollC)}${r}`, v: round2(round2(stdOf[p.id]) - round2(input.targets[p.id] || 0)) }, sDiff);
    ws2.rowH.set(r, 20);
  });
  const lastStaffRow = staffRow0 + input.staff.length - 1;
  ws2.cf.push({ sqref: `${xlsxCol(diffC)}${staffRow0}:${xlsxCol(diffC)}${lastStaffRow}`, rules: [{ op: "lessThan", val: "-5", dxf: dxfRed }, { op: "greaterThan", val: "5", dxf: dxfGreen }] });
  const noteRow = lastStaffRow + 2;
  xlsxSet(ws2, noteRow, 1, "Tipp: Ändere ein Kürzel im Plan (z. B. M → A), die Stunden rechnen sich neu. „Soll“ (blau) kommt aus der App und berücksichtigt Urlaub/Krankheit.", sSub);
  xlsxMerge(ws2, noteRow, 1, noteRow, diffC, sSub);
  ws2.freeze = [5, 1];
  ws2.titleRows = [4, 5];

  // ===== Sheet 3: Zusammenfassung =====
  const ws3 = xlsxSheet(sumName, "6366F1");
  const countCols = input.shifts.length + 2; // shifts + U + K
  ws3.cols = [26, 14, 14, 14, 11, 11, ...Array(countCols).fill(10)];
  const totalCols = 6 + countCols;
  xlsxSet(ws3, 1, 1, input.title + " — Zusammenfassung", sTitle); xlsxMerge(ws3, 1, 1, 1, totalCols, sTitle); ws3.rowH.set(1, 28);
  xlsxSet(ws3, 2, 1, "Die Stunden pro Schicht (blau) kannst du ändern, alle Summen im Blatt „Nach Mitarbeiter“ rechnen neu.", sSub); xlsxMerge(ws3, 2, 1, 2, totalCols, sSub);
  ["Kürzel", "Schicht", "Zeit", "Std. pro Schicht"].forEach((t, i) => xlsxSet(ws3, 4, 1 + i, t, sHead));
  ws3.rowH.set(4, 22);
  input.shifts.forEach((s, i) => {
    const r = legendFirst + i;
    xlsxSet(ws3, r, 1, s.code, shiftCell(s));
    xlsxSet(ws3, r, 2, s.label, st.xf({ border: box, al: { h: "left", v: "center" } }));
    xlsxSet(ws3, r, 3, s.time, st.xf({ border: box, al: center }));
    xlsxSet(ws3, r, 4, round2(s.hours), sInputHours);
  });
  xlsxSet(ws3, legendLast + 1, 1, "U", sLeave); xlsxSet(ws3, legendLast + 1, 2, "Urlaub", st.xf({ border: box, al: { h: "left", v: "center" } }));
  xlsxSet(ws3, legendLast + 2, 1, "K", sSick); xlsxSet(ws3, legendLast + 2, 2, "Krank", st.xf({ border: box, al: { h: "left", v: "center" } }));
  const tHead = legendLast + 4;
  const heads = ["Mitarbeiter", "Std. Ist", "Soll", "Differenz", "Samstage", "Sonntage", ...input.shifts.map((s) => s.code), "U", "K"];
  heads.forEach((t, i) => xlsxSet(ws3, tHead, 1 + i, t, i === 0 ? sHeadLeft : sHead));
  ws3.rowH.set(tHead, 22);
  const sNameS = st.xf({ font: { b: true }, border: box, al: { h: "left", v: "center" } });
  const sInt = st.xf({ border: box, num: "0", al: { h: "center", v: "center" } });
  const sIntB = st.xf({ font: { b: true }, fill: WEEKEND, border: box, num: "0", al: { h: "center", v: "center" } });
  const sNumTot = st.xf({ font: { b: true }, fill: WEEKEND, border: box, num: num1, al: { h: "center", v: "center" } });
  const sDiffTot = st.xf({ font: { b: true }, fill: WEEKEND, border: box, num: "+0.0;-0.0;0.0", al: { h: "center", v: "center" } });
  const sTotLabel = st.xf({ font: { b: true }, fill: WEEKEND, border: box, al: { h: "left", v: "center" } });
  const q2 = `'${sheet2Name}'`;
  input.staff.forEach((p, pi) => {
    const r = tHead + 1 + pi;
    const r2 = staffRow0 + pi;
    xlsxSet(ws3, r, 1, p.name, sNameS);
    xlsxSet(ws3, r, 2, { f: `${q2}!${xlsxCol(stdC)}${r2}`, v: round2(stdOf[p.id]) }, sNum);
    xlsxSet(ws3, r, 3, { f: `${q2}!${xlsxCol(sollC)}${r2}`, v: round2(input.targets[p.id] || 0) }, sNum);
    xlsxSet(ws3, r, 4, { f: `B${r}-C${r}`, v: round2(round2(stdOf[p.id]) - round2(input.targets[p.id] || 0)) }, sDiff);
    xlsxSet(ws3, r, 5, input.satCount[p.id] || 0, sInt);
    xlsxSet(ws3, r, 6, input.sunCount[p.id] || 0, sInt);
    const rng = `${q2}!$B${r2}:$${lastDayCol}${r2}`;
    input.shifts.forEach((s, i) => xlsxSet(ws3, r, 7 + i, { f: `COUNTIF(${rng},$A$${legendFirst + i})`, v: countsOf[p.id][s.code] || 0 }, sInt));
    xlsxSet(ws3, r, 7 + nS, { f: `COUNTIF(${rng},"U")`, v: countsOf[p.id].U || 0 }, sInt);
    xlsxSet(ws3, r, 8 + nS, { f: `COUNTIF(${rng},"K")`, v: countsOf[p.id].K || 0 }, sInt);
    ws3.rowH.set(r, 20);
  });
  const firstP = tHead + 1, lastP = tHead + input.staff.length, totR = lastP + 1;
  xlsxSet(ws3, totR, 1, "Gesamt", sTotLabel);
  const sumOf = (fn) => input.staff.reduce((a, p) => a + fn(p), 0);
  xlsxSet(ws3, totR, 2, { f: `SUM(B${firstP}:B${lastP})`, v: round2(sumOf((p) => round2(stdOf[p.id]))) }, sNumTot);
  const sollTotal = round2(sumOf((p) => round2(input.targets[p.id] || 0)));
  const stdTotal = round2(sumOf((p) => round2(stdOf[p.id])));
  xlsxSet(ws3, totR, 3, { f: `SUM(C${firstP}:C${lastP})`, v: sollTotal }, sNumTot);
  xlsxSet(ws3, totR, 4, { f: `B${totR}-C${totR}`, v: round2(stdTotal - sollTotal) }, sDiffTot);
  xlsxSet(ws3, totR, 5, { f: `SUM(E${firstP}:E${lastP})`, v: sumOf((p) => input.satCount[p.id] || 0) }, sIntB);
  xlsxSet(ws3, totR, 6, { f: `SUM(F${firstP}:F${lastP})`, v: sumOf((p) => input.sunCount[p.id] || 0) }, sIntB);
  input.shifts.forEach((s, i) => { const L = xlsxCol(7 + i); xlsxSet(ws3, totR, 7 + i, { f: `SUM(${L}${firstP}:${L}${lastP})`, v: sumOf((p) => countsOf[p.id][s.code] || 0) }, sIntB); });
  [["U", 7 + nS], ["K", 8 + nS]].forEach(([code, c]) => { const L = xlsxCol(c); xlsxSet(ws3, totR, c, { f: `SUM(${L}${firstP}:${L}${lastP})`, v: sumOf((p) => countsOf[p.id][code] || 0) }, sIntB); });
  ws3.cf.push({ sqref: `D${firstP}:D${totR}`, rules: [{ op: "lessThan", val: "-5", dxf: dxfRed }, { op: "greaterThan", val: "5", dxf: dxfGreen }] });
  ws3.landscape = true;

  // ===== Sheet 4: Hinweise (only if there is something to say) =====
  const sheets = [ws1, ws2, ws3];
  const messages = [...(input.warnings || []).map((t) => ["Hinweis", t]), ...(input.notes || []).map((t) => ["Info", t])];
  if (messages.length) {
    const ws4 = xlsxSheet("Hinweise", "F59E0B");
    ws4.cols = [12, 110];
    xlsxSet(ws4, 1, 1, "Hinweise zum erstellten Plan", sTitle); xlsxMerge(ws4, 1, 1, 1, 2, sTitle); ws4.rowH.set(1, 28);
    xlsxSet(ws4, 3, 1, "Art", sHeadLeft); xlsxSet(ws4, 3, 2, "Text", sHeadLeft);
    const sWarn = st.xf({ font: { b: true, color: "B45309" }, fill: "FEF3C7", border: box, al: { h: "left", v: "center" } });
    const sInfo = st.xf({ font: { color: "475569" }, fill: "F1F5F9", border: box, al: { h: "left", v: "center" } });
    const sMsg = st.xf({ border: box, al: { h: "left", v: "center", wrap: true } });
    messages.forEach(([kind, text], i) => { xlsxSet(ws4, 4 + i, 1, kind, kind === "Hinweis" ? sWarn : sInfo); xlsxSet(ws4, 4 + i, 2, text, sMsg); });
    ws4.landscape = false;
    sheets.push(ws4);
  }
  return xlsxWorkbook(sheets, st);
}
function round2(n) { return Math.round(n * 100) / 100; } // keep exact (2 decimals) so cached values match Excel's own recalculation


// Delivers the generated workbook as a real .xlsx file. On phones/tablets it first tries the
// system share sheet (Save to Files, Numbers, Mail, ...), because embedded viewers often block
// plain downloads; everywhere else (and as a fallback) it is a normal browser download.
async function downloadXlsx(bytes, filename) {
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const ua = navigator.userAgent || "";
  const isTouchDevice = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isTouchDevice && typeof File !== "undefined" && navigator.canShare && navigator.share) {
    try {
      const file = new File([bytes], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // the user closed the share sheet
    }
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function LabShiftSchedulerInner() {
  const [monthValue, setMonthValue] = useState(todayMonthValue());
  const [staffList, setStaffList] = useState(() =>
    Array.from({ length: 9 }, (_, i) => ({ id: `s${i + 1}`, name: `Mitarbeiter ${i + 1}`, weeklyHours: 38.5, employmentType: "full", nightExempt: false, weekendExempt: false, isTeamLead: false, email: "" }))
  );
  const nextIdRef = useRef(10);
  const nextEntryIdRef = useRef(1);
  const [perShiftCount, setPerShiftCount] = useState({ F: 2, S: 1 });
  // F/S keep one special built-in rule between them (no Frühdienst the morning right after a
  // Spätdienst) — label/time fully editable, but the key/role stays fixed so that rule keeps
  // working. Night rotation is NOT tied to a fixed key anymore — see dayShiftDefs below.
  const [specialShifts, setSpecialShifts] = useState({
    F: { label: "Frühdienst", time: "06:00-14:00" },
    S: { label: "Spätdienst", time: "13:30-22:00" },
  });
  // Every other shift is fully user-defined: add/remove/rename/retime freely, each either
  // "daily" or a monthly "quota", and each optionally flagged requiresRestAfter — that flag is
  // what used to be hardcoded to a single "Nachtdienst" slot. Now ANY shift (named whatever the
  // supervisor wants, and there can be none, one, or several) can carry it: once checked, the
  // full night-style treatment applies — 2-4 day blocks, mandatory 2-day rest after, a cooldown
  // before the same person cycles back onto it, and weekend Sat/Sun continuity.
  const [dayShiftDefs, setDayShiftDefs] = useState([]);
  const [holidays, setHolidays] = useState([]); // array of day numbers
  const [leaveEntries, setLeaveEntries] = useState([]); // {id, staffId, days}
  const [sickEntries, setSickEntries] = useState([]); // {id, staffId, days}
  const [leaveDraft, setLeaveDraft] = useState({ staffId: "", days: "" });
  const [sickDraft, setSickDraft] = useState({ staffId: "", days: "" });
  const [wishEntries, setWishEntries] = useState([]); // {id, staffId, days, shiftType}
  const [wishDraft, setWishDraft] = useState({ staffId: "", days: "", shiftType: "F" });
  const [schedule, setSchedule] = useState(null); // {days, hours, satCount, sunCount, target, warnings}
  const [generateError, setGenerateError] = useState(null);
  const [freiWishByStaff, setFreiWishByStaff] = useState({}); // staffId -> Set(day) for "Frei" wishes
  const [copyState, setCopyState] = useState("idle");
  const [excelState, setExcelState] = useState("idle");
  const [emailTableState, setEmailTableState] = useState("idle"); // idle | copied
  const [balances, setBalances] = useState({}); // name(trimmed) -> { hours, satDeficit, sunDeficit, nightDeficit }
  const [balancesLoaded, setBalancesLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveErrorMsg, setSaveErrorMsg] = useState("");
  const [archiveList, setArchiveList] = useState([]); // [{monthValue, staffCount, savedAt}]
  const [archiveState, setArchiveState] = useState("idle"); // idle | saving | saved | error
  const [archiveErrorMsg, setArchiveErrorMsg] = useState("");
  const [viewingArchive, setViewingArchive] = useState(null); // loaded archived month data, or null

  async function refreshArchiveList() {
    try {
      const listRes = await storage.list("schedule-archive:");
      const keys = listRes?.keys || [];
      const entries = [];
      for (const key of keys) {
        try {
          const res = await storage.get(key);
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            entries.push({ monthValue: parsed.monthValue, staffCount: (parsed.staff || []).length, savedAt: parsed.savedAt });
          }
        } catch (_) { /* skip unreadable key */ }
      }
      entries.sort((a, b) => (a.monthValue < b.monthValue ? 1 : -1)); // newest first
      setArchiveList(entries);
    } catch (_) { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      try {
        const listRes = await storage.list("staff-balance:");
        const keys = listRes?.keys || [];
        const map = {};
        for (const key of keys) {
          try {
            const res = await storage.get(key);
            if (res && res.value) {
              const parsed = JSON.parse(res.value);
              const name = parsed.name || key.slice("staff-balance:".length);
              map[name] = {
                hours: parsed.balance || 0,
                satDeficit: parsed.satDeficit || 0,
                sunDeficit: parsed.sunDeficit || 0,
                nightDeficit: parsed.nightDeficit || 0,
              };
            }
          } catch (_) { /* skip unreadable key */ }
        }
        if (!cancelled) { setBalances(map); setBalancesLoaded(true); }
      } catch (_) {
        if (!cancelled) setBalancesLoaded(true);
      }
    }
    loadBalances();
    refreshArchiveList();
    return () => { cancelled = true; };
  }, []);

  // One combined action: archive the month AND carry forward everyone's shortfall (hours,
  // weekend days, night shifts) automatically — so next month's generation picks it up on its
  // own, without a separate step that's easy to forget.
  async function finalizeMonth() {
    if (!schedule) return;
    setArchiveState("saving");
    setArchiveErrorMsg("");
    setSaveErrorMsg("");
    try {
      const payload = {
        monthValue,
        savedAt: new Date().toISOString(),
        staff: staffList.map((s) => ({ id: s.id, name: s.name })),
        days: schedule.days,
        hours: schedule.hours,
        satCount: schedule.satCount,
        sunCount: schedule.sunCount,
        targetOf: schedule.targetOf,
      };
      await storage.set(`schedule-archive:${monthValue}`, JSON.stringify(payload));
      await refreshArchiveList();

      // Fair-share night count this month, among staff actually eligible for nights, used as the
      // benchmark for next month's night-count catch-up.
      const nightEligible = staffList.filter((s) => !s.nightExempt);
      const nightCountOf = {};
      // "Night" here means any shift flagged requiresRestAfter (there may be none, one, or several).
      staffList.forEach((s) => {
        nightCountOf[s.id] = schedule.days.filter((d) => restRequiringKeys.some((k) => (d.shifts[k] || []).includes(s.id))).length;
      });
      const avgNightCount = nightEligible.length > 0 ? nightEligible.reduce((sum, s) => sum + nightCountOf[s.id], 0) / nightEligible.length : 0;

      const updated = { ...balances };
      for (const s of staffList) {
        const name = s.name.trim();
        if (!name) continue;
        const actual = schedule.hours[s.id] || 0;
        const target = schedule.targetOf[s.id] || 0;
        const prev = balances[name] || { hours: 0, satDeficit: 0, sunDeficit: 0, nightDeficit: 0 };
        const newHours = prev.hours + (target - actual); // positive = worked less than target, owed hours
        const newSatDeficit = s.weekendExempt ? 0 : prev.satDeficit + Math.max(0, 2 - (schedule.satCount[s.id] || 0));
        const newSunDeficit = s.weekendExempt ? 0 : prev.sunDeficit + Math.max(0, 2 - (schedule.sunCount[s.id] || 0));
        const newNightDeficit = s.nightExempt ? 0 : prev.nightDeficit + Math.max(0, avgNightCount - nightCountOf[s.id]);
        const entry = { hours: newHours, satDeficit: newSatDeficit, sunDeficit: newSunDeficit, nightDeficit: newNightDeficit };
        updated[name] = entry;
        await storage.set(`staff-balance:${sanitizeKey(name)}`, JSON.stringify({ name, balance: entry.hours, satDeficit: entry.satDeficit, sunDeficit: entry.sunDeficit, nightDeficit: entry.nightDeficit, month: monthValue }));
      }
      setBalances(updated);
      setArchiveState("saved");
      setSaveState("saved");
      setTimeout(() => { setArchiveState("idle"); setSaveState("idle"); }, 2500);
    } catch (err) {
      setArchiveState("error");
      setSaveState("error");
      const msg = (err && err.message) || String(err);
      setArchiveErrorMsg(msg);
      setSaveErrorMsg(msg);
    }
  }

  async function loadArchivedMonth(mv) {
    try {
      const res = await storage.get(`schedule-archive:${mv}`);
      if (res && res.value) setViewingArchive(JSON.parse(res.value));
    } catch (_) { /* ignore */ }
  }

  async function deleteArchivedMonth(mv) {
    try {
      await storage.delete(`schedule-archive:${mv}`);
      if (viewingArchive?.monthValue === mv) setViewingArchive(null);
      await refreshArchiveList();
    } catch (_) { /* ignore */ }
  }

  // (Balance-saving is now part of finalizeMonth(), which also archives the month in one action.)
  async function resetBalances() {
    try {
      const listRes = await storage.list("staff-balance:");
      const keys = listRes?.keys || [];
      for (const key of keys) {
        try { await storage.delete(key); } catch (_) {}
      }
      setBalances({});
    } catch (_) { /* ignore */ }
  }

  const [year, month0] = monthValue.split("-").map((n) => parseInt(n, 10));
  const monthIdx = month0 - 1;
  const totalDays = daysInMonth(year, monthIdx);
  const holidaySet = useMemo(() => new Set(holidays.filter((h) => h <= totalDays)), [holidays, totalDays]);

  // Derived from specialShifts + dayShiftDefs: everything the algorithm and UI need in one place.
  // F/S keep the SAME internal keys (so their adjacency rule keeps working) but fully editable
  // label/time; every other shift — including anything flagged requiresRestAfter — is a freely
  // add/remove/editable entry in dayShiftDefs.
  const shiftMeta = useMemo(() => {
    const meta = {};
    ["F", "S"].forEach((key, i) => {
      const def = specialShifts[key];
      meta[key] = { label: def.label, time: def.time, hours: computeShiftHours(def.time), ...SHIFT_COLOR_PALETTE[i % SHIFT_COLOR_PALETTE.length] };
    });
    dayShiftDefs.forEach((def, i) => {
      meta[def.key] = {
        label: def.label, time: def.time, hours: computeShiftHours(def.time),
        frequency: def.frequency, quotaCount: def.quotaCount, preferLead: def.preferLead, requiresRestAfter: def.requiresRestAfter,
        ...SHIFT_COLOR_PALETTE[(i + 2) % SHIFT_COLOR_PALETTE.length],
      };
    });
    return meta;
  }, [specialShifts, dayShiftDefs]);
  const shiftHours = useMemo(() => {
    const h = {};
    Object.keys(shiftMeta).forEach((k) => { h[k] = shiftMeta[k].hours; });
    return h;
  }, [shiftMeta]);
  const shiftLabels = useMemo(() => {
    const l = {};
    Object.keys(shiftMeta).forEach((k) => { l[k] = shiftMeta[k].label; });
    return l;
  }, [shiftMeta]);
  // Display/column order: Frühdienst, then every user-defined shift (including rest-requiring
  // ones) in their own order, then Spätdienst.
  // Shifts flagged requiresRestAfter (night-style) go AFTER Spätdienst, like a night shift would
  // on a printed roster; every other custom shift sits between Früh and Spät.
  const restRequiringKeys = useMemo(() => dayShiftDefs.filter((d) => d.requiresRestAfter && d.frequency !== "quota").map((d) => d.key), [dayShiftDefs]);
  const dayOrderedKeys = useMemo(
    () => ["F", ...dayShiftDefs.filter((d) => !restRequiringKeys.includes(d.key)).map((d) => d.key), "S", ...restRequiringKeys],
    [dayShiftDefs, restRequiringKeys]
  );
  // Short, unique display code per shift for the compact "nach Mitarbeiter" grid (F and S keep
  // their letters; custom shifts get a code derived from their name instead of their internal key).
  const shiftCodes = useMemo(() => {
    const codes = { F: "F", S: "S" };
    const used = new Set(["F", "S", "U", "K"]);
    dayShiftDefs.forEach((d) => {
      const letters = String(d.label || "").replace(/[^A-Za-zÄÖÜäöüß]/g, "").toUpperCase();
      let code = letters.slice(0, 1) || "X";
      let len = 1;
      while (used.has(code) && len < letters.length) { len++; code = letters.slice(0, len); }
      let n = 2;
      const base = code;
      while (used.has(code)) { code = base + n; n++; }
      used.add(code);
      codes[d.key] = code;
    });
    return codes;
  }, [dayShiftDefs]);
  // Which day-shift-def keys run every regular workday (not a monthly quota, not a rest-requiring
  // shift — those get their own column logic) — used to know which columns go blank on holidays.
  const dailyDayShiftKeys = useMemo(() => new Set(dayShiftDefs.filter((d) => d.frequency !== "quota" && !d.requiresRestAfter).map((d) => d.key)), [dayShiftDefs]);

  // ---- connection to the shared database (only active when the page runs behind the login gate) ----
  const orgCtx = React.useContext(OrgContext);
  const shiftListForDb = dayOrderedKeys.map((k) => {
    const def = dayShiftDefs.find((d) => d.key === k);
    return {
      key: k, label: shiftMeta[k].label, time: shiftMeta[k].time,
      frequency: def ? def.frequency : "daily", quotaCount: def ? def.quotaCount : null, preferLead: def ? !!def.preferLead : false,
      requiresRestAfter: restRequiringKeys.includes(k), runsOnWeekends: !dailyDayShiftKeys.has(k),
    };
  });
  const loadStaffFromDb = (rows) => {
    setStaffList(rows.map((r) => ({
      id: r.id, name: r.name, weeklyHours: Number(r.weekly_hours) || 38.5, employmentType: r.employment_type || "full",
      nightExempt: !!r.night_exempt, weekendExempt: !!r.weekend_exempt, isTeamLead: !!r.is_team_lead, email: r.email || "",
    })));
    setLeaveEntries([]); setSickEntries([]); setWishEntries([]); setSchedule(null);
  };
  const staffToDb = (s) => ({
    email: s.email ? String(s.email).trim() : null, weekly_hours: Number(s.weeklyHours) || 0, employment_type: s.employmentType || "full",
    night_exempt: !!s.nightExempt, weekend_exempt: !!s.weekendExempt, is_team_lead: !!s.isTeamLead,
  });
  // after saving, local ids ("s3") are replaced by the database ids everywhere they are used
  const applyStaffIds = (idMap) => {
    setStaffList((prev) => prev.map((s) => (idMap[s.id] ? { ...s, id: idMap[s.id] } : s)));
    const remap = (prev) => prev.map((e) => (idMap[e.staffId] ? { ...e, staffId: idMap[e.staffId] } : e));
    setLeaveEntries(remap); setSickEntries(remap); setWishEntries(remap); setSchedule(null);
  };


  const staffMap = useMemo(() => {
    const m = {};
    staffList.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [staffList]);

  // Fixed table columns per shift type — one column per slot, matching a printed roster layout.
  // Uses the larger of the configured headcount or whatever actually ended up in the data (e.g. from wishes).
  const columnPlan = useMemo(() => {
    if (!schedule) return [];
    const plan = [];
    dayOrderedKeys.forEach((st) => {
      const maxSlots = Math.max(perShiftCount[st] || 1, ...schedule.days.map((d) => (d.shifts[st] || []).length));
      for (let i = 0; i < maxSlots; i++) plan.push({ shiftType: st, slotIndex: i });
    });
    return plan;
  }, [schedule, perShiftCount, dayOrderedKeys]);
  const absentByDay = useMemo(() => {
    const map = {};
    const addEntries = (entries) => {
      entries.forEach((e) => {
        parseDayList(e.days, totalDays).forEach((d) => {
          const name = staffMap[e.staffId];
          if (!name) return;
          if (!map[d]) map[d] = [];
          if (!map[d].includes(name)) map[d].push(name);
        });
      });
    };
    addEntries(leaveEntries);
    addEntries(sickEntries);
    return map;
  }, [leaveEntries, sickEntries, totalDays, staffMap]);

  // Staff × day matrix (one row per person, one column per day) — an alternate view of the same schedule.
  const [viewMode, setViewMode] = useState("byDay"); // "byDay" | "byStaff"
  const staffDayMatrix = useMemo(() => {
    if (!schedule) return {};
    const matrix = {};
    staffList.forEach((s) => { matrix[s.id] = {}; });
    schedule.days.forEach((d) => {
      dayOrderedKeys.forEach((st) => {
        (d.shifts[st] || []).forEach((id) => { if (matrix[id]) matrix[id][d.day] = shiftCodes[st] || st; });
      });
    });
    leaveEntries.forEach((e) => {
      parseDayList(e.days, totalDays).forEach((day) => {
        if (matrix[e.staffId] && !matrix[e.staffId][day]) matrix[e.staffId][day] = "U";
      });
    });
    sickEntries.forEach((e) => {
      parseDayList(e.days, totalDays).forEach((day) => {
        if (matrix[e.staffId] && !matrix[e.staffId][day]) matrix[e.staffId][day] = "K";
      });
    });
    return matrix;
  }, [schedule, staffList, leaveEntries, sickEntries, totalDays, dayOrderedKeys, shiftCodes]);

  function addStaff() {
    const id = `s${nextIdRef.current++}`;
    setStaffList((prev) => [...prev, { id, name: `Mitarbeiter ${prev.length + 1}`, weeklyHours: 38.5, employmentType: "full", nightExempt: false, weekendExempt: false, isTeamLead: false, email: "" }]);
  }
  async function removeStaff(id) {
    if (orgCtx && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
      if (!window.confirm("Diese Person ist in der Datenbank gespeichert. Wirklich entfernen? Sie wird deaktiviert und erscheint nicht mehr in der Liste. Bisherige Schichten bleiben erhalten.")) return;
      const res = await orgCtx.supabase.from("staff").update({ active: false }).eq("id", id);
      if (res.error) { window.alert("Fehler: " + res.error.message); return; }
    }
    setStaffList((prev) => prev.filter((s) => s.id !== id));
    setLeaveEntries((prev) => prev.filter((e) => e.staffId !== id));
    setSickEntries((prev) => prev.filter((e) => e.staffId !== id));
    setWishEntries((prev) => prev.filter((e) => e.staffId !== id));
  }
  function renameStaff(id, name) {
    setStaffList((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function updateStaffField(id, field, value) {
    setStaffList((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }
  function toggleHoliday(day) {
    setHolidays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function addLeaveEntry() {
    if (!leaveDraft.staffId || !leaveDraft.days.trim()) return;
    setLeaveEntries((prev) => [...prev, { id: `le${nextEntryIdRef.current++}`, staffId: leaveDraft.staffId, days: leaveDraft.days.trim() }]);
    setLeaveDraft({ staffId: "", days: "" });
  }
  function removeLeaveEntry(id) {
    setLeaveEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function addSickEntry() {
    if (!sickDraft.staffId || !sickDraft.days.trim()) return;
    setSickEntries((prev) => [...prev, { id: `se${nextEntryIdRef.current++}`, staffId: sickDraft.staffId, days: sickDraft.days.trim() }]);
    setSickDraft({ staffId: "", days: "" });
  }
  function removeSickEntry(id) {
    setSickEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function addWishEntry() {
    if (!wishDraft.staffId || !wishDraft.days.trim()) return;
    setWishEntries((prev) => [...prev, { id: `we${nextEntryIdRef.current++}`, staffId: wishDraft.staffId, days: wishDraft.days.trim(), shiftType: wishDraft.shiftType }]);
    setWishDraft({ staffId: "", days: "", shiftType: "F" });
  }
  function removeWishEntry(id) {
    setWishEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // Shared by runGenerate and updateSlot so target-hours calculations stay consistent
  // everywhere (leave/sick/Frei days always reduce the target the same way).
  function buildLeaveMap() {
    const leaveMap = {};
    staffList.forEach((s) => { leaveMap[s.id] = new Set(); });
    leaveEntries.forEach((e) => {
      if (!leaveMap[e.staffId]) return;
      parseDayList(e.days, totalDays).forEach((d) => leaveMap[e.staffId].add(d));
    });
    sickEntries.forEach((e) => {
      if (!leaveMap[e.staffId]) return;
      parseDayList(e.days, totalDays).forEach((d) => leaveMap[e.staffId].add(d));
    });
    wishEntries.forEach((e) => {
      if (e.shiftType !== "Frei" || !leaveMap[e.staffId]) return;
      parseDayList(e.days, totalDays).forEach((d) => leaveMap[e.staffId].add(d));
    });
    return leaveMap;
  }

  function runGenerate() {
    if (staffList.length === 0) return;
    setGenerateError(null);
    try {
      const leaveMap = buildLeaveMap();
      // "Frei" wishes mean "don't schedule me at all that day" — already merged into
      // leaveMap above; track them separately too so they aren't shown as formal Urlaub/Krank.
      const freiWishDays = {}; // staffId -> Set(day)
      wishEntries.forEach((e) => {
        if (e.shiftType !== "Frei") return;
        if (!freiWishDays[e.staffId]) freiWishDays[e.staffId] = new Set();
        parseDayList(e.days, totalDays).forEach((d) => freiWishDays[e.staffId].add(d));
      });
      const carryOver = {};
      staffList.forEach((s) => { carryOver[s.id] = balances[s.name.trim()] || { hours: 0, satDeficit: 0, sunDeficit: 0, nightDeficit: 0 }; });
      const wishes = [];
      wishEntries.forEach((e) => {
        if (e.shiftType === "Frei") return; // handled above via leaveMap, not a real shift wish
        parseDayList(e.days, totalDays).forEach((d) => wishes.push({ staffId: e.staffId, day: d, shiftType: e.shiftType }));
      });
      const result = generateSchedule(staffList, year, monthIdx, holidaySet, shiftHours, shiftLabels, dayShiftDefs, perShiftCount, leaveMap, carryOver, wishes);
      // Recompute + validate from the final `days` (same pass used after manual edits) so any
      // rule the generator couldn't fully guarantee up front (e.g. a rare consecutive-workday
      // overrun caused by an already-fixed night block) still surfaces as a warning immediately.
      const stats = computeStatsAndWarnings(result.days, staffList, leaveMap, shiftHours, dayOrderedKeys, restRequiringKeys, shiftLabels);
      setSchedule({
        days: result.days,
        hours: stats.hours,
        satCount: stats.satCount,
        sunCount: stats.sunCount,
        targetOf: stats.targetOf,
        warnings: [...result.warnings, ...stats.warnings],
        notes: result.notes,
      });
      setFreiWishByStaff(freiWishDays);
    } catch (err) {
      setGenerateError((err && err.message) || String(err));
    }
  }

  function updateSlot(dayIndex, shiftType, slotIndex, newId) {
    setSchedule((prev) => {
      if (!prev) return prev;
      const days = prev.days.map((d, i) => {
        if (i !== dayIndex) return d;
        const arr = [...(d.shifts[shiftType] || [])];
        arr[slotIndex] = newId; // keep position stable — columns are now fixed, so never splice/shift
        return { ...d, shifts: { ...d.shifts, [shiftType]: arr } };
      });
      const stats = computeStatsAndWarnings(days, staffList, buildLeaveMap(), shiftHours, dayOrderedKeys, restRequiringKeys, shiftLabels);
      return { days, ...stats };
    });
  }

  const demandSummary = useMemo(() => {
    if (!schedule) return null;
    let totalDemandHours = 0;
    schedule.days.forEach((d) => {
      const reduced = d.isWeekend || d.isHoliday;
      totalDemandHours += shiftHours.F * (reduced ? 1 : perShiftCount.F || 1) + shiftHours.S * (reduced ? 1 : perShiftCount.S || 1);
      dayShiftDefs.forEach((def) => {
        if (def.frequency === "quota") return;
        // Rest-requiring (night-style) shifts run every day, including weekends/holidays (1 person
        // then); other daily shifts only run on regular workdays.
        if (def.requiresRestAfter) totalDemandHours += (shiftHours[def.key] || 0) * (reduced ? 1 : (perShiftCount[def.key] || 1));
        else if (!reduced) totalDemandHours += (shiftHours[def.key] || 0) * (perShiftCount[def.key] || 1);
      });
    });
    dayShiftDefs.forEach((def) => {
      if (def.frequency === "quota") totalDemandHours += (shiftHours[def.key] || 0) * (def.quotaCount || 9);
    });
    const avgActual = staffList.length > 0
      ? staffList.reduce((s, p) => s + (schedule.hours[p.id] || 0), 0) / staffList.length
      : 0;
    const avgTarget = staffList.length > 0
      ? staffList.reduce((s, p) => s + (schedule.targetOf[p.id] || 0), 0) / staffList.length
      : 0;
    const suggestedStaff = avgTarget > 0 ? Math.round(totalDemandHours / avgTarget) : 0;
    return { totalDemandHours, avgActual, avgTarget, suggestedStaff };
  }, [schedule, staffList, perShiftCount, shiftHours, dayShiftDefs]);

  function buildScheduleText() {
    if (!schedule) return "";
    const lines = [];
    if (viewMode === "byStaff") {
      lines.push(`Wunschplan ${MONTH_DE[monthIdx]} ${year} — nach Mitarbeiter`);
      const header = ["Mitarbeiter", ...schedule.days.map((d) => `${d.day} ${WEEKDAY_DE[d.weekday].slice(0, 2)}`)];
      lines.push(header.join("\t"));
      staffList.forEach((s) => {
        const row = [s.name, ...schedule.days.map((d) => staffDayMatrix[s.id]?.[d.day] || "")];
        lines.push(row.join("\t"));
      });
    } else {
      lines.push(`Wunschplan ${MONTH_DE[monthIdx]} ${year}`);
      const header = ["Tag", "Wochentag"];
      columnPlan.forEach((col) => header.push(`${shiftMeta[col.shiftType].label} ${shiftMeta[col.shiftType].time}`));
      header.push("Urlaub/Überstundenfrei");
      lines.push(header.join("\t"));
      schedule.days.forEach((d) => {
        const row = [d.day, WEEKDAY_DE[d.weekday]];
        columnPlan.forEach((col) => {
          const isSkippedOnHoliday = dailyDayShiftKeys.has(col.shiftType) && (d.isHoliday || d.isWeekend);
          const id = (d.shifts[col.shiftType] || [])[col.slotIndex];
          row.push(isSkippedOnHoliday ? "" : (staffMap[id] || ""));
        });
        row.push((absentByDay[d.day] || []).join("/"));
        lines.push(row.join("\t"));
      });
    }
    lines.push("");
    lines.push("Gesamtstunden pro Mitarbeiter:");
    staffList.forEach((s) => lines.push(`${s.name}\t${(schedule.hours[s.id] || 0).toFixed(1)} Std. (Ziel ${(schedule.targetOf[s.id] || 0).toFixed(1)})\tSamstag:${schedule.satCount[s.id] || 0}\tSonntag:${schedule.sunCount[s.id] || 0}`));
    return lines.join("\n");
  }

  async function downloadExcel() {
    if (!schedule) return;
    try {
      const codeOf = (k) => (typeof shiftCodes !== "undefined" && shiftCodes[k]) || k;
      const shifts = dayOrderedKeys.map((k) => ({ key: k, code: codeOf(k), label: shiftMeta[k].label, time: shiftMeta[k].time, hours: shiftMeta[k].hours, hex: shiftMeta[k].hex }));
      const columns = columnPlan.map((c) => ({ key: c.shiftType, label: shiftMeta[c.shiftType].label, time: shiftMeta[c.shiftType].time, slotIndex: c.slotIndex }));
      const now = new Date();
      const bytes = buildScheduleXlsx({
        title: `Dienstplan — ${MONTH_DE[monthIdx]} ${year}`,
        subtitle: `Erstellt am ${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()} · ${staffList.length} Mitarbeitende`,
        weekdayNames: WEEKDAY_DE,
        weekdayShort: WEEKDAY_DE.map((x) => x.slice(0, 2)),
        staff: staffList.map((s) => ({ id: s.id, name: s.name })),
        days: schedule.days,
        columns,
        shifts,
        skipKeys: dailyDayShiftKeys,
        quotaKeys: new Set(dayShiftDefs.filter((d) => d.frequency === "quota").map((d) => d.key)),
        matrix: staffDayMatrix,
        nameOf: staffMap,
        absentByDay,
        hours: schedule.hours,
        targets: schedule.targetOf,
        satCount: schedule.satCount,
        sunCount: schedule.sunCount,
        warnings: schedule.warnings || [],
        notes: schedule.notes || [],
      });
      await downloadXlsx(bytes, `Dienstplan_${year}-${String(monthIdx + 1).padStart(2, "0")}.xlsx`);
      setExcelState("done");
      setTimeout(() => setExcelState("idle"), 6000);
    } catch (err) {
      console.error(err);
      setExcelState("error");
      setTimeout(() => setExcelState("idle"), 6000);
    }
  }

  function copyAsText() {
    if (!schedule) return;
    const text = buildScheduleText();
    navigator.clipboard?.writeText(text).then(
      () => { setCopyState("done"); setTimeout(() => setCopyState("idle"), 2000); },
      () => setCopyState("idle")
    );
  }

  function buildStaffEmailBody(staff) {
    // mailto: bodies are plain text only — no real HTML tables. This uses padded columns so
    // it still lines up like a table in most mail apps, while staying short enough that long
    // mailto: links don't silently fail to open.
    const lines = [];
    lines.push(`Hallo ${staff.name},`);
    lines.push("");
    lines.push(`Dienstplan ${MONTH_DE[monthIdx]} ${year}:`);
    lines.push("");
    lines.push("Tag  Wochentag   Schicht");
    lines.push("---  ----------  -----------");
    schedule.days.forEach((d) => {
      dayOrderedKeys.forEach((st) => {
        if ((d.shifts[st] || []).includes(staff.id)) {
          lines.push(`${String(d.day).padEnd(5)}${WEEKDAY_DE[d.weekday].padEnd(12)}${shiftMeta[st].label}`);
        }
      });
    });
    lines.push("");
    const h = schedule.hours[staff.id] || 0;
    const t = schedule.targetOf[staff.id] || 0;
    lines.push(`Stunden: ${h.toFixed(1)} / ${t.toFixed(1)} (Ziel)`);
    lines.push(`Samstage: ${schedule.satCount[staff.id] || 0}   Sonntage: ${schedule.sunCount[staff.id] || 0}`);
    lines.push("");
    lines.push("Gruß");
    return lines.join("\n");
  }

  function buildMailtoUrl(staff) {
    if (!schedule || !staff.email) return "";
    const subject = `Dienstplan ${MONTH_DE[monthIdx]} ${year}`;
    const body = buildStaffEmailBody(staff);
    return `mailto:${encodeURIComponent(staff.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // The full multi-person table is too long to fit reliably in a mailto: body (many mail
  // apps silently refuse very long mailto: links). So instead: copy the whole table to the
  // clipboard (via the onClick, which still runs on a real click), and let the anchor's own
  // href open a blank e-mail with just the subject filled in — the admin pastes the table in
  // themselves, which works regardless of size and avoids programmatic-navigation blocking.
  function fullTableMailtoUrl() {
    const subject = `Dienstplan ${MONTH_DE[monthIdx]} ${year}${viewMode === "byStaff" ? " — nach Mitarbeiter" : ""}`;
    return `mailto:?subject=${encodeURIComponent(subject)}`;
  }
  function copyFullTableForEmail() {
    if (!schedule) return;
    navigator.clipboard?.writeText(buildScheduleText()).then(() => {
      setEmailTableState("copied");
      setTimeout(() => setEmailTableState("idle"), 4000);
    });
  }

  return (
    <div dir="ltr" className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-teal-700">
            <ClipboardList size={22} />
            <h1 className="text-xl font-bold">Dienstplaner</h1>
          </div>
          <p className="text-sm text-slate-500">Frei definierbare Schichten unter Berücksichtigung der Wochenstunden, der Nachtdienstrotation und der Wochenendquote — nach dem Erstellen manuell bearbeitbar.</p>
        </header>

        {orgCtx && <OrgBar onLoadStaff={loadStaffFromDb} staffList={staffList} toDb={staffToDb} onIdsChanged={applyStaffIds} year={year} monthIdx={monthIdx} />}

        {/* Archive */}
        {archiveList.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Archiv gespeicherter Monate</h2>
            <div className="flex flex-wrap gap-1.5">
              {archiveList.map((a) => {
                const [ay, am] = a.monthValue.split("-").map((n) => parseInt(n, 10));
                const label = `${MONTH_DE[am - 1]} ${ay}`;
                const isOpen = viewingArchive?.monthValue === a.monthValue;
                return (
                  <span key={a.monthValue} className={`inline-flex items-center gap-1.5 border text-xs rounded-full pl-1 pr-2.5 py-1 ${isOpen ? "bg-sky-100 border-sky-300 text-sky-800" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <button onClick={() => (isOpen ? setViewingArchive(null) : loadArchivedMonth(a.monthValue))} className="hover:underline">
                      {label} ({a.staffCount} MA)
                    </button>
                    <button onClick={() => deleteArchivedMonth(a.monthValue)} className="hover:text-rose-600 rounded-full p-0.5" aria-label="Löschen">
                      <Trash2 size={12} />
                    </button>
                  </span>
                );
              })}
            </div>

            {viewingArchive && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold text-slate-600 mb-2">
                  {(() => { const [ay, am] = viewingArchive.monthValue.split("-").map((n) => parseInt(n, 10)); return `${MONTH_DE[am - 1]} ${ay}`; })()} — nur zur Ansicht (nicht bearbeitbar)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Tag</th>
                        <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Wochentag</th>
                        {dayOrderedKeys.map((st) => (
                          <th key={st} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{shiftMeta[st].label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewingArchive.days.map((d) => {
                        const nameOfArchived = (id) => viewingArchive.staff.find((s) => s.id === id)?.name || "";
                        return (
                          <tr key={d.day} className="border-b border-slate-50">
                            <td className="px-2 py-1 whitespace-nowrap font-medium">{d.day}</td>
                            <td className="px-2 py-1 whitespace-nowrap text-slate-500">{WEEKDAY_DE[d.weekday]}</td>
                            {dayOrderedKeys.map((st) => (
                              <td key={st} className="px-2 py-1 whitespace-nowrap">{(d.shifts[st] || []).map(nameOfArchived).filter(Boolean).join(", ")}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Setup card */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                <Calendar size={16} /> Planungsmonat
              </label>
              <input
                type="month"
                value={monthValue}
                onChange={(e) => { setMonthValue(e.target.value); setSchedule(null); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-slate-400 mt-1">{MONTH_DE[monthIdx]} {year} — {totalDays} Tage</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Benötigte Personen je Schicht (gleichzeitig)</label>
              <div className="grid grid-cols-4 gap-2">
                {["F", ...dayShiftDefs.filter((d) => d.frequency !== "quota").map((d) => d.key), "S"].map((st) => (
                  <div key={st} className="text-center">
                    <div className={`text-[11px] mb-1 ${shiftMeta[st].text}`}>{shiftMeta[st].label}</div>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={perShiftCount[st] || 1}
                      onChange={(e) => setPerShiftCount((p) => ({ ...p, [st]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>
              {dayShiftDefs.some((d) => d.frequency === "quota") && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {dayShiftDefs.filter((d) => d.frequency === "quota").map((d) => `${d.label} (${d.quotaCount || 9}x/Monat)`).join(", ")} laufen separat, bevorzugt die Teamleitung, sonst wer am wenigsten Schichten hat.
                </p>
              )}
            </div>
          </div>

          {/* Shift definitions: F/S keep their one special rule (adjacency) but are fully
              renameable/retimeable; every other shift is freely add/remove/editable, and the
              system always ASKS (via the checkbox below) whether a given shift needs the 2-day
              mandatory rest afterward — that's no longer tied to any fixed "night" slot. */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Schichtzeiten</label>
            <div className="space-y-2">
              {["F", "S"].map((key) => (
                <div key={key} className="grid grid-cols-[auto,1fr,1fr,auto] gap-1.5 items-center bg-slate-50/60 rounded-lg p-2">
                  <span className={`text-[11px] font-medium px-1.5 ${shiftMeta[key].text}`}>{key}</span>
                  <input
                    value={specialShifts[key].label}
                    onChange={(e) => setSpecialShifts((p) => ({ ...p, [key]: { ...p[key], label: e.target.value } }))}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    value={specialShifts[key].time}
                    onChange={(e) => setSpecialShifts((p) => ({ ...p, [key]: { ...p[key], time: e.target.value } }))}
                    placeholder="06:00-14:00"
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">{shiftMeta[key].hours.toFixed(1)} Std.</span>
                </div>
              ))}
              {dayShiftDefs.map((def, idx) => {
                const guessedNight = /nacht|night|graveyard/i.test(def.label || "") || (() => {
                  const t = parseTimeRange(def.time);
                  return !!t && t.endMin <= t.startMin;
                })();
                return (
                <div key={def.key} className="bg-slate-50/60 rounded-lg p-2 space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto,auto,auto] gap-1.5 items-center">
                    <input
                      value={def.label}
                      onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, label: e.target.value } : d)))}
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Name"
                    />
                    <input
                      value={def.time}
                      onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, time: e.target.value } : d)))}
                      placeholder="08:00-16:00"
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <select
                      value={def.frequency}
                      onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, frequency: e.target.value } : d)))}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="daily">Täglich</option>
                      <option value="quota">Kontingent/Monat</option>
                    </select>
                    {def.frequency === "quota" ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={def.quotaCount || 9}
                          onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, quotaCount: Math.max(1, parseInt(e.target.value) || 1) } : d)))}
                          className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                          title="Wie oft pro Monat"
                        />
                        <label className="flex items-center gap-1 text-[10px] text-fuchsia-700 whitespace-nowrap" title="Bevorzugt die als „Teamleitung“ markierte Person">
                          <input type="checkbox" checked={!!def.preferLead} onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, preferLead: e.target.checked } : d)))} />
                          Leitung
                        </label>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-mono">{computeShiftHours(def.time).toFixed(1)} Std.</span>
                    )}
                    <button onClick={() => setDayShiftDefs((prev) => prev.filter((_, i) => i !== idx))} className="justify-self-end text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50" aria-label="Entfernen">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {def.frequency !== "quota" && (
                    <label className="flex items-start gap-1.5 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={!!def.requiresRestAfter}
                        onChange={(e) => setDayShiftDefs((prev) => prev.map((d, i) => (i === idx ? { ...d, requiresRestAfter: e.target.checked } : d)))}
                      />
                      <span>
                        Braucht diese Schicht danach mindestens 2 Tage Pause? (z. B. bei Nachtschichten)
                        {guessedNight && !def.requiresRestAfter && <span className="text-indigo-500"> — sieht nach einer Nachtschicht aus, evtl. ankreuzen?</span>}
                      </span>
                    </label>
                  )}
                </div>
                );
              })}
            </div>
            <button
              onClick={() => setDayShiftDefs((prev) => [...prev, { key: `custom${Date.now()}`, label: "Neue Schicht", time: "08:00-16:00", frequency: "daily", requiresRestAfter: false }])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium"
            >
              <Plus size={15} /> Schicht hinzufügen
            </button>
          </div>

          {/* Staff list */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
              <Users size={16} /> Mitarbeiter ({staffList.length})
            </label>
            <div className="hidden sm:grid grid-cols-[1.1fr,1.3fr,0.8fr,1.6fr,auto] gap-2 text-[11px] text-slate-400 px-1 mb-1">
              <span>Name</span>
              <span>E-Mail (für Dienstplan-Versand)</span>
              <span>Wochenstunden</span>
              <span>Beschäftigungsart / Ausnahmen</span>
              <span></span>
            </div>
            <div className="space-y-2">
              {staffList.map((s) => (
                <div key={s.id} className="grid grid-cols-1 sm:grid-cols-[1.1fr,1.3fr,0.8fr,1.6fr,auto] gap-1.5 items-center bg-slate-50/60 sm:bg-transparent rounded-lg p-2 sm:p-0">
                  <input
                    value={s.name}
                    onChange={(e) => renameStaff(s.id, e.target.value)}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="email"
                    value={s.email || ""}
                    onChange={(e) => updateStaffField(s.id, "email", e.target.value)}
                    placeholder="name@firma.de"
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={s.weeklyHours}
                      onChange={(e) => setStaffList((prev) => prev.map((p) => (p.id === s.id ? { ...p, weeklyHours: Math.max(0, parseFloat(e.target.value) || 0), employmentType: null } : p)))}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <span className="text-[11px] text-slate-400">Std.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <div className="flex gap-1">
                      {[
                        { key: "full", label: "Vollzeit", hours: 38.5 },
                        { key: "part", label: "Teilzeit", hours: 20 },
                        { key: "mini", label: "Minijob", hours: 10 },
                      ].map((opt) => {
                        const active = s.employmentType === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setStaffList((prev) => prev.map((p) => (p.id === s.id ? { ...p, weeklyHours: opt.hours, employmentType: opt.key } : p)))}
                            className={`px-1.5 py-0.5 rounded-full border transition-colors ${
                              active
                                ? "bg-teal-600 border-teal-600 text-white"
                                : "border-slate-200 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-1 text-slate-500">
                      <input type="checkbox" checked={!!s.nightExempt} onChange={(e) => updateStaffField(s.id, "nightExempt", e.target.checked)} />
                      Befreit von Nachtschichten (Schichten mit Ruhepflicht)
                    </label>
                    <label className="flex items-center gap-1 text-slate-500">
                      <input type="checkbox" checked={!!s.weekendExempt} onChange={(e) => updateStaffField(s.id, "weekendExempt", e.target.checked)} />
                      Befreit von Wochenendquote
                    </label>
                    <label className="flex items-center gap-1 text-fuchsia-700">
                      <input type="checkbox" checked={!!s.isTeamLead} onChange={(e) => updateStaffField(s.id, "isTeamLead", e.target.checked)} />
                      Teamleitung (bevorzugt für Kontingent-Schichten)
                    </label>
                  </div>
                  <button onClick={() => removeStaff(s.id)} className="justify-self-end sm:justify-self-auto text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50" aria-label="Entfernen">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addStaff} className="mt-2 inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium">
              <Plus size={15} /> Mitarbeiter hinzufügen
            </button>
          </div>

          {/* Leave (Urlaub) */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Urlaub</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {leaveEntries.length === 0 && <span className="text-xs text-slate-400">Bisher ist kein Urlaub eingetragen</span>}
              {leaveEntries.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-800 text-xs rounded-full pl-1 pr-2.5 py-1">
                  {staffMap[e.staffId] || "?"} — Tag <span className="font-mono">{e.days}</span>
                  <button onClick={() => removeLeaveEntry(e.id)} className="text-sky-400 hover:text-rose-600 rounded-full p-0.5" aria-label="Entfernen">
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select
                value={leaveDraft.staffId}
                onChange={(e) => setLeaveDraft((d) => ({ ...d, staffId: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Mitarbeiter auswählen...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                value={leaveDraft.days}
                onChange={(e) => setLeaveDraft((d) => ({ ...d, days: e.target.value }))}
                placeholder="Tage, z. B. 5,6,7 oder 5-9"
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button onClick={addLeaveEntry} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium px-2 py-1.5">
                <Plus size={15} /> Hinzufügen
              </button>
            </div>
          </div>

          {/* Sick (Krank) */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Krank</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {sickEntries.length === 0 && <span className="text-xs text-slate-400">Bisher ist niemand krankgemeldet</span>}
              {sickEntries.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-800 text-xs rounded-full pl-1 pr-2.5 py-1">
                  {staffMap[e.staffId] || "?"} — Tag <span className="font-mono">{e.days}</span>
                  <button onClick={() => removeSickEntry(e.id)} className="text-orange-400 hover:text-rose-600 rounded-full p-0.5" aria-label="Entfernen">
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select
                value={sickDraft.staffId}
                onChange={(e) => setSickDraft((d) => ({ ...d, staffId: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Mitarbeiter auswählen...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                value={sickDraft.days}
                onChange={(e) => setSickDraft((d) => ({ ...d, days: e.target.value }))}
                placeholder="Tage, z. B. 5,6,7 oder 5-9"
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button onClick={addSickEntry} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium px-2 py-1.5">
                <Plus size={15} /> Hinzufügen
              </button>
            </div>
          </div>

          {/* Wishes (Wünsche): fixed shift requests, honored before the rest is auto-scheduled */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Wünsche</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {wishEntries.length === 0 && <span className="text-xs text-slate-400">Noch keine Schichtwünsche eingetragen</span>}
              {wishEntries.map((e) => {
                const isFrei = e.shiftType === "Frei";
                const chipClass = isFrei ? "bg-slate-100 text-slate-700 border-slate-300" : shiftMeta[e.shiftType].chip;
                const label = isFrei ? "Frei" : shiftMeta[e.shiftType].label;
                return (
                  <span key={e.id} className={`inline-flex items-center gap-1.5 border text-xs rounded-full pl-1 pr-2.5 py-1 ${chipClass}`}>
                    {staffMap[e.staffId] || "?"} — {label}, Tag <span className="font-mono">{e.days}</span>
                    <button onClick={() => removeWishEntry(e.id)} className="hover:text-rose-600 rounded-full p-0.5" aria-label="Entfernen">
                      <Trash2 size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select
                value={wishDraft.staffId}
                onChange={(e) => setWishDraft((d) => ({ ...d, staffId: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Mitarbeiter auswählen...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={wishDraft.shiftType}
                onChange={(e) => setWishDraft((d) => ({ ...d, shiftType: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {dayOrderedKeys.map((st) => (
                  <option key={st} value={st}>{shiftMeta[st].label}</option>
                ))}
                <option value="Frei">Frei (kein Dienst, keine Schicht)</option>
              </select>
              <input
                value={wishDraft.days}
                onChange={(e) => setWishDraft((d) => ({ ...d, days: e.target.value }))}
                placeholder="Tage, z. B. 5,6,7 oder 5-9"
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button onClick={addWishEntry} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium px-2 py-1.5">
                <Plus size={15} /> Hinzufügen
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Diese Schichten werden zuerst fest eingetragen; alle übrigen Schichten plant der Algorithmus automatisch drumherum.</p>
          </div>

          {/* Holidays */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Gesetzliche Feiertage in diesem Monat (Tage anklicken)</label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
                const wd = new Date(year, monthIdx, d).getDay();
                const isWeekend = wd === 0 || wd === 6;
                const active = holidaySet.has(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleHoliday(d)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? "bg-rose-500 border-rose-500 text-white"
                        : isWeekend
                        ? "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    title={WEEKDAY_DE[wd]}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Carried-over balances from previous months */}
          {balancesLoaded && Object.values(balances).some((v) => Math.abs(v.hours || 0) > 0.05 || (v.satDeficit || 0) > 0 || (v.sunDeficit || 0) > 0 || (v.nightDeficit || 0) > 0) && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-xs">
              <div className="font-medium text-violet-800 mb-1.5">Saldo aus Vormonaten (wird für diesen Monat berücksichtigt)</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(balances)
                  .filter(([, v]) => Math.abs(v.hours || 0) > 0.05 || (v.satDeficit || 0) > 0 || (v.sunDeficit || 0) > 0 || (v.nightDeficit || 0) > 0)
                  .map(([name, v]) => {
                    const parts = [];
                    if (Math.abs(v.hours || 0) > 0.05) parts.push(`${v.hours > 0 ? "+" : ""}${v.hours.toFixed(1)} Std.`);
                    if ((v.satDeficit || 0) > 0) parts.push(`${v.satDeficit.toFixed(1)} Sa offen`);
                    if ((v.sunDeficit || 0) > 0) parts.push(`${v.sunDeficit.toFixed(1)} So offen`);
                    if ((v.nightDeficit || 0) > 0) parts.push(`${v.nightDeficit.toFixed(1)} Nächte offen`);
                    return (
                      <span key={name} className={`rounded-full px-2.5 py-1 border ${(v.hours || 0) >= 0 ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-rose-200 text-rose-700"}`}>
                        {name}: {parts.join(", ")}
                      </span>
                    );
                  })}
              </div>
              <button onClick={resetBalances} className="mt-2 text-violet-500 hover:text-rose-600 underline">Alle Salden löschen</button>
            </div>
          )}

          <button
            onClick={runGenerate}
            disabled={staffList.length === 0}
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            <RefreshCw size={16} /> {schedule ? "Neu generieren" : "Dienstplan erstellen"}
          </button>

          {generateError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <strong>Fehler beim Erstellen des Plans:</strong>
              <div className="mt-1 font-mono whitespace-pre-wrap">{generateError}</div>
              <div className="mt-1 text-rose-600">Bitte diese Meldung weitergeben, damit sie behoben werden kann.</div>
            </div>
          )}
        </section>

        {schedule && demandSummary && (
          <>
            {/* Info banner */}
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex gap-3 text-sm text-teal-900">
              <Info size={18} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Bei <span className="font-mono">{staffList.length}</span> Mitarbeitern und der aktuellen Schichtbesetzung liegt die tatsächliche Durchschnittsstundenzahl pro Person bei
                  <span className="font-mono font-semibold"> {demandSummary.avgActual.toFixed(1)} </span>
                  Std.; das durchschnittliche Stundenziel pro Person (unter Berücksichtigung von Vollzeit/Teilzeit/Minijob) liegt bei <span className="font-mono font-semibold">{demandSummary.avgTarget.toFixed(1)}</span> Std.
                </p>
                {demandSummary.avgTarget > 0 && Math.abs(demandSummary.avgActual - demandSummary.avgTarget) / demandSummary.avgTarget > 0.1 && (
                  <p className="text-teal-700">
                    Um das Stundenziel mit der aktuellen Schichtbesetzung genau zu erreichen, wären etwa
                    <span className="font-mono font-semibold"> {demandSummary.suggestedStaff} </span>
                    Mitarbeiter empfohlen. Alternativ können Sie die Anzahl der Personen je Schicht erhöhen oder diese Abweichung als Überlappung/Teilzeitarbeit akzeptieren.
                  </p>
                )}
              </div>
            </div>

            {/* Warnings */}
            <div className={`rounded-2xl border p-4 ${schedule.warnings.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <div className={`flex items-center gap-2 text-sm font-medium ${schedule.warnings.length ? "text-amber-800" : "text-emerald-800"}`}>
                {schedule.warnings.length ? <AlertTriangle size={16} /> : <Check size={16} />}
                {schedule.warnings.length ? `${schedule.warnings.length} Punkte müssen überprüft werden` : "Alle Regeln eingehalten"}
              </div>
              {schedule.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-800 max-h-40 overflow-y-auto">
                  {schedule.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>

            {schedule.notes && schedule.notes.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Info size={16} /> {schedule.notes.length} Tage wurden wegen Personalmangel/Urlaub mit weniger als der idealen Personenzahl besetzt
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-500 max-h-32 overflow-y-auto">
                  {schedule.notes.map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Schedule table */}
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-slate-700">Dienstplan — {MONTH_DE[monthIdx]} {year}</h2>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                    <button
                      onClick={() => setViewMode("byDay")}
                      className={`px-2.5 py-1 ${viewMode === "byDay" ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      Nach Tag
                    </button>
                    <button
                      onClick={() => setViewMode("byStaff")}
                      className={`px-2.5 py-1 ${viewMode === "byStaff" ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      Nach Mitarbeiter
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={finalizeMonth}
                    disabled={archiveState === "saving"}
                    className="inline-flex items-center gap-1.5 text-xs text-sky-700 hover:text-sky-800 border border-sky-200 bg-sky-50 rounded-lg px-2.5 py-1.5 hover:bg-sky-100 disabled:opacity-60"
                    title="Archiviert den Monat und überträgt automatisch Stunden-, Wochenend- und Nachtdienst-Saldo für den nächsten Monat"
                  >
                    {archiveState === "saved" ? <Check size={14} /> : <ClipboardList size={14} />}
                    {archiveState === "saving" ? "Wird gespeichert..." : archiveState === "saved" ? "Gespeichert & Saldo übertragen" : archiveState === "error" ? "Fehler, bitte erneut versuchen" : "Monat abschließen & archivieren"}
                  </button>
                  <button onClick={copyAsText} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-teal-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                    {copyState === "done" ? <Check size={14} /> : <Copy size={14} />}
                    {copyState === "done" ? "Kopiert" : "Als Text kopieren (für Excel)"}
                  </button>
                  <button onClick={downloadExcel} title="Schön formatierte Excel-Datei mit Plan, Mitarbeiter-Übersicht und Zusammenfassung" className="inline-flex items-center gap-1.5 text-xs text-emerald-800 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100">
                    {excelState === "done" ? <Check size={14} /> : <Copy size={14} />}
                    {excelState === "done" ? "Excel-Datei erstellt" : excelState === "error" ? "Excel-Export fehlgeschlagen" : "Als Excel herunterladen (.xlsx)"}
                  </button>
                  <a
                    href={fullTableMailtoUrl()}
                    onClick={copyFullTableForEmail}
                    title="Kopiert die ganze Tabelle und öffnet eine leere E-Mail zum Einfügen"
                    className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-teal-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 no-underline"
                  >
                    {emailTableState === "copied" ? <Check size={14} /> : <Info size={14} />}
                    {emailTableState === "copied" ? "Kopiert — jetzt in die E-Mail einfügen" : "Ganze Tabelle per E-Mail"}
                  </a>
                </div>
              </div>
              {orgCtx && <PublishPanel schedule={schedule} staffList={staffList} year={year} monthIdx={monthIdx} shiftList={shiftListForDb} />}
              {(archiveState === "error" || saveState === "error") && (
                <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {archiveState === "error" && (
                    <div className="mb-1"><strong>Archivieren fehlgeschlagen:</strong> <span className="font-mono">{archiveErrorMsg}</span></div>
                  )}
                  {saveState === "error" && (
                    <div className="mb-1"><strong>Speichern fehlgeschlagen:</strong> <span className="font-mono">{saveErrorMsg}</span></div>
                  )}
                  <div className="text-rose-600">
                    Diese Funktionen speichern Daten lokal in diesem Browser. In einem anderen Browser oder auf einem anderen Gerät sind sie nicht sichtbar.
                    Bis das geklärt ist, am besten „Als Text kopieren" nutzen, um die Daten extern (z. B. in Excel) zu sichern.
                  </div>
                </div>
              )}
              {viewMode === "byStaff" ? (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="sticky left-0 bg-slate-50 px-2 py-2 text-left font-medium whitespace-nowrap z-10 border-r border-slate-200">Mitarbeiter</th>
                      {schedule.days.map((d) => (
                        <th key={d.day} className={`px-1.5 py-2 text-center font-medium whitespace-nowrap w-9 ${d.isWeekend || d.isHoliday ? "bg-slate-100" : ""}`}>
                          <div>{d.day}</div>
                          <div className="text-[9px] text-slate-400 font-normal">{WEEKDAY_DE[d.weekday].slice(0, 2)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50">
                        <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap font-medium border-r border-slate-200">{s.name}</td>
                        {schedule.days.map((d) => {
                          const code = staffDayMatrix[s.id]?.[d.day];
                          return (
                            <td key={d.day} className={`px-1.5 py-1.5 text-center ${d.isWeekend || d.isHoliday ? "bg-slate-50/70" : ""} ${code === "U" || code === "K" ? "text-rose-500" : "text-slate-700"}`}>
                              {code || ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-400 mt-2 px-2">
                  {dayOrderedKeys.map((k) => `${shiftCodes[k]} = ${shiftMeta[k].label}`).join(" · ")} · U = Urlaub · K = Krank
                </p>
              </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Tag</th>
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Wochentag</th>
                      {columnPlan.map((col, ci) => (
                        <th key={ci} className={`px-2 py-2 text-left font-medium whitespace-nowrap ${shiftMeta[col.shiftType].text}`}>
                          <span dir="ltr">{shiftMeta[col.shiftType].label}</span>
                          <div className="font-normal text-slate-400">{shiftMeta[col.shiftType].time}</div>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-slate-600">Urlaub/Überstundenfrei</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.days.map((d, di) => (
                      <tr
                        key={d.day}
                        className={`border-b border-slate-50 ${d.isHoliday ? "bg-rose-50/60" : d.isWeekend ? "bg-slate-50/70" : ""}`}
                      >
                        <td className="px-2 py-1.5 whitespace-nowrap align-top font-semibold">{d.day}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap align-top text-slate-500">
                          {WEEKDAY_DE[d.weekday]}
                          {d.isHoliday && <div className="text-rose-600 font-medium text-[10px]">Feiertag</div>}
                        </td>
                        {columnPlan.map((col, ci) => {
                          const { shiftType: st, slotIndex } = col;
                          const isSkippedOnHoliday = dailyDayShiftKeys.has(st) && (d.isHoliday || d.isWeekend);
                          const val = (d.shifts[st] || [])[slotIndex];
                          return (
                            <td key={ci} className="px-2 py-1.5 align-top">
                              {isSkippedOnHoliday ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                <select
                                  value={val || ""}
                                  onChange={(e) => updateSlot(di, st, slotIndex, e.target.value)}
                                  className={`w-full text-[11px] rounded-md border px-1.5 py-1 ${val ? shiftMeta[st].chip : "bg-slate-50 border-slate-200 text-slate-400"}`}
                                >
                                  <option value="">— leer —</option>
                                  {staffList.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 align-top text-slate-600 whitespace-nowrap">
                          {(absentByDay[d.day] || []).join(" / ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </section>

            {/* Per-staff summary */}
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Zusammenfassung pro Mitarbeiter</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="px-2 py-2 text-left font-medium">Name</th>
                      <th className="px-2 py-2 text-left font-medium">Saldo Vormonat</th>
                      <th className="px-2 py-2 text-left font-medium">Geleistete Std.</th>
                      <th className="px-2 py-2 text-left font-medium">Ziel</th>
                      <th className="px-2 py-2 text-left font-medium">Differenz</th>
                      <th className="px-2 py-2 text-left font-medium">Samstage</th>
                      <th className="px-2 py-2 text-left font-medium">Sonntage</th>
                      <th className="px-2 py-2 text-left font-medium">E-Mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => {
                      const h = schedule.hours[s.id] || 0;
                      const t = schedule.targetOf[s.id] || 0;
                      const diff = h - t;
                      const bigDev = t > 0 && Math.abs(diff) / t > 0.15;
                      const satBad = !s.weekendExempt && (schedule.satCount[s.id] || 0) < 2;
                      const sunBad = !s.weekendExempt && (schedule.sunCount[s.id] || 0) < 2;
                      const carried = balances[s.name.trim()] || { hours: 0, satDeficit: 0, sunDeficit: 0, nightDeficit: 0 };
                      const carriedHours = carried.hours || 0;
                      return (
                        <tr key={s.id} className="border-b border-slate-50">
                          <td className="px-2 py-2 font-medium">{s.name}</td>
                          <td className={`px-2 py-2 font-mono ${Math.abs(carriedHours) > 0.05 ? (carriedHours > 0 ? "text-emerald-700" : "text-rose-700") : "text-slate-300"}`}>
                            {Math.abs(carriedHours) > 0.05 ? `${carriedHours > 0 ? "+" : ""}${carriedHours.toFixed(1)}` : "—"}
                          </td>
                          <td className={`px-2 py-2 font-mono ${bigDev ? "text-amber-700 font-semibold" : ""}`}>{h.toFixed(1)}</td>
                          <td className="px-2 py-2 font-mono text-slate-400">{t.toFixed(1)}</td>
                          <td className={`px-2 py-2 font-mono ${bigDev ? "text-amber-700 font-semibold" : "text-slate-400"}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}</td>
                          <td className={`px-2 py-2 font-mono ${satBad ? "text-amber-700 font-semibold" : ""}`}>{schedule.satCount[s.id] || 0}</td>
                          <td className={`px-2 py-2 font-mono ${sunBad ? "text-amber-700 font-semibold" : ""}`}>{schedule.sunCount[s.id] || 0}</td>
                          <td className="px-2 py-2">
                            {s.email ? (
                              <a
                                href={buildMailtoUrl(s)}
                                title={`Dienstplan an ${s.email} senden`}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 no-underline"
                              >
                                <Info size={12} /> Senden
                              </a>
                            ) : (
                              <span
                                title="Keine E-Mail hinterlegt"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] border border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                              >
                                <Info size={12} /> Senden
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <footer className="text-center text-[11px] text-slate-400 pb-4">
          Dieses Tool erstellt eine erste Verteilung nach den festgelegten Regeln; verbleibende Punkte im Bereich „zu überprüfen" können Sie direkt in der Tabelle korrigieren.
        </footer>
      </div>
    </div>
  );
}

export default function GenericShiftScheduler() {
  return (
    <ErrorBoundary>
      <LabShiftSchedulerInner />
    </ErrorBoundary>
  );
}
