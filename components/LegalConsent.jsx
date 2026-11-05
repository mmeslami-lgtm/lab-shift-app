"use client";

import React, { useState } from "react";
import { LEGAL_DOCS, LEGAL_VERSIONS } from "../lib/legal";

const INK = "#1B2433";
const MUTED = "#6B7588";
const PRIMARY = "#243B6B";
const card = { background: "#fff", borderRadius: 18, padding: 18, marginBottom: 12 };

// Shown by <ProductGate> to the owner of a company in the test phase until the current versions of all
// three texts are accepted (lib/legal.js). Other roles of that company only see a short note.
export default function LegalConsent({ supabase, orgId, orgName, isOwner, email, onDone }) {
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const all = LEGAL_DOCS.every((d) => checked[d.key]);

  async function accept() {
    if (!all || busy) return;
    setBusy(true); setErr("");
    const r = await supabase.rpc("accept_legal", { p_org: orgId, p_versions: LEGAL_VERSIONS });
    setBusy(false);
    if (r.error) { setErr("Speichern hat nicht geklappt. Bitte erneut versuchen."); return; }
    onDone();
  }

  const logout = (
    <button type="button" onClick={() => supabase.auth.signOut()}
      style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 15, fontWeight: 600, padding: "10px 14px", cursor: "pointer" }}>
      Abmelden
    </button>
  );

  return (
    <div style={{ background: "#E9EEF8", color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }} data-legal-consent>
        <h1 style={{ fontSize: 23, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 6px" }}>Willkommen bei Dienstigo</h1>
        <div style={{ fontSize: 14, color: MUTED, marginBottom: 14 }}>{orgName} · Testphase</div>
        {!isOwner ? (
          <div style={card}>
            <div style={{ fontSize: 15, marginBottom: 12 }}>
              Bevor die Testphase starten kann, muss der Inhaber dieser Firma den Nutzungsbedingungen und dem
              Auftragsverarbeitungsvertrag zustimmen. Bitte später erneut versuchen.
            </div>
            {logout}
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 12 }}>
              Bitte lesen und bestätigen Sie vor dem Start die folgenden Punkte. Die Texte öffnen sich in einem neuen
              Fenster und lassen sich dort drucken oder als PDF speichern.
            </div>
            {LEGAL_DOCS.map((d) => (
              <label key={d.key} data-consent={d.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #EEF0F4", fontSize: 15, cursor: "pointer" }}>
                <input type="checkbox" checked={!!checked[d.key]} onChange={() => setChecked((c) => ({ ...c, [d.key]: !c[d.key] }))}
                  style={{ width: 20, height: 20, marginTop: 1, flex: "0 0 auto" }} />
                <span>
                  {d.href ? (
                    <>Ich akzeptiere die <a href={d.href} target="_blank" rel="noopener" style={{ color: PRIMARY, fontWeight: 600 }}>{d.label}</a> (Fassung {d.version}).</>
                  ) : d.label}
                </span>
              </label>
            ))}
            <div style={{ fontSize: 12, color: MUTED, margin: "8px 0 12px" }}>
              Gespeichert werden: Ihr Konto ({email}), Datum, Uhrzeit und die Fassung der Texte.
            </div>
            {err && <div role="alert" style={{ background: "#FCE5EA", color: "#8A2A3E", borderRadius: 12, padding: "8px 10px", fontSize: 14, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" data-consent-accept onClick={accept} disabled={!all || busy}
                style={{ border: 0, borderRadius: 12, background: all ? PRIMARY : "#AEB8CB", color: "#fff", fontSize: 15, fontWeight: 650, padding: "10px 16px", cursor: all && !busy ? "pointer" : "not-allowed" }}>
                {busy ? "Moment …" : "Zustimmen und starten"}
              </button>
              {logout}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
