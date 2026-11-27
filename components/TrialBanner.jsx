"use client";

import React from "react";
import { tx, loc } from "../lib/i18n";

// Testphase (Paket 38b): schmale Leiste oben auf den Seiten für Inhaber/Leitung/Schichtplaner.
//  * läuft:      "Testphase: noch n Tage (bis …)"
//    (27.11.2026, Wunsch: Knopf „Beispiel-Mitarbeiter anlegen“ entfernt; die Funktion create_sample_staff bleibt in der Datenbank)
//  * abgelaufen: rot "nur Ansicht" – die Datenbank lehnt jedes Speichern ab (Skript 44, trial_guard).
// Die Mitarbeiter-App zeigt diese Leiste nie (nur ProductGate mit supervisorOnly).
export default function TrialBanner({ trialUntil, timezone }) { // eslint-disable-line react/prop-types
  if (!trialUntil) return null;
  const end = new Date(trialUntil);
  const over = end.getTime() < Date.now();
  const left = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  const day = end.toLocaleDateString(loc(), { timeZone: timezone === "Asia/Dubai" ? "Asia/Dubai" : "Europe/Berlin" });

  const box = { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 14, padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid" };

  if (over) {
    return (
      <div data-trial-banner="over" role="status" style={{ ...box, background: "#FCE5EA", color: "#8A2A3E", borderColor: "#F2C4CF" }}>
        <b>{tx("Testphase abgelaufen am")} {day} {tx("– nur Ansicht.")}</b>
        <span>{tx("Änderungen werden nicht gespeichert. Weiter nutzen?")} <a href="mailto:info@dienstigo.de" style={{ color: "#8A2A3E", fontWeight: 650 }}>info@dienstigo.de</a></span>
      </div>
    );
  }
  return (
    <div data-trial-banner="active" role="status" style={{ ...box, background: "#FFF6DD", color: "#6B4A00", borderColor: "#F1DFA8" }}>
      <b>{left === 1 ? tx("Testphase: noch 1 Tag") : tx("Testphase: noch {0} Tage", left)}</b>
      <span>{tx("(bis")} {day}{tx(") · bitte nur erfundene Daten eingeben")}</span>
    </div>
  );
}
