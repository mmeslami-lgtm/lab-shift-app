// Fahrten aus Aufträgen bauen (Touren-Transport, 23.11.2026) – gemeinsam für das Transport-Blatt (Büro)
// und „Fahrten“ in der Mitarbeiter-App (Fahrer:innen).
// Eingabe = Ergebnis von touren_transport / my_trips: { travel_min, staff[], jobs[], driver_of[]? }
// Pro Tag und Person: Abholen am Startpunkt (Beginn − Fahrzeit) → 1. Auftrag, Weiterfahrt zwischen Aufträgen,
// Rückfahrt nach dem letzten (optional). Gleiche Fahrt (Zeit, von, nach, Fahrer:in) = eine Zeile mit mehreren Personen.
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
export const shiftTime = (t, min) => { const e = (((toMin(t) + (min || 0)) % 1440) + 1440) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };

export function buildTrips(data, { back = true, homeLabel = "Zuhause" } = {}) {
  if (!data) return [];
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
    const legs = {}; const missing = [];
    const add = (time, from, to, arrive, sid, kind) => {
      const dr = drv[`${day}|${sid}`] || {};
      const k = `${time}|${from.key}|${to.key}|${dr.driver_id || ""}`;
      const L = legs[k] || (legs[k] = { key: k, time, from, to, arrive, kind, driverId: dr.driver_id || null, manual: false, who: [] });
      if (dr.manual) L.manual = true;
      L.who.push(st[sid] || { id: sid, name: "?" });
    };
    Object.entries(byDay[day]).forEach(([sid, list]) => {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
      const home = startOf(st[sid]);
      if (home) add(shiftTime(list[0].start_time, -(data.travel_min || 0)), home, place(list[0]), list[0].start_time, sid, "pick");
      else missing.push(st[sid] || { id: sid, name: "?" });
      for (let i = 1; i < list.length; i++) add(shiftTime(list[i - 1].start_time, list[i - 1].duration_min), place(list[i - 1]), place(list[i]), list[i].start_time, sid, "next");
      const last = list[list.length - 1];
      if (back && home) add(shiftTime(last.start_time, last.duration_min), place(last), home, null, sid, "back");
    });
    const rows = Object.values(legs).sort((a, b) => a.time.localeCompare(b.time) || a.from.label.localeCompare(b.from.label));
    rows.forEach((r) => r.who.sort((a, b) => a.name.localeCompare(b.name)));
    return { day, rows, missing };
  });
}
