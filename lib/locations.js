// „Mehrere Standorte“ (Dienstplaner allgemein, Skript 32). Shared helpers for the planner, the app and the time sheet.
//   work_locations: id, name, code (Kürzel, z. B. N1), address, team_period ('month' | 'week'), active
//   shift_definitions with location_id: the shifts of one place (count_weekday / count_weekend people)
//   location_team: who belongs to a place in a period (month: starts on the 1st, week: starts on Monday)
//   scheduled_shifts.location_id: the place is part of the planned shift itself

export const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const isoDate = (dt) => isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());

// Monday of the week of y-m-d (week Mo–So)
export function mondayOf(y, m, d) {
  const dt = new Date(y, m, d, 12);
  const wd = (dt.getDay() + 6) % 7; // Mo = 0
  dt.setDate(dt.getDate() - wd);
  return isoDate(dt);
}

// start of the team period a day belongs to, for one place
export function periodStartOf(loc, y, m, d) {
  return loc && loc.team_period === "week" ? mondayOf(y, m, d) : isoOf(y, m, 1);
}

// the weeks (Mo–So) that touch a month: [{ start: "2026-10-26", from: Date, to: Date, label }]
export function weeksOfMonth(y, m) {
  const last = new Date(y, m + 1, 0).getDate();
  const out = []; const seen = new Set();
  for (let d = 1; d <= last; d++) {
    const s = mondayOf(y, m, d);
    if (seen.has(s)) continue;
    seen.add(s);
    const from = new Date(s + "T12:00:00"); const to = new Date(from); to.setDate(to.getDate() + 6);
    const f = (x) => `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`;
    out.push({ start: s, from, to, label: `${f(from)}–${f(to)}` });
  }
  return out;
}

// earliest date whose team rows can matter for a month (Monday before the 1st)
export const teamRangeStart = (y, m) => mondayOf(y, m, 1);

// "N1 · Früh" – label of a shift with the short code of its place
export const placeLabel = (loc, label) => (loc && loc.code ? `${loc.code} · ${label}` : label);

// defs (shift_definitions rows) + places -> same rows, labels with the place code in front
export function withPlaceCodes(defs, places) {
  const byId = Object.fromEntries((places || []).map((p) => [p.id, p]));
  return (defs || []).map((d) => (d.location_id && byId[d.location_id] ? { ...d, label: placeLabel(byId[d.location_id], d.label) } : d));
}

// route link to the maps app of the phone (iPhone: Apple Maps, otherwise Google Maps)
export function routeHref(place) {
  const dest = encodeURIComponent((place && (place.address || place.name)) || "");
  const ios = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent || "");
  return ios ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
