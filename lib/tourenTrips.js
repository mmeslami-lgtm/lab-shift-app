// Fahrten aus Aufträgen bauen (Touren-Transport) – gemeinsam für das Transport-Blatt (Büro) und „Fahrten“
// in der Mitarbeiter-App (Fahrer:innen).
// Eingabe = Ergebnis von touren_transport / my_trips: { travel_min, staff[], jobs[], driver_of[]?, busy[]? }
//
// 24.11.2026 – Sammelfahrten (Wunsch Nutzer: eine Fahrer:in kann nicht gleichzeitig an zwei Orten abholen):
//  * Abholen: alle, die mit derselben Fahrer:in zum selben Auftrag zur selben Zeit fahren, = EINE Fahrt mit
//    mehreren Haltestellen. Erst die weiteste, Zeiten rückwärts aus der Entfernung (Luftlinie × 1,3, 35 km/h,
//    + 5 Min. je Halt, auf 5 Min. aufgerundet, mind. 10 Min.). Ohne Koordinaten: Fahrzeit aus den Einstellungen.
//  * Ab einem Auftrag (gleiche Fahrer:in, gleicher Ort, gleiche Zeit) = EINE Fahrt: Rückfahrt nach Hause/Unterkunft
//    und Weiterfahrt zum nächsten Auftrag zusammen, erst die nächste Adresse, Zeiten vorwärts.
//    Warnung, wenn ein nächster Auftrag nicht rechtzeitig erreicht wird.
//  * Warnungen je Fahrer:in: zwei Fahrten gleichzeitig („overlap“), Fahrer:in arbeitet selbst („self“), zu knapp („late“).
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
const fmt = (min) => { const e = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };
export const shiftTime = (t, min) => fmt(toMin(t) + (min || 0));

