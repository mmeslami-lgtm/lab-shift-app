// Dienstplan: live check of the plan against things that may have changed AFTER the plan was made (7 Nov 2026).
// The generator already respects all of them – but Urlaub/Krank/Wünsche entered later, or a person chosen by hand,
// were never checked again. Used by LabShiftScheduler + GenericShiftScheduler (red box, red cells, publish question).
// (Rest times, night blocks, nightExempt, hours, weekends count are already checked live in computeStatsAndWarnings.)
// Returns [{ day, weekday, st, staffId, kind }] sorted by day. kind: Urlaub | Krank | Wunsch „Frei“ | Fortbildung |
// doppelt am Tag | Wochenende befreit | nicht mehr im Team
export function absentConflicts(schedule, leaveEntries, sickEntries, totalDays, parseDayList, opts) {
  if (!schedule || !schedule.days) return [];
  const o = opts || {};
  const off = {}; // staffId -> { day: kind }  (stronger kinds win: Krank > Urlaub > Fortbildung > Frei)
  const rank = { "Wunsch „Frei“": 1, Fortbildung: 2, Urlaub: 3, Krank: 4 };
  const mark = (entries, kindOf) => (entries || []).forEach((e) => {
    const kind = kindOf(e); if (!kind) return;
    parseDayList(e.days, totalDays).forEach((d) => {
      off[e.staffId] = off[e.staffId] || {};
      if (!off[e.staffId][d] || rank[kind] > rank[off[e.staffId][d]]) off[e.staffId][d] = kind;
    });
  });
  mark(o.wishEntries, (e) => (e.shiftType === "Frei" ? "Wunsch „Frei“" : e.shiftType === "Fortbildung" ? "Fortbildung" : null));
  mark(leaveEntries, () => "Urlaub");
  mark(sickEntries, () => "Krank");
  const staff = o.staffList ? new Map(o.staffList.map((s) => [s.id, s])) : null;
  const out = [];
  schedule.days.forEach((d) => {
    const seen = {};
    Object.keys(d.shifts || {}).forEach((st) => {
      (d.shifts[st] || []).forEach((id) => {
        if (!id) return;
        const s = staff ? staff.get(id) : null;
        let kind = off[id] && off[id][d.day];
        if (!kind && staff && !s) kind = "nicht mehr im Team";
        if (!kind && seen[id]) kind = "doppelt am Tag";
        if (!kind && s && s.weekendExempt && d.isWeekend) kind = "Wochenende befreit";
        seen[id] = true;
        if (kind) out.push({ day: d.day, weekday: d.weekday, st, staffId: id, kind });
      });
    });
  });
  return out.sort((a, b) => a.day - b.day);
}
export const conflictKey = (day, st, id) => `${day}|${st}|${id}`;
