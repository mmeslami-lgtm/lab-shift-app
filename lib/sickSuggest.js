// "Krankmeldung / Ausfall" in the lab planner: someone is sick on some days of a plan that already
// exists. This file only SUGGESTS up to 3 ways to cover the shifts, best first; nothing changes until
// the Leitung presses "Übernehmen". Only the affected days are touched (plus, for a night, the
// replacement's own shifts in the 2 rest days after it — always shown as "zusätzlich").
//
// Hard rules (a suggestion never breaks them): not on leave/sick/Frei-wish, nobody twice a day,
// 2 free days after a night block, night blocks of at most 4, 11 hours between two shifts,
// at most 6 workdays in a row, nightExempt / weekendExempt, monthly hour cap (part-time = goal).
// Fairness (ranking): fewer Einspringen this month, fewer hours compared with the goal, fewer extra changes.

const MIN_REST = 11 * 60; // minutes between the end of one shift and the start of the next
const MAX_IN_A_ROW = 6;
const MAX_NIGHT_BLOCK = 4;

function minutesOf(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 24 * 60; // ends the next morning
  return { start, end };
}

/**
 * @param {object} p
 *  days        schedule.days [{ day, weekday, isWeekend, isHoliday, shifts: { key: [id, …] } }]
 *  staff       [{ id, name, weeklyHours, employmentType, nightExempt, weekendExempt }]
 *  shiftMeta   { key: { label, time, hours } }
 *  sickId, fromDay, toDay
 *  offDays     { id: Set(day) }  leave, sickness, approved "Frei" wishes (the sick person included or not)
 *  hours       { id: planned hours this month }   targetOf { id: goal }
 *  einspring   { id: number of Einspringen this month }  (optional)
 *  nightKey    "N"
 * @returns {{ affected: Array, options: Array }}
 */