const SPEED_KMH = 35, ROAD_FACTOR = 1.3, STOP_MIN = 5;
function km(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Fahrminuten zwischen zwei Orten (ohne Koordinaten: Fahrzeit aus den Einstellungen)
export function driveMin(a, b, fallback = 30) {
  const d = km(a, b);
  if (d === null) return fallback;
  if (d < 0.05) return 0; // gleicher Ort
  return Math.max(10, Math.ceil(((d * ROAD_FACTOR) / SPEED_KMH * 60 + STOP_MIN) / 5) * 5);
}

export function buildTrips(data, { back = true, homeLabel = "Zuhause", single = false } = {}) {
  if (!data) return [];
  const fb = data.travel_min || 30;
  const st = {}; (data.staff || []).forEach((x) => { st[x.id] = x; });
  const drv = {}; (data.driver_of || []).forEach((x) => { drv[`${x.work_date}|${x.staff_id}`] = x; });
  const startOf = (x) => (x && x.start_kind !== "none" && x.start_address
    ? { key: "s:" + (x.start_kind === "place" ? x.start_name : x.id), label: x.start_kind === "place" ? x.start_name : homeLabel, addr: x.start_address, lat: x.start_lat ?? null, lng: x.start_lng ?? null }
    : null);
  const place = (j) => ({ key: "j:" + j.id, label: j.customer, addr: j.address, lat: j.lat ?? null, lng: j.lng ?? null, maps_url: j.maps_url || null });
  const byDay = {};
  (data.jobs || []).forEach((j) => (j.staff || []).forEach((sid) => {
    if ((j.absent || []).includes(sid)) return;
    const d = (byDay[j.work_date] = byDay[j.work_date] || {});
    (d[sid] = d[sid] || []).push(j);
  }));

  return Object.keys(byDay).sort().map((day) => {
    const missing = [];
    const picks = {}, outs = {};
    const person = (sid) => st[sid] || { id: sid, name: "?" };
    Object.entries(byDay[day]).forEach(([sid, list]) => {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
      const dr = drv[`${day}|${sid}`] || {}; const did = dr.driver_id || null;
      const home = startOf(st[sid]);
      const first = list[0], last = list[list.length - 1];
      if (home) {
        const to = place(first); const k = `${did}|${to.key}|${first.start_time}`;
        const T = picks[k] || (picks[k] = { kind: "pick", driverId: did, manual: false, to, arrive: first.start_time, stops: {} });
        if (dr.manual) T.manual = true;
        const s = T.stops[home.key] || (T.stops[home.key] = { place: home, who: [] }); s.who.push(person(sid));
      } else missing.push(person(sid));
      // ab einem Auftrag: zum nächsten Auftrag oder (nach dem letzten) nach Hause
      const out = (fromJob, dest, deadline) => {
        const from = place(fromJob); const time = shiftTime(fromJob.start_time, fromJob.duration_min); const k = `${did}|${from.key}|${time}`;
        const T = outs[k] || (outs[k] = { driverId: did, manual: false, from, time, stops: {} });
        if (dr.manual) T.manual = true;
        const s = T.stops[dest.key] || (T.stops[dest.key] = { place: dest, who: [], deadline }); s.who.push(person(sid));
      };
      for (let i = 1; i < list.length; i++) out(list[i - 1], place(list[i]), list[i].start_time);
      if (back && home) out(last, home, null);
    });

    const rows = [];
    // Abholen: weiteste Haltestelle zuerst, Zeiten rückwärts ab Beginn
    Object.values(picks).forEach((T) => {
      const stops = Object.values(T.stops);
      stops.sort((a, b) => (km(b.place, T.to) ?? 1e9) - (km(a.place, T.to) ?? 1e9) || a.place.label.localeCompare(b.place.label));
      let cur = toMin(T.arrive) - driveMin(stops[stops.length - 1].place, T.to, fb);
      for (let i = stops.length - 1; i >= 0; i--) {
        if (i < stops.length - 1) cur -= driveMin(stops[i].place, stops[i + 1].place, fb) || STOP_MIN;
        stops[i].time = fmt(cur);
      }
      rows.push({ ...T, stops, time: stops[0].time, start: toMin(stops[0].time), end: toMin(T.arrive) });
    });
    // Ab Auftrag: nächste Adresse zuerst, Zeiten vorwärts
    Object.values(outs).forEach((T) => {
      const left = Object.values(T.stops); const stops = []; let at = T.from; let cur = toMin(T.time); let late = false;
      while (left.length) {
        left.sort((a, b) => (km(at, a.place) ?? 1e9) - (km(at, b.place) ?? 1e9) || a.place.label.localeCompare(b.place.label));
        const s = left.shift(); cur += driveMin(at, s.place, fb); s.time = fmt(cur); stops.push(s); at = s.place;
        if (s.deadline && cur > toMin(s.deadline)) late = true;
      }
      const jobs = stops.filter((x) => x.deadline);
      const kind = jobs.length === 0 ? "back" : jobs.length === stops.length ? "next" : "out";
      rows.push({ ...T, kind, stops, arrive: jobs.length ? jobs[0].deadline : null, start: toMin(T.time), end: cur, late });
    });
    rows.forEach((r) => {
      r.who = r.stops.flatMap((s) => s.who); r.who.sort((a, b) => a.name.localeCompare(b.name));
      r.stops.forEach((s) => s.who.sort((a, b) => a.name.localeCompare(b.name)));
      r.key = `${r.kind}|${r.driverId}|${r.time}|${r.stops.map((s) => s.place.key).join(",")}|${r.to ? r.to.key : ""}`;
      r.warn = r.late ? ["late"] : [];
    });
    rows.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));

    // Überschneidungen je Fahrer:in (ohne Fahrer:in keine Prüfung, außer in der eigenen App: single)
    const groupOf = (r) => (single ? "me" : r.driverId);
    const groups = {};
    rows.forEach((r) => { const g = groupOf(r); if (g) (groups[g] = groups[g] || []).push(r); });
    Object.entries(groups).forEach(([g, list]) => {
      for (let i = 0; i < list.length; i++) for (let k = i + 1; k < list.length; k++) {
        const a = list[i], b = list[k];
        if (a.start < b.end && b.start < a.end) { if (!a.warn.includes("overlap")) a.warn.push("overlap"); if (!b.warn.includes("overlap")) b.warn.push("overlap"); }
      }
      // Fahrer:in arbeitet selbst zu dieser Zeit
      const own = single
        ? (data.busy || []).filter((x) => x.work_date === day)
        : (data.jobs || []).filter((j) => j.work_date === day && (j.staff || []).includes(g) && !(j.absent || []).includes(g));
      own.forEach((j) => {
        const s = toMin(j.start_time), e = s + (j.duration_min || 0);
        list.forEach((r) => { if (r.start < e && s < r.end && !r.warn.includes("self")) r.warn.push("self"); });
      });
    });
    return { day, rows, missing };
  });
}
