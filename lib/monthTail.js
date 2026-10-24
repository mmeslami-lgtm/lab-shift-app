// Monatswechsel: the plan of a new month starts where the previous month ended.
// The last 7 days of the previous month (published version, otherwise the saved draft) are handed to the
// generator as "days before day 1", so the core rules also hold across the month boundary:
//   * a night block running at the end of the month continues (at most 4 nights in a row in total)
//     or, if it has ended, the person gets 2 free days ("frei") at the start of the new month
//   * month ends on Saturday and the new month starts on Sunday: Sunday gets the same shift as Saturday
//   * no Frühdienst after a Spätdienst, at most 6 working days in a row
import { fetchAll } from "./fetchAll";

const TAIL_DAYS = 7;
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Module-level context (like sollCtx): set by the planner, read by the generator and the warnings.
// ym = the month the tail belongs BEFORE ("2026-11" -> the tail is the end of October 2026).
export const tailCtx = { ym: null, days: [], source: null, label: "" };

export function tailFor(year, monthIdx) {
  return tailCtx.ym === `${year}-${pad(monthIdx + 1)}` ? tailCtx.days : [];
}

// key of person id "back" days before day 1 (back = 1 -> last day of the previous month); null = free / unknown
export function tailKey(tail, id, back) {
  const t = tail[tail.length - back];
  if (!t) return null;
  return Object.keys(t.shifts).find((k) => (t.shifts[k] || []).includes(id)) || null;
}

// how many days in a row before day 1 match pred(key)
export function tailRun(tail, id, pred) {
  let n = 0;
  while (n < tail.length && pred(tailKey(tail, id, n + 1))) n++;
  return n;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// loads the end of the month before (year, monthIdx) and stores it in tailCtx
export async function loadMonthTail(sb, orgId, year, monthIdx) {
  const first = new Date(year, monthIdx, 1);
  const from = new Date(year, monthIdx, 1 - TAIL_DAYS);
  const q = (status) => fetchAll(() => sb.from("scheduled_shifts").select("staff_id, shift_date, shift_key").eq("org_id", orgId).eq("status", status).gte("shift_date", isoOf(from)).lt("shift_date", isoOf(first)));
  let rows = await q("published"), source = "published";
  if (!rows.length) { rows = await q("draft"); source = "draft"; }
  const ym = `${year}-${pad(monthIdx + 1)}`;
  if (!rows.length) { Object.assign(tailCtx, { ym, days: [], source: null, label: "" }); return tailCtx; }
  const days = [];
  for (let i = TAIL_DAYS; i >= 1; i--) {
    const d = new Date(year, monthIdx, 1 - i);
    days.push({ date: isoOf(d), day: d.getDate(), weekday: d.getDay(), shifts: {} });
  }
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  rows.forEach((r) => { const d = byDate[String(r.shift_date).slice(0, 10)]; if (d) (d.shifts[r.shift_key] = d.shifts[r.shift_key] || []).push(r.staff_id); });
  const pm = new Date(year, monthIdx - 1, 1);
  Object.assign(tailCtx, { ym, days, source, label: `${MONTHS[pm.getMonth()]} ${pm.getFullYear()}${source === "draft" ? " (Entwurf)" : ""}` });
  return tailCtx;
}