export function suggestCover(p) {
  const { days, staff, shiftMeta, sickId, fromDay, toDay } = p;
  const offDays = p.offDays || {};
  const einspring = p.einspring || {};
  const nightKey = p.nightKey || "N";
  const total = days.length;
  const byId = {}; staff.forEach((s) => { byId[s.id] = s; });
  const nameOf = (id) => (byId[id] ? byId[id].name : "?");
  const labelOf = (k) => (shiftMeta[k] ? shiftMeta[k].label : k);
  const hoursOf = (k) => (shiftMeta[k] ? Number(shiftMeta[k].hours) || 0 : 0);
  const capOf = (id) => {
    const s = byId[id] || {};
    const goal = (p.targetOf || {})[id] || 0;
    if (s.employmentType === "mini" || (s.weeklyHours || 0) < 12) return goal;          // Minijob: never above
    if ((s.weeklyHours || 38.5) >= 35) return Math.max(goal, 190);                        // full-time ceiling
    return goal;                                                                            // part-time: goal
  };
  const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const dayTxt = (n) => { const d = days[n - 1]; return `${wd[d.weekday]} ${n}.`; };

  // the cells that become free
  const affected = [];
  for (let n = Math.max(1, fromDay); n <= Math.min(total, toDay); n++) {
    const d = days[n - 1];
    Object.keys(d.shifts).forEach((k) => {
      (d.shifts[k] || []).forEach((id, slot) => { if (id === sickId) affected.push({ day: n, key: k, slot }); });
    });
  }
  if (affected.length === 0) return { affected, options: [] };

  // ---- a small working copy of "who works what" so rules can be checked after changes ----
  const baseWork = {}; // id -> { day -> key }
  days.forEach((d) => Object.keys(d.shifts).forEach((k) => (d.shifts[k] || []).forEach((id) => {
    if (!id) return;
    (baseWork[id] = baseWork[id] || {})[d.day] = k;
  })));
  affected.forEach((a) => { if (baseWork[sickId]) delete baseWork[sickId][a.day]; });

  const isOff = (id, n) => !!(offDays[id] && offDays[id].has(n)) || (id === sickId && n >= fromDay && n <= toDay);

  // can `id` work shift `k` on day `n`, given the work map `w`? returns { ok, extras: [{day,key}] }
  function check(w, id, n, k) {
    const s = byId[id];
    if (!s || id === sickId) return { ok: false };
    const mine = w[id] || {};
    const d = days[n - 1];
    if (isOff(id, n) || mine[n]) return { ok: false };
    if (k === nightKey && s.nightExempt) return { ok: false };
    if ((d.isWeekend) && s.weekendExempt) return { ok: false };
    const t = minutesOf(shiftMeta[k] && shiftMeta[k].time);
    // nights before: a night block needs 2 free days afterwards
    const prev = mine[n - 1], prev2 = mine[n - 2];
    if (prev === nightKey && k !== nightKey) return { ok: false };              // 1st free day after nights
    if (prev2 === nightKey && prev !== nightKey) return { ok: false };          // 2nd free day after nights
    if (k === nightKey && prev !== nightKey) {                                  // a NEW night block: 2 free + 2 cooldown days before
      for (let i = n - 4; i <= n - 1; i++) if (i >= 1 && mine[i] === nightKey) return { ok: false };
    }
    if (k === nightKey) { let len = 1; for (let i = n - 1; i >= 1 && mine[i] === nightKey; i--) len++; for (let i = n + 1; i <= total && mine[i] === nightKey; i++) len++; if (len > MAX_NIGHT_BLOCK) return { ok: false }; }
    // 11 hours rest to the shift before / after
    if (t && prev) { const pt = minutesOf(shiftMeta[prev] && shiftMeta[prev].time); if (pt && (24 * 60 + t.start) - pt.end < MIN_REST) return { ok: false }; }
    const extras = [];
    const next = mine[n + 1];
    if (t && next) {
      const nt = minutesOf(shiftMeta[next] && shiftMeta[next].time);
      const tooClose = nt && (24 * 60 + nt.start) - t.end < MIN_REST;
      if (k === nightKey && next !== nightKey) extras.push({ day: n + 1, key: next });       // rest after the night
      else if (tooClose) return { ok: false };
    }
    if (k === nightKey && mine[n + 1] !== nightKey && mine[n + 2] && mine[n + 2] !== nightKey && n + 2 <= total) extras.push({ day: n + 2, key: mine[n + 2] });
    // at most 6 workdays in a row (extras would be removed, so they do not count)
    const removed = new Set(extras.map((e) => e.day));
    let run = 1;
    for (let i = n - 1; i >= 1 && mine[i] && !removed.has(i); i--) run++;
    for (let i = n + 1; i <= total && mine[i] && !removed.has(i); i++) run++;
    if (run > MAX_IN_A_ROW) return { ok: false };
    return { ok: true, extras };
  }

  // apply a plan of assignments [{cell, id}] in day order; returns null if any rule breaks
  function simulate(assign) {
    const w = {}; Object.keys(baseWork).forEach((id) => { w[id] = { ...baseWork[id] }; });
    const added = {}; const extras = [];
    const sorted = [...assign].sort((a, b) => a.cell.day - b.cell.day);
    for (const a of sorted) {
      if (!a.id) continue;
      if (a.move) { // the person leaves their own shift of the same day first
        if (!w[a.id] || w[a.id][a.cell.day] !== a.move.key) return null;
        delete w[a.id][a.cell.day];
        added[a.id] = (added[a.id] || 0) - hoursOf(a.move.key);
      }
      const r = check(w, a.id, a.cell.day, a.cell.key);
      if (!r.ok) return null;
      r.extras.forEach((e) => { if (w[a.id] && w[a.id][e.day] === e.key) { delete w[a.id][e.day]; extras.push({ id: a.id, day: e.day, key: e.key }); added[a.id] = (added[a.id] || 0) - hoursOf(e.key); } });
      (w[a.id] = w[a.id] || {})[a.cell.day] = a.cell.key;
      added[a.id] = (added[a.id] || 0) + hoursOf(a.cell.key);
    }
    for (const id of Object.keys(added)) if ((p.hours[id] || 0) + added[id] > capOf(id) + 0.01) return null;
    return { added, extras };
  }

  function score(sim, emptyCells) {
    let sc = 0;
    Object.keys(sim.added).forEach((id) => {
      const after = (p.hours[id] || 0) + sim.added[id];
      sc += (einspring[id] || 0) * 3;                          // fairness: who has jumped in less
      sc += Math.max(-3, (after - ((p.targetOf || {})[id] || 0)) / 8); // fewer hours than the goal first
      sc += 1.5;                                               // every extra person is one more change
    });
    sc += sim.extras.length * 4;                               // own shifts that would have to go
    sc += emptyCells * 6;                                      // shifts left empty / reduced
    return sc;
  }

  const candidates = staff.map((s) => s.id).filter((id) => id !== sickId);
  const options = [];
  const describe = (assign, sim, reduced) => {
    const lines = [];
    assign.forEach((a) => {
      if (a.id) lines.push(`${dayTxt(a.cell.day)}: ${nameOf(a.id)} übernimmt ${labelOf(a.cell.key)}${a.move ? ` (statt ${labelOf(a.move.key)}, dort ${a.move.key === "F" ? "1 Person" : "entfällt"})` : ""}`);
    });
    reduced.forEach((c) => lines.push(`${dayTxt(c.day)}: ${labelOf(c.key)} ${c.key === "F" ? "nur mit 1 Person" : "entfällt"}`));
    sim.extras.forEach((e) => lines.push(`zusätzlich: ${nameOf(e.id)} – ${labelOf(e.key)} am ${dayTxt(e.day)} entfällt (Ruhezeit nach dem Nachtdienst)`));
    return lines;
  };
  const infoOf = (sim) => Object.keys(sim.added).map((id) => {
    const after = (p.hours[id] || 0) + sim.added[id]; const goal = (p.targetOf || {})[id] || 0;
    return `${nameOf(id)}: danach ${after.toFixed(1)} von ${goal.toFixed(1)} Std.${einspring[id] ? `, diesen Monat ${einspring[id]}× eingesprungen` : ", diesen Monat noch nicht eingesprungen"}`;
  });

  // 1) one person for everything
  candidates.forEach((id) => {
    const assign = affected.map((cell) => ({ cell, id }));
    const sim = simulate(assign);
    if (sim) options.push({ kind: "one", assign, sim, reduced: [], score: score(sim, 0) });
  });

  // 2) the best person per shift (may be several people)
  {
    const assign = []; const reduced = [];
    let ok = true;
    for (const cell of affected) {
      let best = null;
      for (const id of candidates) {
        const sim = simulate([...assign, { cell, id }]);
        if (!sim) continue;
        const sc = score(sim, 0);
        if (!best || sc < best.sc) best = { id, sc };
      }
      if (best) assign.push({ cell, id: best.id }); else { ok = false; break; }
    }
    if (ok) {
      const sim = simulate(assign);
      const people = new Set(assign.map((a) => a.id));
      if (sim && people.size > 1) options.push({ kind: "several", assign, sim, reduced: [], score: score(sim, 0) });
    }
  }

  // 3) reduce instead of replacing: 2nd Frühdienst / extra shifts stay empty; Spät/Nacht are covered
  //    by someone moving from the 2nd Frühdienst or an extra shift of the SAME day, or by a free person
  {
    const assign = []; const reduced = [];
    let ok = true;
    for (const cell of affected) {
      const d = days[cell.day - 1];
      const others = (d.shifts[cell.key] || []).filter((x) => x && x !== sickId);
      if (cell.key === "F" && others.length >= 1) { reduced.push(cell); continue; } // Frühdienst with 1 person is allowed
      if (cell.key !== "F" && cell.key !== "S" && cell.key !== nightKey) { reduced.push(cell); continue; } // Mitteldienst/Büro: entfällt
      // move someone from the 2nd Frühdienst or an extra shift of the same day (checked with ALL rules)
      let moved = null;
      const donorKeys = Object.keys(d.shifts).filter((k) => k !== cell.key && k !== nightKey && k !== "S");
      for (const k of donorKeys) {
        const ids = (d.shifts[k] || []).filter((x) => x && x !== sickId);
        if (k === "F" && ids.length < 2) continue;
        for (const id of ids) {
          if (simulate([...assign, { cell, id, move: { key: k } }])) { moved = { id, key: k }; break; }
        }
        if (moved) break;
      }
      if (moved) { assign.push({ cell, id: moved.id, move: { key: moved.key } }); continue; }
      let best = null;
      for (const id of candidates) {
        const sim = simulate([...assign, { cell, id }]);
        if (sim && (!best || score(sim, 0) < best.sc)) best = { id, sc: score(sim, 0) };
      }
      if (best) assign.push({ cell, id: best.id }); else { ok = false; break; }
    }
    if (ok && (reduced.length > 0 || assign.some((a) => a.move))) {
      const sim = simulate(assign);
      if (sim) options.push({ kind: "reduce", assign, sim, reduced, score: score(sim, reduced.length) + assign.filter((a) => a.move).length * 2 });
    }
  }

  options.sort((a, b) => a.score - b.score);
  const seen = new Set(); const out = [];
  for (const o of options) {
    const key = JSON.stringify(o.assign.map((a) => [a.cell.day, a.cell.key, a.id, a.move ? a.move.key : ""])) + "|" + o.reduced.map((c) => c.day + c.key).join();
    if (seen.has(key)) continue; seen.add(key);
    // the changes the planner applies: cell -> new person (or empty), moves, extras
    const changes = [];
    o.assign.forEach((a) => {
      changes.push({ day: a.cell.day, key: a.cell.key, slot: a.cell.slot, to: a.id });
      if (a.move) {
        const d = days[a.cell.day - 1]; const slot = (d.shifts[a.move.key] || []).indexOf(a.id);
        if (slot >= 0) changes.push({ day: a.cell.day, key: a.move.key, slot, to: "" });
      }
    });
    o.reduced.forEach((c) => changes.push({ day: c.day, key: c.key, slot: c.slot, to: "" }));
    o.sim.extras.forEach((e) => { const d = days[e.day - 1]; const slot = (d.shifts[e.key] || []).indexOf(e.id); if (slot >= 0) changes.push({ day: e.day, key: e.key, slot, to: "" }); });
    const title = o.kind === "one" ? `${nameOf(o.assign[0].id)} übernimmt alles` : o.kind === "several" ? "Auf mehrere Personen verteilt" : "Umbesetzung am selben Tag / reduziert";
    out.push({ title, lines: describe(o.assign, o.sim, o.reduced), info: infoOf(o.sim), changes, score: Math.round(o.score * 10) / 10 });
    if (out.length === 3) break;
  }
  return { affected, options: out };
}
