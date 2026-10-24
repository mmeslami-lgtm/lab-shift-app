// "Zu prüfen" in Anwesenheit (Leitung/Inhaber): items that a person in charge should look at. An item stays until
// someone clicks "Gesehen ✓" (table attendance_review_seen, shared by all leaders) – nothing disappears by itself.
//   mob:<eventId>              stamped with the phone (📱 / 📍)
//   man:<sessionId>            time entered or changed by hand (approved request or Leitung)
//   gehen:<sessionId>          "Gehen" missing more than 12 hours after "Kommen"
//   miss:<staffId>:<date>      published shift started > 15 min ago, no "Kommen", no absence
import { absenceMap } from "./absence";

const DAYS_BACK = 31;
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export async function loadReview(sb, orgId) {
  const now = new Date();
  const since = new Date(now.getTime() - DAYS_BACK * 86400000);
  const prod = await sb.from("org_products").select("product, created_at").eq("org_id", orgId).eq("product", "time_tracking");
  const ttStart = prod.data && prod.data[0] ? new Date(prod.data[0].created_at) : since;
  const from = ttStart > since ? ttStart : since;
  const fromIso = from.toISOString();

  const [staff, ses, ev, cor, shifts, seen, reqs, abs] = await Promise.all([
    sb.from("staff").select("id, name").eq("org_id", orgId),
    sb.from("attendance_sessions").select("id, staff_id, check_in, check_out, in_event_id, out_event_id").eq("org_id", orgId).gte("check_in", new Date(from.getTime() - 86400000).toISOString()),
    sb.from("attendance_events").select("id, staff_id, direction, scanned_at, raw_payload").eq("org_id", orgId).eq("badge_code", "mobil").gte("scanned_at", fromIso),
    sb.from("attendance_corrections").select("session_id, staff_id, reason, corrected_at").eq("org_id", orgId).gte("corrected_at", fromIso),
    sb.from("scheduled_shifts").select("staff_id, shift_date, shift_label, planned_start, status").eq("org_id", orgId).eq("status", "published").gte("shift_date", isoOf(from)).lte("shift_date", isoOf(now)),
    sb.from("attendance_review_seen").select("item_key").eq("org_id", orgId),
    sb.from("requests").select("staff_id, type_key, date_from, date_to, status").eq("org_id", orgId).eq("status", "approved").gte("date_to", isoOf(from)),
    sb.from("attendance_absences").select("staff_id, work_date, kind, voided_at").eq("org_id", orgId).gte("work_date", isoOf(from)),
  ]);
  const name = {}; (staff.data || []).forEach((s) => { name[s.id] = s.name; });
  const seenSet = new Set((seen.data || []).map((x) => x.item_key));
  const items = [];
  const add = (key, it) => { if (!seenSet.has(key)) items.push({ key, ...it, name: name[it.staffId] || "?" }); };

  (ev.data || []).forEach((e) => add(`mob:${e.id}`, { kind: "mobil", staffId: e.staff_id, at: e.scanned_at, text: `${e.direction === "in" ? "Kommen" : "Gehen"} mit dem Handy`, loc: e.raw_payload && e.raw_payload.lat != null ? e.raw_payload : null }));

  const manBySession = {};
  (cor.data || []).forEach((c) => { if (!manBySession[c.session_id]) manBySession[c.session_id] = c; });
  Object.values(manBySession).forEach((c) => add(`man:${c.session_id}`, { kind: "manuell", staffId: c.staff_id, at: c.corrected_at, text: `Zeit von Hand eingetragen/geändert – ${c.reason}` }));

  const sessions = ses.data || [];
  sessions.forEach((s) => {
    if (!s.check_out && now - new Date(s.check_in) > 12 * 3600000) add(`gehen:${s.id}`, { kind: "gehen", staffId: s.staff_id, at: s.check_in, text: "„Gehen“ fehlt (mehr als 12 Stunden)" });
  });

  // nicht erschienen: published shift started > 15 min ago, no session that day (±), no absence
  const byStaff = {};
  const absOf = {};
  const staffIds = [...new Set((shifts.data || []).map((x) => x.staff_id))];
  staffIds.forEach((sid) => {
    absOf[sid] = absenceMap((abs.data || []).filter((a) => a.staff_id === sid), (reqs.data || []).filter((r) => r.staff_id === sid));
  });
  sessions.forEach((s) => { (byStaff[s.staff_id] = byStaff[s.staff_id] || []).push(s); });
  (shifts.data || []).forEach((sh) => {
    if (!sh.planned_start) return;
    const start = new Date(sh.planned_start);
    if (now - start < 15 * 60000 || start < from) return;
    if (absOf[sh.staff_id] && absOf[sh.staff_id][sh.shift_date]) return;
    const came = (byStaff[sh.staff_id] || []).some((s) => Math.abs(new Date(s.check_in) - start) < 10 * 3600000);
    if (!came) add(`miss:${sh.staff_id}:${sh.shift_date}`, { kind: "fehlt", staffId: sh.staff_id, at: sh.planned_start, text: `Nicht erschienen – ${sh.shift_label || "Schicht"} ohne „Kommen“` });
  });

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  const present = sessions.filter((s) => !s.check_out && now - new Date(s.check_in) < 16 * 3600000).length;
  return { items, present };
}

export async function markSeen(sb, orgId, keys) {
  if (!keys.length) return { error: null };
  return sb.from("attendance_review_seen").upsert(keys.map((k) => ({ org_id: orgId, item_key: k })), { onConflict: "org_id,item_key", ignoreDuplicates: true });
}
