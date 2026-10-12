"use client";

import React, { useContext, useEffect, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const INK = "#1B2433", PRIMARY = "#243B6B", MUTED = "#6B7588";
const pad = (n) => String(n).padStart(2, "0");

// After scanning the QR code at the terminal: two big buttons "Kommen" / "Gehen".
// The time is taken by the SERVER, never by the phone.
export default function StempelnView() {
  const org = useContext(OrgContext);
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") || "" : "";
  const [suggest, setSuggest] = useState(null); // "in" | "out"
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [needDirection, setNeedDirection] = useState(false); // only for an old QR code without Kommen/Gehen
  const [already, setAlready] = useState("");
  const startedRef = React.useRef(false);

  useEffect(() => { // Kommen/Gehen was chosen on the terminal: the QR code carries it -> book right away
    if (!token || startedRef.current) return;
    startedRef.current = true; go(null);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // last own stamp -> which button is the likely one
    (async () => {
      const r = await org.supabase.from("attendance_events").select("direction, scanned_at").eq("org_id", org.orgId).eq("staff_id", org.staffId).order("scanned_at", { ascending: false }).limit(1);
      const last = r.data && r.data[0];
      setSuggest(last && last.direction === "in" && Date.now() - new Date(last.scanned_at).getTime() < 20 * 3600000 ? "out" : "in");
    })();
  }, [org]);

  async function go(direction) {
    setBusy(direction || "auto"); setErr("");
    try {
      const { data } = await org.supabase.auth.getSession();
      const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ action: "qr", token, direction }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.needDirection) { setNeedDirection(true); setBusy(""); return; }
      if (res.status === 409) { setAlready(body.error || "Schon gestempelt."); setBusy(""); return; }
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      setDone({ direction: body.direction, time: new Date(body.time) });
    } catch (e) { setErr(e.message); }
    setBusy("");
  }

  const big = (dir, label, color) => (
    <button className="tbtn" onClick={() => go(dir)} disabled={!!busy || !token}
      style={{ display: "block", width: "100%", border: suggest === dir ? `3px solid ${color}` : "1.5px solid #9AAED0", borderRadius: 22, background: suggest === dir ? color : "#fff", color: suggest === dir ? "#fff" : INK, fontSize: 26, fontWeight: 750, padding: "26px 0", marginBottom: 14, cursor: "pointer", opacity: busy && busy !== dir ? 0.5 : 1 }}>
      {busy === dir ? "Moment …" : label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#E9EEF8", padding: "28px 18px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: INK }}>
      <style>{".tbtn{transition:transform .12s ease}.tbtn:active{transform:scale(.95)}"}</style>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ fontSize: 14, color: MUTED }}>{org.orgName}</div>
        <div style={{ fontSize: 26, fontWeight: 750, marginBottom: 18 }}>Stempeln</div>
        {done ? (
          <div role="status" style={{ background: done.direction === "in" ? "#1F9D55" : "#D23B3B", color: "#fff", borderRadius: 22, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 52 }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 750 }}>{done.direction === "in" ? "Eingestempelt" : "Ausgestempelt"}</div>
            <div style={{ fontSize: 36, fontWeight: 300, margin: "6px 0 14px" }}>{pad(done.time.getHours())}:{pad(done.time.getMinutes())} Uhr</div>
            <a href="/mitarbeiter" style={{ color: "#fff", fontWeight: 650, textDecoration: "underline" }}>Zu meinen Zeiten ›</a>
          </div>
        ) : !token ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: 18, fontSize: 15 }}>Bitte den QR-Code am Terminal mit der Handy-Kamera scannen.</div>
        ) : already ? (
          <div role="status" style={{ background: "#FFF4D6", color: "#7A4E00", borderRadius: 18, padding: 18, fontSize: 16 }}>{already}</div>
        ) : !needDirection ? (
          <div role="status" style={{ background: "#fff", borderRadius: 18, padding: 18, fontSize: 16, textAlign: "center" }}>{err ? "" : "Wird gebucht …"}</div>
        ) : (
          <>
            {big("in", "Kommen", "#1F9D55")}
            {big("out", "Gehen", "#D23B3B")}
            <div style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>Die Uhrzeit nimmt der Server, nicht dein Handy.</div>
          </>
        )}
        {err && <div role="alert" style={{ marginTop: 14, background: "#FCE5EA", color: "#8A2A3E", borderRadius: 14, padding: "12px 14px", fontSize: 15 }}>{err}</div>}
      </div>
    </div>
  );
}
