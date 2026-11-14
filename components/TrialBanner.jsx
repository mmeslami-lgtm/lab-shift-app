"use client";

import React, { useState } from "react";

// Testphase (Paket 38b): schmale Leiste oben auf den Seiten für Inhaber/Leitung/Schichtplaner.
//  * läuft:      "Testphase: noch n Tage (bis …)" + für Inhaber/Leitung "Beispiel-Mitarbeiter anlegen"
//  * abgelaufen: rot "nur Ansicht" – die Datenbank lehnt jedes Speichern ab (Skript 44, trial_guard).
// Die Mitarbeiter-App zeigt diese Leiste nie (nur ProductGate mit supervisorOnly).
export default function TrialBanner({ supabase, orgId, role, trialUntil }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { text, ok }
  if (!trialUntil) return null;
  const end = new Date(trialUntil);
  const over = end.getTime() < Date.now();
  const left = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  const day = end.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const canSeed = !over && (role === "owner" || role === "supervisor");

  async function seed() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 200) { setMsg({ text: "Bitte eine Anzahl von 1 bis 200 eingeben (für mehr einfach noch einmal anlegen).", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await supabase.rpc("create_sample_staff", { p_org: orgId, p_count: n });
    setBusy(false);
    if (r.error) { setMsg({ text: r.error.message, ok: false }); return; }
    setMsg({ text: `✓ ${r.data} Beispiel-Mitarbeiter angelegt (erfundene Namen). Seite neu laden, um sie zu sehen.`, ok: true });
  }

  const box = { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 14, padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid" };
  const btn = { border: "1.5px solid #9AAED0", borderRadius: 10, background: "#fff", color: "#1B2433", fontSize: 13, fontWeight: 650, padding: "5px 10px", cursor: "pointer" };

  if (over) {
    return (
      <div data-trial-banner="over" role="status" style={{ ...box, background: "#FCE5EA", color: "#8A2A3E", borderColor: "#F2C4CF" }}>
        <b>Testphase abgelaufen am {day} – nur Ansicht.</b>
        <span>Änderungen werden nicht gespeichert. Weiter nutzen? <a href="mailto:info@dienstigo.de" style={{ color: "#8A2A3E", fontWeight: 650 }}>info@dienstigo.de</a></span>
      </div>
    );
  }
  return (
    <div data-trial-banner="active" role="status" style={{ ...box, background: "#FFF6DD", color: "#6B4A00", borderColor: "#F1DFA8" }}>
      <b>Testphase: noch {left} {left === 1 ? "Tag" : "Tage"}</b>
      <span>(bis {day}) · bitte nur erfundene Daten eingeben</span>
      {canSeed && !open && <button type="button" data-seed-open style={btn} onClick={() => { setOpen(true); setMsg(null); }}>Beispiel-Mitarbeiter anlegen</button>}
      {canSeed && open && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>Anzahl
            <input data-seed-count type="number" min="1" max="200" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 70, border: "1px solid #D9DEE7", borderRadius: 8, padding: "4px 6px", fontSize: 14 }} />
          </label>
          <button type="button" data-seed-go style={{ ...btn, background: "#243B6B", color: "#fff", borderColor: "#243B6B" }} disabled={busy} onClick={seed}>{busy ? "Moment …" : "Anlegen"}</button>
          <button type="button" style={btn} disabled={busy} onClick={() => setOpen(false)}>Schließen</button>
        </span>
      )}
      {msg && (
        <span data-seed-msg style={{ color: msg.ok ? "#1F6347" : "#8A2A3E", fontWeight: 600 }}>
          {msg.text}
          {msg.ok && <button type="button" style={{ ...btn, marginLeft: 8 }} onClick={() => window.location.reload()}>Jetzt neu laden</button>}
        </span>
      )}
    </div>
  );
}
