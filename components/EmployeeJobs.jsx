"use client";

// Mitarbeiter-App, Touren D3b („My jobs“): eigene Einsätze heute und morgen.
// Nur sichtbar, wenn die Firma das Produkt „touren“ hat. Daten kommen aus der Datenbank-Funktion my_jobs:
// keine Telefonnummer des Kunden; Hinweise und Zusatzfelder nur am Tag selbst (Datenschutz).
// 24.11.2026 neu gestaltet (Wunsch Nutzer: „zu leblos“): große Karte „Nächster Einsatz“ mit Countdown,
// Umschalter Heute/Morgen, farbige Karten, Team als Kreise, freundliche Anzeige an freien Tagen
// (mit dem nächsten Einsatz aus my_next_job – nur Datum/Uhrzeit).
import React, { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw, Navigation } from "lucide-react";
// D3c-1 (24.11.2026): in der großen Karte „▶ Ich bin da“ → „✓ Fertig“ (job_checkin / job_finish);
// beim Fertig ein Fenster von unten: „Alles erledigt“ oder „Nicht fertig – morgen weiter“ (+ Restdauer);
// dauerte es >15 Min. länger: Grund per Tipp (optional). Gründe werden als deutscher Schlüssel gespeichert.
import { tx, wdLong, wdShort, dmy, dm } from "../lib/i18n";
import { mapsHref } from "../lib/maps";

const INK = "#1B2230", MUTED = "#6B7385", PRIMARY = "#243B6B";
const COLORS = ["#2F80ED", "#16A34A", "#D97706", "#9333EA", "#DB2777", "#0891B2", "#65A30D", "#DC2626"];
const pad = (n) => String(n).padStart(2, "0");
const isoToday = (add = 0) => { const d = new Date(); d.setDate(d.getDate() + add); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
const endOf = (start, dur) => { const e = (toMin(start) + (dur || 0)) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };
const colorOf = (s) => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Avatars({ names, light }) {
  if (!names || !names.length) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }} title={names.join(", ")}>
      {names.slice(0, 4).map((n, i) => (
        <span key={i} aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 999, marginLeft: i ? -7 : 0, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#fff", background: colorOf(n), border: `2px solid ${light ? PRIMARY : "#fff"}` }}>{initials(n)}</span>
      ))}
      <span style={{ marginLeft: 6, fontSize: 13, color: light ? "rgba(255,255,255,.85)" : MUTED }}>{tx("mit {0}", names.join(", "))}</span>
    </span>
  );
}

