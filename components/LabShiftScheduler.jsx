"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Calendar, Users, AlertTriangle, RefreshCw, Plus, Trash2, Copy, Check, ClipboardList, Info } from "lucide-react";
import { storage } from "../lib/storage";

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
  { bg: "bg-sky-50", text: "text-sky-800", chip: "bg-sky-100 text-sky-800 border-sky-200" },
  { bg: "bg-emerald-50", text: "text-emerald-800", chip: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-800", chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" },
  { bg: "bg-amber-50", text: "text-amber-800", chip: "bg-amber-100 text-amber-800 border-amber-200" },
  { bg: "bg-indigo-50", text: "text-indigo-800", chip: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { bg: "bg-rose-50", text: "text-rose-800", chip: "bg-rose-100 text-rose-800 border-rose-200" },
  { bg: "bg-lime-50", text: "text-lime-800", chip: "bg-lime-100 text-lime-800 border-lime-200" },
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

function generateSchedule(staffList, year, monthIdx, holidaySet, shiftHours, shiftLabels, dayShiftDefs, perShiftCount, leaveMap, carryOver, wishes) {
  carryOver = carryOver || {};
  wishes = wishes || [];
  dayShiftDefs = dayShiftDefs || [];
  const total = daysInMonth(year, monthIdx);
  const dailyKeys = dayShiftDefs.filter((d) => d.frequency !== "quota").map((d) => d.key);
  const quotaDefs = dayShiftDefs.filter((d) => d.frequency === "quota");
  const allKeys = ["F", ...dayShiftDefs.map((d) => d.key), "S", "N"];

  const days = [];
  for (let d = 1; d <= total; d++) {
    const weekday = new Date(year, monthIdx, d).getDay();
    const shifts = {};
    allKeys.forEach((k) => { shifts[k] = []; });
    days.push({ day: d, weekday, isWeekend: weekday === 0 || weekday === 6, isHoliday: holidaySet.has(d), shifts });
  }

  const ids = staffList.map((s) => s.id);
  const hours = {}, satCount = {}, sunCount = {}, forcedRest = {}, consecutiveWorkDays = {}, nightCooldown = {}, shiftCount = {}, nightCountSoFar = {};
  const targetOf = {};
  const MAX_CONSECUTIVE_WORKDAYS = 6;
  const NIGHT_COOLDOWN_EXTRA_DAYS = 2;
  ids.forEach((id) => { hours[id] = 0; satCount[id] = 0; sunCount[id] = 0; forcedRest[id] = new Set(); consecutiveWorkDays[id] = 0; nightCooldown[id] = new Set(); shiftCount[id] = 0; nightCountSoFar[id] = 0; });
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

  const nonNightWishes = validWishes.filter((w) => w.shiftType !== "N");
  nonNightWishes.forEach((w) => {
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

  const nightWishesByStaff = {};
  validWishes.filter((w) => w.shiftType === "N").forEach((w) => {
    if (!nightWishesByStaff[w.staffId]) nightWishesByStaff[w.staffId] = [];
    if (!nightWishesByStaff[w.staffId].includes(w.day)) nightWishesByStaff[w.staffId].push(w.day);
  });

  const nightNeeded = Math.max(1, perShiftCount.N || 1);
  const nightOf = Array.from({ length: total }, () => []);
  const dayNightUsed = Array.from({ length: total }, () => new Set());
  let nightPool = staffList.filter((s) => !s.nightExempt).map((s) => s.id);
  const fullTimeSet = new Set(staffList.filter((s) => (s.weeklyHours || 38.5) >= 35).map((s) => s.id));
  const FULLTIME_OVERTIME_CEILING = 190;
  function hardCapFor(id) {
    return fullTimeSet.has(id) ? Math.max(MONTHLY_HOUR_CAP, FULLTIME_OVERTIME_CEILING) : targetOf[id];
  }
  if (nightPool.length === 0) { nightPool = [...ids]; if (ids.length > 0) warnings.push("Alle Mitarbeiter waren von Nachtdiensten befreit; diese Einschränkung wurde ignoriert, um den Nachtdienst zu besetzen"); }

  Object.entries(nightWishesByStaff).forEach(([staffId, dayList]) => {
    const sorted = [...dayList].sort((a, b) => a - b);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      for (let k = i; k <= j; k++) {
        const dIdx = sorted[k] - 1;
        if (nightOf[dIdx].includes(staffId)) continue;
        nightOf[dIdx].push(staffId);
        dayNightUsed[dIdx].add(staffId);
        hours[staffId] += shiftHours.N;
        nightCountSoFar[staffId]++;
        const wd = days[dIdx].weekday;
        if (wd === 6) satCount[staffId]++;
        if (wd === 0) sunCount[staffId]++;
      }
      const runLen = j - i + 1;
      if (runLen < 2 || runLen > 4) notes.push(`${nameOf(staffId)}: Nachtdienst-Wunsch über ${runLen} Tag(e) (Tag ${sorted[i]} bis ${sorted[j]}) weicht von der üblichen 2-4-Tage-Blocklänge ab`);
      const lastDay = sorted[j];
      for (let d = lastDay; d <= lastDay + 1 && d < total; d++) forcedRest[staffId].add(d);
      for (let d = lastDay; d <= lastDay + 1 + NIGHT_COOLDOWN_EXTRA_DAYS && d < total; d++) nightCooldown[staffId].add(d);
      i = j + 1;
    }
  });

  function nightCapForDay(dIdx) {
    const day = days[dIdx];
    return (day.isWeekend || day.isHoliday) ? 1 : nightNeeded;
  }

  for (let track = 0; track < nightNeeded; track++) {
    let dayIdx = 0;
    while (dayIdx < total) {
      if (nightOf[dayIdx].length >= nightCapForDay(dayIdx)) { dayIdx += 1; continue; }

      if (days[dayIdx].weekday === 0 && dayIdx > 0 && days[dayIdx - 1].weekday === 6) {
        for (const satPerson of [...nightOf[dayIdx - 1]]) {
          if (nightOf[dayIdx].length >= nightCapForDay(dayIdx)) break;
          if (nightOf[dayIdx].includes(satPerson) || dayNightUsed[dayIdx].has(satPerson)) continue;
          if (isOnLeave(satPerson, dayIdx + 1)) continue;
          if (hours[satPerson] + shiftHours.N > hardCapFor(satPerson)) continue;
          let priorLen = 0, dd = dayIdx - 1;
          while (dd >= 0 && nightOf[dd].includes(satPerson)) { priorLen++; dd--; }
          if (priorLen >= 4) continue;
          const oldRestDays = [...forcedRest[satPerson]].filter((d) => d >= dayIdx);
          oldRestDays.forEach((d) => forcedRest[satPerson].delete(d));
          oldRestDays.forEach((d) => { if (d + 1 < total) forcedRest[satPerson].add(d + 1); });
          const oldCooldownDays = [...nightCooldown[satPerson]].filter((d) => d >= dayIdx);
          oldCooldownDays.forEach((d) => nightCooldown[satPerson].delete(d));
          oldCooldownDays.forEach((d) => { if (d + 1 < total) nightCooldown[satPerson].add(d + 1); });
          nightOf[dayIdx].push(satPerson);
          dayNightUsed[dayIdx].add(satPerson);
          hours[satPerson] += shiftHours.N;
          shiftCount[satPerson]++;
          nightCountSoFar[satPerson]++;
          sunCount[satPerson]++;
        }
        if (nightOf[dayIdx].length >= nightCapForDay(dayIdx)) { dayIdx += 1; continue; }
      }

      function searchNightCandidate(hourCapFor, restrictToFullTime) {
        let best = null, bestFeasibleLen = 0, bestScore = Infinity;
        let fallback = null, fallbackFeasibleLen = 0, fallbackScore = Infinity;
        for (const c of nightPool) {
          if (restrictToFullTime && !fullTimeSet.has(c)) continue;
          if (forcedRest[c].has(dayIdx) || dayNightUsed[dayIdx].has(c) || isOnLeave(c, dayIdx + 1) || nightCooldown[c].has(dayIdx) || hours[c] + shiftHours.N > hourCapFor(c)) continue;
          let len = 0;
          for (let d = dayIdx; d < Math.min(dayIdx + 4, total); d++) {
            if (forcedRest[c].has(d) || dayNightUsed[d].has(c) || isOnLeave(c, d + 1) || nightOf[d].length >= nightCapForDay(d) || hours[c] + shiftHours.N * (len + 1) > hourCapFor(c)) break;
            len++;
          }
          if (len === 0) continue;
          const t = targetOf[c] > 0 ? targetOf[c] : 1;
          // Same pacing idea as pickBest: score by how far ahead/behind pace they are, not raw
          // hours/target, so low-target people aren't exhausted early in the month.
          const expectedByNow = t * ((dayIdx + 1) / total);
          const score = (hours[c] - expectedByNow) / t + Math.random() * 0.01;
          if (len >= 2 && score < bestScore) { best = c; bestFeasibleLen = len; bestScore = score; }
          if (score < fallbackScore) { fallback = c; fallbackFeasibleLen = len; fallbackScore = score; }
        }
        return { best, bestFeasibleLen, fallback, fallbackFeasibleLen };
      }
      let { best, bestFeasibleLen, fallback, fallbackFeasibleLen } = searchNightCandidate((c) => targetOf[c], false);
      if (best === null && fallback === null) {
        let r = searchNightCandidate((c) => hardCapFor(c), true);
        if (r.best === null && r.fallback === null) r = searchNightCandidate((c) => hardCapFor(c), false);
        ({ best, bestFeasibleLen, fallback, fallbackFeasibleLen } = r);
        if (best !== null || fallback !== null) warnings.push(`Tag ${dayIdx + 1}: persönliches Stundenziel für Nachtdienst überschritten, da niemand anders verfügbar war`);
      }
      const candidate = best !== null ? best : fallback;
      const feasibleLen = best !== null ? bestFeasibleLen : fallbackFeasibleLen;
      if (candidate === null || feasibleLen === 0) {
        warnings.push(`Tag ${dayIdx + 1}: Keine verfügbare Person für den Nachtdienst gefunden`);
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
      if (blockLen < 2) notes.push(`Tag ${dayIdx + 1}: Nachtdienst-Block wurde auf 1 Tag begrenzt (wegen Urlaub/anstehender Einschränkung)`);
      for (let d = dayIdx; d < dayIdx + blockLen; d++) {
        nightOf[d].push(candidate);
        dayNightUsed[d].add(candidate);
        hours[candidate] += shiftHours.N;
        shiftCount[candidate]++;
        nightCountSoFar[candidate]++;
        const wd = days[d].weekday;
        if (wd === 6) satCount[candidate]++;
        if (wd === 0) sunCount[candidate]++;
      }
      const restStart = dayIdx + blockLen;
      const restEnd = Math.min(restStart + 1, total - 1);
      for (let d = restStart; d <= restEnd; d++) forcedRest[candidate].add(d);
      const cooldownEnd = Math.min(restStart + NIGHT_COOLDOWN_EXTRA_DAYS + 1, total - 1);
      for (let d = restStart; d <= cooldownEnd; d++) nightCooldown[candidate].add(d);
      dayIdx += blockLen;
    }
  }
  for (let d = 0; d < total; d++) days[d].shifts.N = nightOf[d];

  const weekendExemptSet = new Set(staffList.filter((s) => s.weekendExempt).map((s) => s.id));
  const leadMTLASet = new Set(staffList.filter((s) => s.isLeadMTLA).map((s) => s.id));

  function pickBest(pool, day) {
    if (pool.length === 0) return null;
    const scored = pool.map((id) => {
      const t = targetOf[id] > 0 ? targetOf[id] : 1;
      const carry = carryOver[id] || {};
      // Score by how far AHEAD OF or BEHIND PACE this person is (not raw hours/target ratio) —
      // this spreads everyone's work evenly across the whole month instead of exhausting anyone
      // with a low target (e.g. Minijob) in the first couple of weeks, leaving nothing left to
      // help with shortages (leave, sick) that land later in the month.
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

  // ---- Quota shifts (was just "Büro"): each defined quota shift gets its own ~N target days a
  // month, spread across weekdays, preferring its designated lead staff (or the least-loaded
  // person as fallback). Generalizes what used to be hardcoded specifically to "B".
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
    const preferred = qd.preferLead ? eligible.filter((id) => leadMTLASet.has(id)) : [];
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
    // Daily "middle" shifts (Mitteldienst and any others) only run on regular workdays — on
    // holidays AND weekends, only the three core shifts (Frühdienst/Spätdienst/Nachtdienst) run.
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
        // The mandatory 2-day rest after a night block is a hard rule — never relaxed, even to
        // guarantee minimum coverage. A shift running short-staffed is the correct outcome, not
        // pulling someone out of their post-night rest.
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

function computeStatsAndWarnings(days, staffList, leaveMap, shiftHours, allKeys) {
  leaveMap = leaveMap || {};
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
  staffList.forEach((s) => {
    let i = 0;
    while (i < days.length) {
      if ((days[i].shifts.N || []).includes(s.id)) {
        let j = i;
        while (j < days.length && (days[j].shifts.N || []).includes(s.id)) j++;
        const len = j - i;
        if (len < 2 || len > 4) warnings.push(`${s.name}: Nachtdienst-Block über ${len} Tage (Tag ${days[i].day} bis ${days[j - 1].day}) — sollte 2 bis 4 Tage sein`);
        let restOk = true;
        for (let k = j; k < Math.min(j + 2, days.length); k++) {
          if (allKeys.some((st) => (days[k].shifts[st] || []).includes(s.id))) restOk = false;
        }
        if (!restOk) warnings.push(`${s.name}: nach dem Nachtdienst bis Tag ${days[j - 1].day}, wurden nicht mindestens 2 Ruhetage eingehalten`);
        i = j;
      } else i++;
    }
  });
  staffList.forEach((s) => {
    if (s.nightExempt) {
      const worksNight = days.some((d) => (d.shifts.N || []).includes(s.id));
      if (worksNight) warnings.push(`${s.name}: ist von Nachtdiensten befreit, hat aber einen Nachtdienst im Plan`);
    }
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
function computeShiftHours(timeRange) {
  const m = String(timeRange || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return 8;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  let endMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  if (endMin <= startMin) endMin += 24 * 60; // crosses midnight
  const hours = (endMin - startMin - 30) / 60;
  return Math.max(0.5, Math.round(hours * 100) / 100);
}


function LabShiftSchedulerInner() {
  const [monthValue, setMonthValue] = useState(todayMonthValue());
  const [staffList, setStaffList] = useState(() =>
    Array.from({ length: 9 }, (_, i) => ({ id: `s${i + 1}`, name: `Mitarbeiter ${i + 1}`, weeklyHours: 38.5, employmentType: "full", nightExempt: false, weekendExempt: false, isLeadMTLA: false, email: "" }))
  );
  const nextIdRef = useRef(10);
  const nextEntryIdRef = useRef(1);
  const [perShiftCount, setPerShiftCount] = useState({ F: 2, M: 1, B: 1, S: 1, N: 1 });
  // Editable time ranges for the 3 shifts with special built-in rules (F: no-Frühdienst-after-
  // Spätdienst rule; S: the other half of that rule; N: full night rotation). The key/role stays
  // fixed so those rules keep working, but label/time/hours are fully editable.
  const [specialShifts, setSpecialShifts] = useState({
    F: { label: "Frühdienst", time: "06:00-14:00" },
    S: { label: "Spätdienst", time: "13:30-22:00" },
    N: { label: "Nachtdienst", time: "21:45-06:30" },
  });
  // The "middle" shifts — fully user-defined: add/remove/rename/retime freely, each either
  // "daily" (needed every non-holiday day) or "quota" (needed only N times a month, optionally
  // preferring the Leitende MTLA). Starts out matching the original Mitteldienst + Büro.
  const [dayShiftDefs, setDayShiftDefs] = useState([
    { key: "M", label: "Mitteldienst", time: "08:00-16:30", frequency: "daily" },
    { key: "B", label: "Büro", time: "08:00-16:00", frequency: "quota", quotaCount: 9, preferLead: true },
  ]);
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
      staffList.forEach((s) => { nightCountOf[s.id] = schedule.days.filter((d) => (d.shifts.N || []).includes(s.id)).length; });
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
  // F/S/N keep the SAME internal keys (so their special rules keep working) but fully editable
  // label/time; the day-shift-defs (was just Mitteldienst+Büro) are freely add/remove/editable.
  const shiftMeta = useMemo(() => {
    const meta = {};
    ["F", "S", "N"].forEach((key, i) => {
      const def = specialShifts[key];
      meta[key] = { label: def.label, time: def.time, hours: computeShiftHours(def.time), ...SHIFT_COLOR_PALETTE[i % SHIFT_COLOR_PALETTE.length] };
    });
    dayShiftDefs.forEach((def, i) => {
      meta[def.key] = {
        label: def.label, time: def.time, hours: computeShiftHours(def.time),
        frequency: def.frequency, quotaCount: def.quotaCount, preferLead: def.preferLead,
        ...SHIFT_COLOR_PALETTE[(i + 3) % SHIFT_COLOR_PALETTE.length],
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
  // Display/column order: Frühdienst, then the user-defined day shifts in their own order, then
  // Spätdienst, then Nachtdienst — matches the original Frühdienst/Mitteldienst/Büro/Spätdienst/Nachtdienst layout.
  const dayOrderedKeys = useMemo(() => ["F", ...dayShiftDefs.map((d) => d.key), "S", "N"], [dayShiftDefs]);
  // Which day-shift-def keys are "quota" (not needed every day) — used to know which columns
  // go blank on holidays (the daily ones do; quota ones like Büro were never scheduled there anyway).
  const dailyDayShiftKeys = useMemo(() => new Set(dayShiftDefs.filter((d) => d.frequency !== "quota").map((d) => d.key)), [dayShiftDefs]);

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
        (d.shifts[st] || []).forEach((id) => { if (matrix[id]) matrix[id][d.day] = st; });
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
  }, [schedule, staffList, leaveEntries, sickEntries, totalDays, dayOrderedKeys]);

  function addStaff() {
    const id = `s${nextIdRef.current++}`;
    setStaffList((prev) => [...prev, { id, name: `Mitarbeiter ${prev.length + 1}`, weeklyHours: 38.5, employmentType: "full", nightExempt: false, weekendExempt: false, isLeadMTLA: false, email: "" }]);
  }
  function removeStaff(id) {
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
      const stats = computeStatsAndWarnings(result.days, staffList, leaveMap, shiftHours, dayOrderedKeys);
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
      const stats = computeStatsAndWarnings(days, staffList, buildLeaveMap(), shiftHours, dayOrderedKeys);
      return { days, ...stats };
    });
  }

  const demandSummary = useMemo(() => {
    if (!schedule) return null;
    let totalDemandHours = 0;
    schedule.days.forEach((d) => {
      const reduced = d.isWeekend || d.isHoliday;
      totalDemandHours += shiftHours.F * (reduced ? 1 : perShiftCount.F) + shiftHours.S * (reduced ? 1 : perShiftCount.S) + shiftHours.N * (reduced ? 1 : perShiftCount.N);
      if (!d.isHoliday && !d.isWeekend) {
        dayShiftDefs.forEach((def) => {
          if (def.frequency !== "quota") totalDemandHours += (shiftHours[def.key] || 0) * (perShiftCount[def.key] || 1);
        });
      }
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
            <h1 className="text-xl font-bold">Dienstplaner für das medizinisch-diagnostische Labor</h1>
          </div>
          <p className="text-sm text-slate-500">Vier feste Schichten unter Berücksichtigung der Wochenstunden, der Nachtdienstrotation und der Wochenendquote — nach dem Erstellen manuell bearbeitbar.</p>
        </header>

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
                {["F", ...dayShiftDefs.filter((d) => d.frequency !== "quota").map((d) => d.key), "S", "N"].map((st) => (
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
                  {dayShiftDefs.filter((d) => d.frequency === "quota").map((d) => `${d.label} (${d.quotaCount || 9}x/Monat)`).join(", ")} laufen separat, meist die Leitende MTLA, sonst wer am wenigsten Schichten hat.
                </p>
              )}
            </div>
          </div>

          {/* Shift definitions: F/S/N keep their special rules but are fully renameable/retimeable;
              the "middle" shifts are freely add/remove/editable. */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Schichtzeiten</label>
            <div className="space-y-2">
              {["F", "S", "N"].map((key) => (
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
              {dayShiftDefs.map((def, idx) => (
                <div key={def.key} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto,auto,auto] gap-1.5 items-center bg-slate-50/60 rounded-lg p-2">
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
                      <label className="flex items-center gap-1 text-[10px] text-fuchsia-700 whitespace-nowrap" title="Bevorzugt die als „Leitende MTLA“ markierte Person">
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
              ))}
            </div>
            <button
              onClick={() => setDayShiftDefs((prev) => [...prev, { key: `custom${Date.now()}`, label: "Neue Schicht", time: "08:00-16:00", frequency: "daily" }])}
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
                      Befreit von Nachtdienst
                    </label>
                    <label className="flex items-center gap-1 text-slate-500">
                      <input type="checkbox" checked={!!s.weekendExempt} onChange={(e) => updateStaffField(s.id, "weekendExempt", e.target.checked)} />
                      Befreit von Wochenendquote
                    </label>
                    <label className="flex items-center gap-1 text-fuchsia-700">
                      <input type="checkbox" checked={!!s.isLeadMTLA} onChange={(e) => updateStaffField(s.id, "isLeadMTLA", e.target.checked)} />
                      Leitende MTLA (übernimmt meist Büro)
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
              {(archiveState === "error" || saveState === "error") && (
                <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {archiveState === "error" && (
                    <div className="mb-1"><strong>Archivieren fehlgeschlagen:</strong> <span className="font-mono">{archiveErrorMsg}</span></div>
                  )}
                  {saveState === "error" && (
                    <div className="mb-1"><strong>Speichern fehlgeschlagen:</strong> <span className="font-mono">{saveErrorMsg}</span></div>
                  )}
                  <div className="text-rose-600">
                    Diese Funktionen speichern Daten lokal in diesem Browser (localStorage). In einem anderen Browser oder Gerät sind sie nicht sichtbar.
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

export default function LabShiftScheduler() {
  return (
    <ErrorBoundary>
      <LabShiftSchedulerInner />
    </ErrorBoundary>
  );
}
