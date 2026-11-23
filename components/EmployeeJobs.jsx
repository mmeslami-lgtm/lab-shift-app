"use client";

// Mitarbeiter-App, Touren D3b („My jobs“): eigene Einsätze heute und morgen.
// Nur sichtbar, wenn die Firma das Produkt „touren“ hat. Daten kommen aus der Datenbank-Funktion my_jobs:
// keine Telefonnummer des Kunden; Hinweise und Zusatzfelder nur am Tag selbst (Datenschutz).
import React, { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { tx, wdLong, dmy } from "../lib/i18n";
import { mapsHref } from "../lib/maps";

const INK = "#1B2230", MUTED = "#6B7385", PRIMARY = "#243B6B";
const pad = (n) => String(n).padStart(2, "0");
const isoToday = (add = 0) => { const d = new Date(); d.setDate(d.getDate() + add); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const endOf = (start, dur) => { const [h, m] = String(start || "0:0").split(":"); const e = ((+h || 0) * 60 + (+m || 0) + (dur || 0)) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };

export default function EmployeeJobs({ org }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    setErr(null);
    const r = await org.supabase.rpc("my_jobs", { p_org: org.orgId });
    if (r.error) { setErr(tx("Einsätze konnten nicht geladen werden.")); setRows([]); return; }
    setRows(r.data || []);
  }, [org]);
  useEffect(() => { load(); }, [load]);

  const today = isoToday(0), tomorrow = isoToday(1);
  const groups = [[today, tx("Heute")], [tomorrow, tx("Morgen")]];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 10px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>{tx("Meine Einsätze")}</div>
        <button onClick={load} aria-label={tx("Neu laden")} style={{ border: 0, background: "#fff", borderRadius: 12, width: 40, height: 40, display: "grid", placeItems: "center", color: PRIMARY, cursor: "pointer" }}><RefreshCw size={18} /></button>
      </div>
      {err && <div role="alert" style={{ background: "#FDECEC", color: "#8F1B1B", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      {rows === null ? <div style={{ fontSize: 14, color: MUTED }}>{tx("Lädt …")}</div> : groups.map(([iso, label]) => {
        const list = rows.filter((j) => j.work_date === iso);
        const d = new Date(iso + "T12:00:00");
        return (
          <section key={iso} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: MUTED, margin: "0 2px 6px" }}>{label} · {wdLong(d.getDay())}, {dmy(d)}</div>
            {list.length === 0 && <div style={{ background: "#EDEFF4", borderRadius: 16, padding: "12px 14px", fontSize: 14, color: MUTED }}>{tx("Keine Einsätze.")}</div>}
            {list.map((j) => {
              const href = mapsHref({ lat: j.lat, lng: j.lng, maps_url: j.maps_url, address: j.address });
              return (
                <article key={j.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, color: INK }}>
                  <div className="tn" style={{ fontSize: 17, fontWeight: 700 }}>{j.start_time} – {endOf(j.start_time, j.duration_min)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{j.customer}</div>
                  <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{j.address}</div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                    {j.service && <span>{j.service}</span>}
                    {j.material && <span>{j.material === "ours" ? tx("Material: von uns") : tx("Material: vom Kunden")}</span>}
                    {j.team && j.team.length > 0 && <span>{tx("mit {0}", j.team.join(", "))}</span>}
                  </div>
                  {j.notes && <div style={{ whiteSpace: "pre-wrap", background: "#FFF7E6", color: "#7A4B00", borderRadius: 10, padding: "8px 10px", fontSize: 14, marginTop: 8 }}>{j.notes}</div>}
                  {Array.isArray(j.fields) && j.fields.length > 0 && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      {j.fields.map((f, i) => <div key={i}><b>{f.name}:</b> {f.kind === "bool" ? (f.value ? tx("Ja") : tx("Nein")) : String(f.value)}</div>)}
                    </div>
                  )}
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 15, fontWeight: 650, textDecoration: "none" }}>
                      <MapPin size={18} />{tx("Route")}
                    </a>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
      <div style={{ fontSize: 12, color: MUTED, margin: "4px 2px 0" }}>{tx("Hinweise zum Einsatz sind nur am Tag selbst sichtbar.")}</div>
    </div>
  );
}
