"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// „Demo anfragen“: a window with Firmenname, E-Mail, Telefon, Nachricht and the Datenschutz tick.
// Sent to /api/demo-anfrage (the server checks, saves and e-mails info@dienstigo.de).
// Spam protection: a hidden field people never see, and the time since the window was opened (bots are instant).
// <DemoButton> is a normal link to /demo-anfrage (works without JavaScript) that opens the window instead.
// The window is placed directly in <body> (portal), so it also works inside a sentence (<p>) like on /login.

const NAVY = "#243B6B", INK = "#18233A", MUTED = "#5B6578", LINE = "#D5DBE6";
const lbl = { display: "block", fontWeight: 650, fontSize: 15, margin: "0 0 5px", color: INK };
const inp = { display: "block", width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 16, border: `1.5px solid ${LINE}`, borderRadius: 12, margin: "0 0 14px", fontFamily: "inherit", background: "#fff", color: INK };
const opt = { color: MUTED, fontWeight: 400 };

export function DemoForm({ onClose, intro }) {
  const [f, setF] = useState({ company: "", email: "", phone: "", message: "", consent: false, website: "" });
  const [state, setState] = useState("idle"); // idle | sending | done
  const [error, setError] = useState("");
  const opened = useRef(Date.now());
  const first = useRef(null);
  useEffect(() => { if (first.current) first.current.focus(); }, []);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); if (k === "consent" && e.target.checked) setError(""); };

  async function send(e) {
    e.preventDefault();
    setError("");
    if (!f.consent) { setError("Bitte der Datenschutzerklärung zustimmen."); return; }
    setState("sending");
    try {
      const res = await fetch("/api/demo-anfrage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, t: Date.now() - opened.current }) });
      let out = {}; try { out = await res.json(); } catch (x) { /* ignore */ }
      if (res.ok && out.ok) { setState("done"); return; }
      setError(out.error || "Das hat leider nicht geklappt. Bitte erneut versuchen oder an info@dienstigo.de schreiben.");
    } catch (x) {
      setError("Keine Verbindung. Bitte erneut versuchen oder an info@dienstigo.de schreiben.");
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <div data-demo="done">
        <h2 id="dr-title" style={{ fontSize: 24, margin: "0 40px 8px 0", color: NAVY }}>Vielen Dank!</h2>
        <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: INK }}>Ihre Anfrage ist bei uns angekommen. Wir melden uns so bald wie möglich bei Ihnen.</p>
        {onClose
          ? <button type="button" onClick={onClose} style={{ border: 0, borderRadius: 12, background: NAVY, color: "#fff", fontWeight: 700, fontSize: 16, padding: "12px 20px", cursor: "pointer" }}>Schließen</button>
          : <a href="/" style={{ display: "inline-block", borderRadius: 12, background: NAVY, color: "#fff", fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}>Zur Startseite</a>}
      </div>
    );
  }

  return (
    <form onSubmit={send} noValidate>
      {intro}
      <label style={lbl} htmlFor="dr-company">Firmenname *</label>
      <input id="dr-company" ref={first} required maxLength={200} autoComplete="organization" value={f.company} onChange={set("company")} style={inp} />
      <label style={lbl} htmlFor="dr-email">E-Mail *</label>
      <input id="dr-email" type="email" required maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} style={inp} />
      <label style={lbl} htmlFor="dr-phone">Telefon <span style={opt}>(optional)</span></label>
      <input id="dr-phone" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set("phone")} style={inp} />
      <label style={lbl} htmlFor="dr-message">Nachricht <span style={opt}>(optional)</span></label>
      <textarea id="dr-message" rows={4} maxLength={2000} value={f.message} onChange={set("message")} placeholder="z. B. Branche, Anzahl Mitarbeitende, Schichten, Wunschtermin"
        style={{ ...inp, resize: "vertical", minHeight: 96 }} />
      {/* Spam-Schutz: Menschen sehen dieses Feld nicht */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="dr-website">Website</label>
        <input id="dr-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "2px 0 16px", lineHeight: 1.5, fontSize: 14, color: INK }}>
        <input type="checkbox" checked={f.consent} onChange={set("consent")} style={{ marginTop: 3, width: 18, height: 18, flex: "0 0 auto" }} />
        <span>Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Demo-Anfrage gespeichert werden. Details in der <a href="/datenschutz" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 650 }}>Datenschutzerklärung</a>. *</span>
      </label>
      {error && <p role="alert" style={{ background: "#FDECEC", color: "#8A1C1C", padding: "10px 13px", borderRadius: 10, margin: "0 0 14px", fontSize: 14 }}>{error}</p>}
      <button type="submit" disabled={state === "sending"}
        style={{ width: "100%", padding: 14, fontSize: 16, fontWeight: 700, color: "#fff", background: NAVY, border: 0, borderRadius: 12, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}>
        {state === "sending" ? "Wird gesendet …" : "Senden"}
      </button>
    </form>
  );
}

export function DemoDialog({ onClose }) {
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(16,24,40,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "max(16px, env(safe-area-inset-top)) 12px 24px" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="dr-title"
        style={{ position: "relative", width: "100%", maxWidth: 520, margin: "4vh 0", background: "#fff", borderRadius: 20, padding: "26px 22px 22px", boxShadow: "0 24px 60px -12px rgba(16,24,40,.45)", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", textAlign: "left" }}>
        <button type="button" aria-label="Schließen" onClick={onClose}
          style={{ position: "absolute", top: 10, right: 10, width: 40, height: 40, border: 0, borderRadius: 12, background: "#EEF1F6", color: INK, fontSize: 22, lineHeight: 1, cursor: "pointer" }}>×</button>
        {/* Title + intro live inside the form, so after sending only „Vielen Dank!“ is shown. */}
        <DemoForm onClose={onClose} intro={<>
          <h2 id="dr-title" style={{ fontSize: 24, margin: "0 40px 6px 0", color: NAVY }}>Demo anfragen</h2>
          <p style={{ margin: "0 0 18px", color: MUTED, lineHeight: 1.5, fontSize: 15 }}>Hinterlassen Sie Ihre Kontaktdaten. Wir melden uns und zeigen Ihnen Dienstigo.</p>
        </>} />
      </div>
    </div>
  );
}

export default function DemoButton({ className, style, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="/demo-anfrage" className={className} style={style} onClick={(e) => { e.preventDefault(); setOpen(true); }}>{children}</a>
      {open && createPortal(<DemoDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
