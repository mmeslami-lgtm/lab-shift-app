"use client";

// Mitarbeiter-App „Fahrten“ (Touren, 23.11.2026): nur für Fahrer:innen (Mitarbeitende → Bearbeiten → „Fahrer:in“).
// Heute und morgen: wen ich wann wo abhole, wohin es geht, Weiterfahrt und Rückfahrt.
// Daten aus my_trips (nur die eigenen Fahrgäste, kein Telefon des Kunden). Ändern kann man hier nichts.
import React, { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw, Phone } from "lucide-react";
import { tx, wdLong, dmy } from "../lib/i18n";
import { mapsHref } from "../lib/maps";
import { buildTrips } from "../lib/tourenTrips";

const INK = "#1B2230", MUTED = "#6B7385", PRIMARY = "#243B6B";
const pad = (n) => String(n).padStart(2, "0");
const addIso = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const routeBtn = { display: "inline-flex", alignItems: "center", gap: 4, minHeight: 36, borderRadius: 10, background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 650, textDecoration: "none", padding: "0 10px", marginTop: 4 };

export default function EmployeeTrips({ org, initial }) {
  const [data, setData] = useState(initial || null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setErr(null);
    const r = await org.supabase.rpc("my_trips", { p_org: org.orgId });
    if (r.error) { setErr(tx("Fahrten konnten nicht geladen werden.")); return; }
    setData(r.data || { is_driver: false });
  }, [org]);
  useEffect(() => { if (!initial) load(); }, [load, initial]);

  if (!data) return <div style={{ fontSize: 14, color: MUTED }}>{tx("Lädt …")}</div>;
  const days = buildTrips(data, { back: true, homeLabel: tx("Zuhause") });
  const today = data.today || addIso(new Date().toISOString().slice(0, 10), 0);
  const KIND = { pick: tx("Abholen"), next: tx("Weiterfahrt"), back: tx("Rückfahrt") };
  const place = (p) => {
    const href = mapsHref({ lat: p.lat, lng: p.lng, maps_url: p.maps_url, address: p.addr });
    return (
      <div>
        <div style={{ fontWeight: 650 }}>{p.label}</div>
        <div style={{ fontSize: 14, color: MUTED }}>{p.addr}</div>
        {href && <a href={href} target="_blank" rel="noopener noreferrer" style={routeBtn}><MapPin size={15} />{tx("Route")}</a>}
      </div>
    );
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 10px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>{tx("Meine Fahrten")}</div>
        <button onClick={load} aria-label={tx("Neu laden")} style={{ border: 0, background: "#fff", borderRadius: 12, width: 40, height: 40, display: "grid", placeItems: "center", color: PRIMARY, cursor: "pointer" }}><RefreshCw size={18} /></button>
      </div>
      {err && <div role="alert" style={{ background: "#FDECEC", color: "#8F1B1B", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      {[[today, tx("Heute")], [addIso(today, 1), tx("Morgen")]].map(([iso, label]) => {
        const day = days.find((d) => d.day === iso);
        const rows = day ? day.rows : [];
        const d = new Date(iso + "T12:00:00");
        return (
          <section key={iso} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: MUTED, margin: "0 2px 6px" }}>{label} · {wdLong(d.getDay())}, {dmy(d)}</div>
            {rows.length === 0 && <div style={{ background: "#EDEFF4", borderRadius: 16, padding: "12px 14px", fontSize: 14, color: MUTED }}>{tx("Keine Fahrten.")}</div>}
            {rows.map((r) => (
              <article key={r.key} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, color: INK }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="tn" style={{ fontSize: 20, fontWeight: 750 }}>{r.time}</span>
                  <span style={{ fontSize: 13, fontWeight: 650, color: r.kind === "back" ? MUTED : PRIMARY }}>{KIND[r.kind]}</span>
                  {r.arrive && <span style={{ marginLeft: "auto", fontSize: 13, color: MUTED }}>{tx("Beginn {0}", r.arrive)}</span>}
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <div><div style={{ fontSize: 12, color: MUTED }}>{tx("Von")}</div>{place(r.from)}</div>
                  <div>
                    <div style={{ fontSize: 12, color: MUTED }}>{tx("Wer")}</div>
                    {r.who.map((w) => (
                      <div key={w.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
                        <span style={{ fontWeight: 600 }}>{w.name}</span>
                        {w.phone && <a href={`tel:${w.phone}`} aria-label={tx("{0} anrufen", w.name)} style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 36, borderRadius: 10, border: "1.5px solid #9AAED0", color: INK, fontSize: 13, textDecoration: "none", padding: "0 10px" }}><Phone size={14} />{tx("Anrufen")}</a>}
                      </div>
                    ))}
                  </div>
                  <div><div style={{ fontSize: 12, color: MUTED }}>{tx("Nach")}</div>{place(r.to)}</div>
                </div>
              </article>
            ))}
            {day && day.missing.length > 0 && <div style={{ fontSize: 13, color: "#8F1B1B", margin: "2px 2px 0" }}>{tx("Ohne Startpunkt (Abholung bitte klären): {0}", day.missing.map((m) => m.name).join(", "))}</div>}
          </section>
        );
      })}
      <div style={{ fontSize: 12, color: MUTED, margin: "4px 2px 0" }}>{tx("Abholzeit = Beginn minus Fahrzeit. Änderungen macht das Büro.")}</div>
    </div>
  );
}
