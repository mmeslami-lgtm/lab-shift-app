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

// staffId -> { day: "Krank" | "Urlaub" | "Fortbildung" | "Wunsch „Frei“" } (short reason for "entfällt: …")
export function offKindMap(leaveEntries, sickEntries, totalDays, parseDayList, wishEntries) {
  const off = {};
  const rank = { "Wunsch „Frei“": 1, Fortbildung: 2, Urlaub: 3, Krank: 4 };
  const mark = (entries, kindOf) => (entries || []).forEach((e) => {
    const kind = kindOf(e); if (!kind) return;
    parseDayList(e.days, totalDays).forEach((d) => {
      off[e.staffId] = off[e.staffId] || {};
      if (!off[e.staffId][d] || rank[kind] > rank[off[e.staffId][d]]) off[e.staffId][d] = kind;
    });
  });
  mark(wishEntries, (e) => (e.shiftType === "Frei" ? "Wunsch „Frei“" : e.shiftType === "Fortbildung" ? "Fortbildung" : null));
  mark(leaveEntries, () => "Urlaub");
  mark(sickEntries, () => "Krank");
  return off;
}

// Replacements of the month from shift_changes (kind "cover", not void). status: "open"/"done" = published as
// „Einspringen / kurzfristig“ (red ↺), "normal" = normale Planänderung (only used to find swaps ⇄).
// Returns [{ day, staffId, replacedId, note, status }].
export async function loadCovers(sb, orgId, year, monthIdx) {
  const p = (n) => String(n).padStart(2, "0");
  const from = `${year}-${p(monthIdx + 1)}-01`;
  const next = monthIdx === 11 ? `${year + 1}-01-01` : `${year}-${p(monthIdx + 2)}-01`;
  const r = await sb.from("shift_changes").select("change_date, staff_id, replaced_staff_id, note, manager_status, voided_at").eq("org_id", orgId).eq("kind", "cover").gte("change_date", from).lt("change_date", next);
  if (r.error) return [];
  return (r.data || []).filter((x) => !x.voided_at && x.staff_id && x.manager_status !== "void")
    .map((x) => ({ day: Number(String(x.change_date).slice(8, 10)), staffId: x.staff_id, replacedId: x.replaced_staff_id, note: x.note || "", status: x.manager_status }));
}
// While a published month is edited: what changed versus the published version (not saved yet) – same shape, draft: true
export function draftPairs(schedule, baseline) {
  if (!schedule || !baseline) return [];
  const out = [];
  schedule.days.forEach((d) => {
    Object.keys(d.shifts || {}).forEach((st) => {
      const now = (d.shifts[st] || []).filter(Boolean);
      const before = baseline[`${d.day}|${st}`] || [];
      const rem = before.filter((id) => !now.includes(id));
      now.filter((id) => !before.includes(id)).forEach((id, i) => out.push({ day: d.day, staffId: id, replacedId: rem[i] || null, note: "", draft: true }));
    });
  });
  return out;
}
// Swap (⇄): A took B's shift and B took A's shift ON THE SAME DAY – published (any status)
// or still a draft. Everything else: red ↺ = eingesprungen (only „Einspringen“ or a draft change).
// Returns { byStaff: {"id|day": cover}, byReplaced: {"id|day": cover}, swapBy: {"id|day": { with, otherDay, draft }},
//           swapGone: {"id|day": otherId} }
export function coverIndex(rows) {
  const list = (rows || []).filter((c) => c.replacedId);
  const used = new Set(), swapBy = {}, swapGone = {};
  list.forEach((a, i) => {
    if (used.has(i)) return;
    const j = list.findIndex((b, k) => k !== i && !used.has(k) && b.day === a.day && b.staffId === a.replacedId && b.replacedId === a.staffId); // same day only – never touches other days
    if (j < 0) return;
    const b = list[j]; used.add(i); used.add(j);
    swapBy[`${a.staffId}|${a.day}`] = { with: a.replacedId, otherDay: b.day, draft: !!(a.draft || b.draft) };
    swapBy[`${b.staffId}|${b.day}`] = { with: b.replacedId, otherDay: a.day, draft: !!(a.draft || b.draft) };
    swapGone[`${a.replacedId}|${a.day}`] = a.staffId; swapGone[`${b.replacedId}|${b.day}`] = b.staffId;
  });
  const byStaff = {}, byReplaced = {};
  (rows || []).forEach((c) => {
    const k = `${c.staffId}|${c.day}`;
    if (!swapBy[k] && (c.draft || c.status === "open" || c.status === "done")) byStaff[k] = c;
    if (c.replacedId) byReplaced[`${c.replacedId}|${c.day}`] = c;
  });
  return { byStaff, byReplaced, swapBy, swapGone };
}
export const shortNote = (s) => { const t = String(s || "").trim(); return t.length > 25 ? `${t.slice(0, 24)}…` : t; };
