// Touren D3b: Vorschlag, wer einen Auftrag übernimmt – nur eine Reihenfolge, entschieden wird von Hand.
// Regeln (Entscheidungen Nutzer 20./21./22.11.2026), für alle Branchen:
//   nicht möglich: abwesend · Kunde „bitte nicht“ · zur selben Zeit schon eingeteilt
//   1) vom Kunden bevorzugt
//   2) in der Nähe (≤ near_km): erster Einsatz des Tages ab Startpunkt (Unterkunft/Büro/Zuhause), sonst ab dem letzten Einsatz davor –
//      aber nur, wenn die Person nicht schon deutlich mehr gearbeitet hat (Fairness-Bremse: % über Durchschnitt + fairness_pp)
//   3) alle anderen nach Fairness (% der Vertragsstunden in diesem Monat, wenig zuerst)
//   4) mit Hinweis: fehlende Fähigkeit oder knappe Fahrzeit
// Bei Pflege & Betreuung zählt die bekannte Bezugsperson (schon beim Kunden gewesen) zuerst, sonst nur als Gleichstand-Entscheider.
import { distanceKm } from "./maps";

const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
const hm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const coords = (j) => (j && j.lat !== null && j.lat !== undefined && j.lng !== null && j.lng !== undefined ? { lat: Number(j.lat), lng: Number(j.lng) } : null);

export function suggestStaff({ job, dayJobs, assign, staff, settings, history = [], prefs = [], requiredSkills = [] }) {
  const s = { near_km: 3, fairness_pp: 10, travel_min: 30, industry: "general", ...(settings || {}) };
  const near = Number(s.near_km), brake = Number(s.fairness_pp), travel = Number(s.travel_min);
  const jStart = toMin(job.start_time), jEnd = jStart + (job.duration_min || 0);
  const others = (dayJobs || []).filter((x) => x.id !== job.id && x.status !== "cancelled");
  const byStaff = {};
  for (const a of assign || []) (byStaff[a.staff_id] = byStaff[a.staff_id] || []).push(a.job_id);
  const pcts = staff.filter((p) => !p.absent && p.pct !== null && p.pct !== undefined).map((p) => Number(p.pct));
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const care = s.industry === "care";

  const rows = staff.map((p) => {
    const mine = (byStaff[p.id] || []);
    const here = mine.includes(job.id);
    const theirJobs = others.filter((x) => mine.includes(x.id)).map((x) => ({ ...x, s: toMin(x.start_time), e: toMin(x.start_time) + (x.duration_min || 0) }));
    const pref = prefs.find((x) => x.customer_id === job.customer_id && x.staff_id === p.id);
    const visits = (history.find((h) => h.customer_id === job.customer_id && h.staff_id === p.id) || {}).n || 0;
    const row = { staff: p, here, blocked: null, warns: [], km: null, from: null, pct: p.pct ?? null, visits, preferred: pref && pref.kind === "preferred", group: 9 };
    if (p.absent) row.blocked = { kind: "absent" };
    else if (pref && pref.kind === "excluded") row.blocked = { kind: "excluded" };
    else {
      const clash = theirJobs.find((x) => x.s < jEnd && jStart < x.e);
      if (clash) row.blocked = { kind: "busy", from: hm(clash.s), to: hm(clash.e), job: clash };
    }
    const prev = theirJobs.filter((x) => x.e <= jStart).sort((a, b) => b.e - a.e)[0] || null;
    const next = theirJobs.filter((x) => x.s >= jEnd).sort((a, b) => a.s - b.s)[0] || null;
    if (prev) {
      row.from = { kind: "job", job: prev, until: hm(prev.e) };
      const a = coords(prev), b = coords(job);
      row.km = a && b ? Math.round(distanceKm(a, b) * 10) / 10 : null;
      if (prev.e + travel > jStart) row.warns.push({ kind: "tight", minutes: jStart - prev.e });
    } else {
      row.from = p.start_label ? { kind: "start", label: p.start_label } : null;
      const k = p.start_km ? p.start_km[job.id] : undefined;
      row.km = k === undefined || k === null ? null : Math.round(Number(k) * 10) / 10;
    }
    if (next && jEnd + travel > next.s) row.warns.push({ kind: "tight_next", minutes: next.s - jEnd });
    const missing = requiredSkills.filter((k) => !(p.skills || []).includes(k));
    if (missing.length) row.warns.push({ kind: "skill", missing });
    row.isNear = row.km !== null && row.km <= near;
    row.braked = row.isNear && avg !== null && row.pct !== null && row.pct > avg + brake;
    if (row.here) row.group = -1;
    else if (row.blocked) row.group = 5;
    else if (row.warns.length) row.group = 4;
    else if (row.preferred) row.group = 1;
    else if (care && visits > 0) row.group = 2;
    else if (row.isNear && !row.braked) row.group = 2;
    else row.group = 3;
    return row;
  });

  const pctKey = (r) => (r.pct === null ? 1e9 : r.pct);
  const kmKey = (r) => (r.km === null ? 1e9 : r.km);
  rows.sort((a, b) => a.group - b.group
    || (care ? b.visits - a.visits : 0)
    || pctKey(a) - pctKey(b)
    || b.visits - a.visits
    || kmKey(a) - kmKey(b)
    || String(a.staff.name).localeCompare(String(b.staff.name)));
  return rows;
}