export default function EmployeeJobs({ org }) {
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(undefined);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false); // Neu-laden-Knopf: dreht sich, danach kurz „aktualisiert ✓“
  const [fresh, setFresh] = useState(false);
  const [day, setDay] = useState(0); // 0 = heute, 1 = morgen
  const [now, setNow] = useState(() => new Date());
  const [act, setAct] = useState(false); // Knopf gedrückt (warten auf Server)
  const [sheet, setSheet] = useState(null); // { job, step: "choose" | "rest", reason, rest }
  const [thanks, setThanks] = useState("");
  const load = useCallback(async (manual = false) => {
    setErr(null); setBusy(true); setFresh(false);
    const r = await org.supabase.rpc("my_jobs", { p_org: org.orgId });
    if (r.error) { setErr(tx("Einsätze konnten nicht geladen werden.")); setRows([]); setBusy(false); return; }
    setRows(r.data || []);
    // nächster Einsatz nach morgen – nur Datum/Uhrzeit; bei Fehler einfach nichts zeigen
    const n = await org.supabase.rpc("my_next_job", { p_org: org.orgId });
    setNext(!n.error ? n.data || null : null);
    setBusy(false); if (manual === true) { setFresh(true); setTimeout(() => setFresh(false), 2500); }
  }, [org]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const today = isoToday(0), tomorrow = isoToday(1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const all = rows || [];
  const listToday = all.filter((j) => j.work_date === today), listTomorrow = all.filter((j) => j.work_date === tomorrow);
  const tsMin = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
  const tsHm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hm = (m) => { m = Math.max(0, Math.round(m)); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
  // erledigt = „Fertig“ gedrückt, oder (ohne „Ich bin da“) die Zeit ist vorbei
  const isDone = (j) => !!j.finished_at || (j.work_date === today && !j.arrived_at && toMin(j.start_time) + (j.duration_min || 0) <= nowMin);
  const isNow = (j) => j.work_date === today && !isDone(j) && (!!j.arrived_at || toMin(j.start_time) <= nowMin);
  const endMin = (j) => toMin(j.start_time) + (j.duration_min || 0);
  async function checkin(j) {
    setAct(true); setErr(null);
    const r = await org.supabase.rpc("job_checkin", { p_job: j.id });
    setAct(false);
    if (r.error) { setErr(r.error.message); return; }
    await load();
  }
  async function finish(outcome) {
    const j = sheet.job; setAct(true); setErr(null);
    const r = await org.supabase.rpc("job_finish", { p_job: j.id, p_outcome: outcome, p_remaining_min: outcome === "partial" ? sheet.rest : null, p_reason: sheet.reason || null });
    setAct(false);
    if (r.error) { setErr(r.error.message); return; }
    setSheet(null); setThanks(outcome === "partial" ? tx("Gespeichert – das Büro plant den Rest mit dem Kunden.") : tx("Danke! Einsatz erledigt ✓"));
    setTimeout(() => setThanks(""), 4000);
    await load();
  }
  // Hero: laufender oder nächster Einsatz (heute, sonst morgen)
  const hero = listToday.find((j) => !isDone(j)) || listTomorrow[0] || null;
  const countdown = (j) => {
    if (j.arrived_at && j.work_date === today) {
      const left = endMin(j) - nowMin;
      return left >= 0 ? tx("Vor Ort seit {0} · noch {1} Std.", tsHm(j.arrived_at), hm(left)) : tx("Vor Ort seit {0} · läuft länger (+{1})", tsHm(j.arrived_at), hm(-left));
    }
    if (isNow(j)) return tx("Jetzt im Einsatz · bis {0}", endOf(j.start_time, j.duration_min));
    if (j.work_date !== today) return tx("Morgen");
    const m = toMin(j.start_time) - nowMin; const h = Math.floor(m / 60), mm = m % 60;
    return h ? tx("in {0} Std. {1} Min.", h, mm) : tx("in {0} Min.", mm);
  };
  const shown = day === 0 ? listToday : listTomorrow;
  const dShown = new Date((day === 0 ? today : tomorrow) + "T12:00:00");
  const routeOf = (j) => mapsHref({ lat: j.lat, lng: j.lng, maps_url: j.maps_url, address: j.address });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 12px" }}>
        <div style={{ fontSize: 20, fontWeight: 750, color: INK, letterSpacing: -0.3 }}>{tx("Meine Einsätze")}</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{fresh && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>✓ {tx("aktualisiert")}</span>}<button onClick={() => load(true)} disabled={busy} aria-label={tx("Neu laden")} style={{ border: 0, background: "#fff", borderRadius: 12, width: 40, height: 40, display: "grid", placeItems: "center", color: PRIMARY, cursor: "pointer", boxShadow: "0 1px 3px rgba(27,34,48,.08)" }}><RefreshCw size={18} className={busy ? "dg-spin" : undefined} /></button></span>
      <style>{`@keyframes dgspin{to{transform:rotate(360deg)}} .dg-spin{animation:dgspin .8s linear infinite}`}</style>
      </div>
      {err && <div role="alert" style={{ background: "#FDECEC", color: "#8F1B1B", borderRadius: 12, padding: "10px 12px", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      {rows === null && <div style={{ fontSize: 14, color: MUTED }}>{tx("Lädt …")}</div>}

      {/* Große Karte: nächster Einsatz – oder freie Tage */}
      {rows !== null && (hero ? (
        <div style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #34539A 100%)`, color: "#fff", borderRadius: 22, padding: "16px 18px", marginBottom: 16, boxShadow: "0 6px 18px rgba(36,59,107,.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.9 }}>
            {(isNow(hero) || hero.arrived_at) && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: hero.arrived_at && endMin(hero) < nowMin ? "#FB923C" : "#4ADE80", boxShadow: "0 0 0 4px rgba(74,222,128,.25)" }} />}
            <span>{isNow(hero) || hero.arrived_at ? "" : tx("Dein nächster Einsatz") + " · "}{countdown(hero)}</span>
          </div>
          <div className="tn" style={{ fontSize: 32, fontWeight: 750, letterSpacing: -0.8, margin: "6px 0 2px" }}>{hero.start_time} – {endOf(hero.start_time, hero.duration_min)}</div>
          <div style={{ fontSize: 18, fontWeight: 650 }}>{hero.customer}</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, display: "flex", gap: 5, alignItems: "flex-start" }}><MapPin size={15} style={{ flex: "0 0 auto", marginTop: 2 }} />{hero.address}</div>
          {hero.service && <span style={{ display: "inline-block", marginTop: 8, background: "rgba(255,255,255,.16)", borderRadius: 999, padding: "3px 10px", fontSize: 13 }}>{hero.service}</span>}
          {hero.team && hero.team.length > 0 && <div style={{ marginTop: 10 }}><Avatars names={hero.team} light /></div>}
          {hero.work_date === today && hero.arrived_at ? (
            <button type="button" onClick={() => setSheet({ job: hero, step: "choose", reason: "", rest: 60 })} disabled={act}
              style={{ marginTop: 14, width: "100%", border: 0, minHeight: 50, borderRadius: 14, background: "#22C55E", color: "#fff", fontSize: 17, fontWeight: 750, cursor: "pointer" }}>✓ {tx("Fertig")}</button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: hero.work_date === today && routeOf(hero) ? "1fr 1fr" : "1fr", gap: 8, marginTop: 14 }}>
              {routeOf(hero) && (
                <a href={routeOf(hero)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 14, background: hero.work_date === today ? "rgba(255,255,255,.16)" : "#fff", color: hero.work_date === today ? "#fff" : PRIMARY, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
                  <Navigation size={18} />{hero.work_date === today ? tx("Route") : tx("Route starten")}
                </a>
              )}
              {hero.work_date === today && (
                <button type="button" onClick={() => checkin(hero)} disabled={act} style={{ border: 0, minHeight: 48, borderRadius: 14, background: "#fff", color: PRIMARY, fontSize: 16, fontWeight: 750, cursor: "pointer" }}>▶ {tx("Ich bin da")}</button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "linear-gradient(135deg, #E6F4EA 0%, #F3FAF5 100%)", borderRadius: 22, padding: "20px 18px", marginBottom: 16, color: "#14532D", textAlign: "center" }}>
          <div aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>🌴</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{listToday.length ? tx("Für heute alles erledigt – danke!") : tx("Heute und morgen frei")}</div>
          <div style={{ fontSize: 14, marginTop: 4, opacity: 0.85 }}>
            {next ? tx("Nächster Einsatz: {0} · {1}", `${wdShort(new Date(next.work_date + "T12:00:00").getDay())} ${dm(new Date(next.work_date + "T12:00:00"))}`, next.start_time)
              : next === null ? tx("Noch nichts geplant – erhol dich gut!") : ""}
          </div>
        </div>
      ))}

      {/* Heute / Morgen */}
      {rows !== null && (
        <>
          <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff", borderRadius: 14, padding: 4, marginBottom: 10, boxShadow: "0 1px 3px rgba(27,34,48,.06)" }}>
            {[[0, tx("Heute"), listToday.length], [1, tx("Morgen"), listTomorrow.length]].map(([k, label, n]) => (
              <button key={k} role="tab" aria-selected={day === k} onClick={() => setDay(k)} style={{ border: 0, borderRadius: 11, minHeight: 40, cursor: "pointer", fontSize: 15, fontWeight: day === k ? 700 : 550, background: day === k ? PRIMARY : "transparent", color: day === k ? "#fff" : INK }}>
                {label}{n ? <span style={{ marginLeft: 6, fontSize: 12, borderRadius: 999, padding: "1px 7px", background: day === k ? "rgba(255,255,255,.2)" : "#E9EEF8" }}>{n}</span> : null}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, color: MUTED, margin: "0 2px 8px" }}>{wdLong(dShown.getDay())}, {dmy(dShown)}</div>
          {shown.length === 0 && <div style={{ background: "#fff", borderRadius: 16, padding: "16px 14px", fontSize: 14, color: MUTED, textAlign: "center" }}>☕ {tx("Keine Einsätze an diesem Tag.")}</div>}
          {shown.map((j) => {
            const href = routeOf(j); const done = isDone(j); const col = colorOf(j.service || j.customer);
            return (
              <article key={j.id} style={{ position: "relative", background: "#fff", borderRadius: 18, padding: "14px 14px 14px 18px", marginBottom: 10, color: INK, overflow: "hidden", opacity: done ? 0.6 : 1, boxShadow: "0 1px 4px rgba(27,34,48,.07)" }}>
                <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: col }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="tn" style={{ background: `${col}1A`, color: INK, borderRadius: 10, padding: "4px 10px", fontSize: 16, fontWeight: 750 }}>{j.start_time} – {endOf(j.start_time, j.duration_min)}</span>
                  {j.arrived_at && !j.finished_at && <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8", background: "#DBEAFE", borderRadius: 999, padding: "3px 9px" }}>● {tx("vor Ort")}</span>}
                  {!j.arrived_at && isNow(j) && <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D", background: "#DCFCE7", borderRadius: 999, padding: "3px 9px" }}>● {tx("jetzt")}</span>}
                  {j.finished_at && j.outcome === "partial" && <span style={{ fontSize: 12, fontWeight: 700, color: "#6B21A8", background: "#F3E8FF", borderRadius: 999, padding: "3px 9px" }}>⏸ {tx("nicht fertig")}</span>}
                  {j.finished_at && j.outcome !== "partial" && <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>✓ {tx("fertig {0}", tsHm(j.finished_at))}</span>}
                  {done && !j.finished_at && <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>✓ {tx("vorbei")}</span>}
                  {hero && hero.id === j.id && !isNow(j) && <span style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, background: "#E9EEF8", borderRadius: 999, padding: "3px 9px" }}>{tx("als Nächstes")}</span>}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>{j.customer}</div>
                <div style={{ fontSize: 14, color: MUTED, marginTop: 2, display: "flex", gap: 5, alignItems: "flex-start" }}><MapPin size={15} style={{ flex: "0 0 auto", marginTop: 2 }} />{j.address}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {j.service && <span style={{ fontSize: 13, borderRadius: 999, padding: "3px 10px", background: `${col}1A`, color: INK }}>📋 {j.service}</span>}
                  {j.material && <span style={{ fontSize: 13, borderRadius: 999, padding: "3px 10px", background: "#EEF2F7" }}>🧴 {j.material === "ours" ? tx("Material: von uns") : tx("Material: vom Kunden")}</span>}
                </div>
                {j.team && j.team.length > 0 && <div style={{ marginTop: 10 }}><Avatars names={j.team} /></div>}
                {j.notes && <div style={{ whiteSpace: "pre-wrap", background: "#FFF7E6", color: "#7A4B00", borderRadius: 12, padding: "9px 11px", fontSize: 14, marginTop: 10 }}>📝 {j.notes}</div>}
                {Array.isArray(j.fields) && j.fields.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {j.fields.map((f, i) => <span key={i} style={{ fontSize: 13, borderRadius: 10, padding: "3px 9px", background: "#F1F5F9" }}><b>{f.name}:</b> {f.kind === "bool" ? (f.value ? tx("Ja") : tx("Nein")) : String(f.value)}</span>)}
                  </div>
                )}
                {/* nur EIN Route-Knopf je Einsatz: für den nächsten Einsatz steht er oben in der großen Karte */}
                {href && !done && !(hero && hero.id === j.id) && (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 12, border: `1.5px solid ${PRIMARY}`, color: PRIMARY, fontSize: 15, fontWeight: 650, textDecoration: "none" }}>
                    <MapPin size={17} />{tx("Route")}
                  </a>
                )}
              </article>
            );
          })}
          <div style={{ fontSize: 12, color: MUTED, margin: "6px 2px 0" }}>{tx("Hinweise zum Einsatz sind nur am Tag selbst sichtbar.")}</div>
        </>
      )}
      {thanks && <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: 96, zIndex: 60, background: "#14532D", color: "#fff", borderRadius: 14, padding: "12px 14px", fontSize: 15, fontWeight: 650, textAlign: "center", boxShadow: "0 6px 20px rgba(0,0,0,.2)" }}>{thanks}</div>}
      {sheet && (() => {
        const j = sheet.job; const arr = j.arrived_at ? tsMin(j.arrived_at) : nowMin; const actual = nowMin - arr; const longer = actual - (j.duration_min || 0) > 15;
        const REASONS = ["Mehr Arbeit", "Kunde wollte mehr", "Später angefangen", "Anderes"];
        const RESTS = [[60, "1 Std."], [120, "2 Std."], [180, "3 Std."], [240, "4 Std."], [480, "ganzer Tag"]];
        const big = { width: "100%", border: 0, minHeight: 56, borderRadius: 16, fontSize: 16, fontWeight: 750, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "0 16px" };
        const chip = (on) => ({ border: `1.5px solid ${on ? PRIMARY : "#CBD5E1"}`, background: on ? PRIMARY : "#fff", color: on ? "#fff" : INK, borderRadius: 999, padding: "8px 13px", fontSize: 14, margin: "6px 6px 0 0", cursor: "pointer" });
        return (
          <div role="dialog" aria-modal="true" aria-label={tx("Einsatz abschließen")} style={{ position: "fixed", inset: 0, zIndex: 70 }}>
            <div onClick={() => !act && setSheet(null)} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.4)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#fff", borderRadius: "24px 24px 0 0", padding: "14px 18px 26px", maxWidth: 560, margin: "0 auto", color: INK }}>
              <div style={{ width: 40, height: 5, borderRadius: 5, background: "#CBD5E1", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 18, fontWeight: 750 }}>{tx("Einsatz bei {0}", j.customer)}</div>
              <div className="tn" style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{tx("{0} – {1} · {2} Std. (geplant {3})", j.arrived_at ? tsHm(j.arrived_at) : "–", `${pad(Math.floor(nowMin / 60))}:${pad(nowMin % 60)}`, hm(actual), hm(j.duration_min))}</div>
              {sheet.step === "choose" ? (
                <>
                  <button type="button" disabled={act} onClick={() => finish("done")} style={{ ...big, background: "#22C55E", color: "#fff" }}>✅ {tx("Alles erledigt")}</button>
                  <button type="button" disabled={act} onClick={() => setSheet({ ...sheet, step: "rest" })} style={{ ...big, background: "#F3E8FF", color: "#6B21A8" }}>⏸ {tx("Nicht fertig – muss weitergehen")}</button>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 14, fontSize: 15, fontWeight: 700 }}>{tx("Wie lange dauert es noch?")}</div>
                  <div>{RESTS.map(([m, l]) => <button key={m} type="button" onClick={() => setSheet({ ...sheet, rest: m })} style={chip(sheet.rest === m)}>{tx(l)}</button>)}</div>
                  <button type="button" disabled={act} onClick={() => finish("partial")} style={{ ...big, background: "#7C3AED", color: "#fff", justifyContent: "center" }}>{tx("Speichern")}</button>
                  <button type="button" onClick={() => setSheet({ ...sheet, step: "choose" })} style={{ border: 0, background: "none", color: MUTED, fontSize: 14, marginTop: 8, cursor: "pointer", width: "100%" }}>{tx("Zurück")}</button>
                </>
              )}
              {longer && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{tx("Es hat länger gedauert – warum?")} <span style={{ color: MUTED, fontWeight: 400 }}>{tx("(optional)")}</span></div>
                  <div>{REASONS.map((r) => <button key={r} type="button" onClick={() => setSheet({ ...sheet, reason: sheet.reason === r ? "" : r })} style={chip(sheet.reason === r)}>{tx(r)}</button>)}</div>
                </div>
              )}
              {err && <div role="alert" style={{ marginTop: 10, color: "#8F1B1B", fontSize: 14 }}>{err}</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
