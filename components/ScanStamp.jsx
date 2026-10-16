"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// "📷 Stempeln" inside the employee app: opens the phone camera right here, reads the QR code of the
// terminal and stamps – no switch to the browser, so no second login (on the iPhone the installed app
// and Safari keep separate logins). Uses the phone's built-in QR reader (BarcodeDetector) when there is one,
// otherwise the small jsQR library. The time is taken by the server, exactly like /stempeln.
const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function tokenFromQr(text) {
  try {
    const u = new URL(String(text || "").trim(), typeof window !== "undefined" ? window.location.origin : "https://x");
    const t = u.searchParams.get("t");
    return /\/stempeln\/?$/.test(u.pathname) && t && /^[A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
  } catch (e) { return null; }
}

export default function ScanStamp({ org, onClose, onOpenTimes }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const doneRef = useRef(false);
  const [state, setState] = useState({ phase: "start" }); // start | scan | busy | ask | done | info | error

  const stop = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const stamp = useCallback(async (token, direction) => {
    setState({ phase: "busy" });
    try {
      const { data } = await org.supabase.auth.getSession();
      const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ action: "qr", token, direction }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.needDirection) { setState({ phase: "ask", token }); return; }
      if (res.status === 409) { setState({ phase: "info", text: body.error || "Schon gestempelt." }); return; }
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      setState({ phase: "done", direction: body.direction || direction, time: body.time });
    } catch (e) { setState({ phase: "error", text: e.message }); }
  }, [org]);

  const found = useCallback((text) => {
    if (doneRef.current) return;
    const token = tokenFromQr(text);
    if (!token) { setState((s) => ({ ...s, hint: "Das ist kein Stempel-Code. Bitte den Code am Terminal scannen." })); return; }
    doneRef.current = true; stop(); stamp(token);
  }, [stamp, stop]);

  useEffect(() => {
    let alive = true, timer = null, detector = null, jsQR = null;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Dieses Gerät erlaubt keine Kamera im Browser.");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current; v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play();
        if ("BarcodeDetector" in window) { try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; } }
        if (!detector) jsQR = (await import("jsqr")).default;
        setState({ phase: "scan" });
        const tick = async () => {
          if (!alive || doneRef.current) return;
          try {
            if (v.readyState >= 2 && v.videoWidth) {
              if (detector) {
                const codes = await detector.detect(v);
                if (codes && codes[0] && codes[0].rawValue) found(codes[0].rawValue);
              } else {
                const c = canvasRef.current, w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
                c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(v, 0, 0, w, h);
                const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
                if (r && r.data) found(r.data);
              }
            }
          } catch (e) { /* next frame */ }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        setState({ phase: "error", text: e && e.name === "NotAllowedError" ? "Kamera nicht erlaubt. Bitte in den Einstellungen des Handys der App/dem Browser die Kamera erlauben." : (e.message || "Kamera konnte nicht gestartet werden.") });
      }
    })();
    return () => { alive = false; clearTimeout(timer); stop(); };
  }, [found, stop]);

  const big = (dir, label, color) => (
    <button onClick={() => stamp(state.token, dir)} style={{ flex: 1, border: 0, borderRadius: 16, background: color, color: "#fff", fontSize: 20, fontWeight: 750, padding: "16px 0", cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#0F2238", color: "#EAF1FB", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Stempeln</div>
        <button onClick={() => { stop(); onClose(); }} style={{ background: "none", border: "1.5px solid #5E7FA8", color: "#EAF1FB", borderRadius: 12, padding: "8px 14px", fontSize: 15, cursor: "pointer" }}>Schließen</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 14 }}>
        {(state.phase === "start" || state.phase === "scan") && (
          <>
            <div style={{ fontSize: 16, color: "#9FB3CF", textAlign: "center" }}>Am Terminal erst <b>Kommen</b> oder <b>Gehen</b> drücken, dann den Code hier ins Bild halten.</div>
            <div style={{ position: "relative", width: "100%", maxWidth: 420, aspectRatio: "1 / 1", borderRadius: 22, overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: "14%", border: "4px solid rgba(255,255,255,.85)", borderRadius: 18 }} />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {state.phase === "start" && <div style={{ color: "#9FB3CF" }}>Kamera wird gestartet …</div>}
            {state.hint && <div role="alert" style={{ color: "#FFD58A", textAlign: "center" }}>{state.hint}</div>}
          </>
        )}
        {state.phase === "busy" && <div style={{ fontSize: 18 }}>Wird gebucht …</div>}
        {state.phase === "ask" && (
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div style={{ fontSize: 17, marginBottom: 12, textAlign: "center" }}>Kommen oder Gehen?</div>
            <div style={{ display: "flex", gap: 10 }}>{big("in", "Kommen", "#1F9D55")}{big("out", "Gehen", "#D23B3B")}</div>
          </div>
        )}
        {state.phase === "done" && (
          <div role="status" style={{ width: "100%", maxWidth: 420, background: state.direction === "in" ? "#1F9D55" : "#D23B3B", color: "#fff", borderRadius: 22, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 54 }}>✓</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{state.direction === "in" ? "Eingestempelt" : "Ausgestempelt"}</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>{state.time ? `${clock(state.time)} Uhr` : ""}</div>
          </div>
        )}
        {state.phase === "info" && <div role="status" style={{ background: "#FFF4D6", color: "#7A4E00", borderRadius: 18, padding: 18, fontSize: 16, maxWidth: 420 }}>{state.text}</div>}
        {state.phase === "error" && <div role="alert" style={{ background: "#FCE5EA", color: "#8A2A3E", borderRadius: 18, padding: 18, fontSize: 16, maxWidth: 420 }}>{state.text}</div>}
        {(state.phase === "done" || state.phase === "info") && onOpenTimes && (
          <button onClick={() => { onClose(); onOpenTimes(); }} style={{ background: "none", border: 0, color: "#EAF1FB", textDecoration: "underline", fontSize: 16, cursor: "pointer" }}>Zu meinen Zeiten ›</button>
        )}
      </div>
    </div>
  );
}
