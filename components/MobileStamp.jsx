"use client";

import React, { useState } from "react";

// "Mobil stempeln" (Firmen-Schalter mobil_stempeln): Kommen/Gehen direkt in der App, ohne Terminal –
// z. B. für ambulante Dienste. Die Zeit nimmt der Server. Mit mobil_standort wird NUR in diesem Moment
// der Standort gespeichert (eine einzige Abfrage, keine laufende Ortung).
const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

export default function MobileStamp({ org, withLocation, onClose, onOpenTimes, onScanQr }) {
  const [state, setState] = useState({ phase: "choose" }); // choose | busy | done | error

  async function stamp(direction) {
    setState({ phase: "busy", text: withLocation ? "Standort wird ermittelt …" : "Wird gebucht …" });
    try {
      const pos = withLocation ? await getPosition() : null;
      if (withLocation && !pos) {
        setState({ phase: "error", text: "Der Standort konnte nicht ermittelt werden. Bitte in den Einstellungen des Handys den Standort für diese App bzw. den Browser erlauben und noch einmal tippen." });
        return;
      }
      setState({ phase: "busy", text: "Wird gebucht …" });
      const { data } = await org.supabase.auth.getSession();
      const res = await fetch("/api/zeit", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` },
        body: JSON.stringify({ action: "mobil", direction, org: org.orgId, ...(pos || {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { setState({ phase: "error", text: body.error || "Schon gestempelt." }); return; }
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      setState({ phase: "done", direction: body.direction || direction, time: body.time, located: body.located });
    } catch (e) {
      setState({ phase: "error", text: e.message });
    }
  }

  const big = (dir, label, color) => (
    <button onClick={() => stamp(dir)} style={{ flex: 1, border: 0, borderRadius: 18, background: color, color: "#fff", fontSize: 22, fontWeight: 800, padding: "26px 0", cursor: "pointer", boxShadow: "0 8px 20px -10px rgba(0,0,0,.5)" }}>{label}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Mobil stempeln" style={{ position: "fixed", inset: 0, zIndex: 70, background: "#0F2238", color: "#EAF1FB", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Stempeln</div>
        <button onClick={onClose} style={{ background: "none", border: "1.5px solid #5E7FA8", color: "#EAF1FB", borderRadius: 12, padding: "8px 14px", fontSize: 15, cursor: "pointer" }}>Schließen</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 18, gap: 16 }}>
        {state.phase === "choose" && (
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", gap: 12 }}>{big("in", "Kommen", "#1F9D55")}{big("out", "Gehen", "#D23B3B")}</div>
            {withLocation && (
              <p style={{ marginTop: 16, color: "#9FB3CF", fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>
                📍 Ihre Firma speichert beim Stempeln einmalig den Standort. Es gibt keine laufende Ortung.
              </p>
            )}
            {onScanQr && (
              <button onClick={onScanQr} style={{ marginTop: 18, width: "100%", background: "none", border: "1.5px solid #5E7FA8", color: "#EAF1FB", borderRadius: 14, padding: "12px 0", fontSize: 15, cursor: "pointer" }}>
                📷 Stattdessen QR-Code am Terminal scannen
              </button>
            )}
          </div>
        )}
        {state.phase === "busy" && <div style={{ fontSize: 18 }}>{state.text}</div>}
        {state.phase === "done" && (
          <div role="status" style={{ width: "100%", maxWidth: 420, background: state.direction === "in" ? "#1F9D55" : "#D23B3B", color: "#fff", borderRadius: 22, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 54 }}>✓</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{state.direction === "in" ? "Eingestempelt" : "Ausgestempelt"}</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>{state.time ? `${clock(state.time)} Uhr` : ""}{state.located ? " · mit Standort" : ""}</div>
          </div>
        )}
        {state.phase === "error" && (
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div role="alert" style={{ background: "#FCE5EA", color: "#8A2A3E", borderRadius: 18, padding: 18, fontSize: 16 }}>{state.text}</div>
            <button onClick={() => setState({ phase: "choose" })} style={{ marginTop: 14, width: "100%", border: 0, borderRadius: 14, padding: "12px 0", fontSize: 16, fontWeight: 700, background: "#EAF1FB", color: "#0F2238", cursor: "pointer" }}>Noch einmal</button>
          </div>
        )}
        {state.phase === "done" && onOpenTimes && (
          <button onClick={() => { onClose(); onOpenTimes(); }} style={{ background: "none", border: 0, color: "#EAF1FB", textDecoration: "underline", fontSize: 16, cursor: "pointer" }}>Zu meinen Zeiten ›</button>
        )}
      </div>
    </div>
  );
}
