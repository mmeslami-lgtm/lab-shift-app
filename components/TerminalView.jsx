"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { qrSvg } from "../lib/qr";

const KEY = "zeit-terminal"; // device credentials in THIS browser only (serial + key, set up by the Leitung)
const pad = (n) => String(n).padStart(2, "0");
const BG = "#0F2238", CARD = "#16304F", TXT = "#EAF1FB", SUB = "#9FB3CF";
const GREEN = "#1F9D55", RED = "#D23B3B"; // Kommen = grün, Gehen = rot
// small movement on click: pressed = slightly smaller, chosen = short "pop"
const PRESS_CSS = ".tbtn{transition:transform .12s ease, box-shadow .2s ease, opacity .2s ease}.tbtn:active{transform:scale(.94)}.tbtn.sel{animation:tpop .35s ease-out}@keyframes tpop{0%{transform:scale(.92)}60%{transform:scale(1.05)}100%{transform:scale(1)}}";


function readCreds() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }

export default function TerminalView() {
  const [creds, setCreds] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setCreds(readCreds()); setReady(true); }, []);
  if (!ready) return null;
  if (!creds) return <Setup onDone={(c) => { localStorage.setItem(KEY, JSON.stringify(c)); setCreds(c); }} />;
  return <Terminal creds={creds} onReset={() => { localStorage.removeItem(KEY); setCreds(null); }} />;
}

// ---------- one-time setup: type the code the Leitung created in "Anwesenheit" ----------
// Nobody logs in on the tablet – so no password can be saved in its browser, and the terminal
// can never open the planner or anything else.
function Setup({ onDone }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pair() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pair", code }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      onDone({ serial: body.serial, key: body.key, name: body.name });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const fmt = (v) => { const r = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); return r.length > 4 ? r.slice(0, 4) + "-" + r.slice(4) : r; };
  return (
    <div style={{ minHeight: "100vh", background: "#E9EEF8", padding: "28px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>Terminal einrichten</h1>
        <p style={{ fontSize: 15, color: "#5B6578", margin: "0 0 16px" }}>Die Leitung erstellt im Dienstplaner unter <b>Anwesenheit → Neues Terminal einrichten</b> einen Code. Diesen Code hier eingeben – niemand muss sich auf diesem Gerät anmelden.</p>
        <div style={{ background: "#fff", border: "1px solid #CBD8EE", borderRadius: 18, padding: 16 }}>
          <label style={{ display: "block", fontSize: 13, color: "#5B6578" }}>Einrichtungs-Code
            <input value={code} onChange={(e) => setCode(fmt(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") pair(); }} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
              placeholder="XXXX-XXXX" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: "14px 12px", borderRadius: 12, border: "1.5px solid #9AAED0", fontSize: 28, letterSpacing: 4, textAlign: "center", fontFamily: "ui-monospace, Menlo, monospace" }} />
          </label>
          <button onClick={pair} disabled={busy || code.replace("-", "").length !== 8} style={{ width: "100%", marginTop: 12, border: 0, borderRadius: 14, background: "#243B6B", color: "#fff", fontSize: 17, fontWeight: 650, padding: "14px 0", cursor: "pointer", opacity: busy || code.replace("-", "").length !== 8 ? 0.6 : 1 }}>{busy ? "Moment …" : "Terminal einrichten"}</button>
          {err && <div role="alert" style={{ marginTop: 12, background: "#FCE5EA", color: "#8A2A3E", borderRadius: 10, padding: "9px 12px", fontSize: 14 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- the running terminal ----------
function Terminal({ creds, onReset }) {
  const [token, setToken] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [features, setFeatures] = useState([]); // Funktionen pro Firma (z. B. terminal_pin_only)
  const [offset, setOffset] = useState(0); // server time − device time
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");
  const [fatal, setFatal] = useState(false);
  const [pinMode, setPinMode] = useState(null); // null | { step: "name" | "pin" | "done", … }
  const [staff, setStaff] = useState([]);
  const [card, setCard] = useState(null); // chip card after it was held to the reader: { code, name, needPin, pin, dir, err }
  const [choice, setChoice] = useState(null); // Kommen/Gehen chosen BEFORE the card: { dir, until }
  const choiceRef = useRef(null);
  const idleRef = useRef(null);
  const bufRef = useRef({ text: "", at: 0 });

  const call = useCallback(async (payload) => {
    const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json", "x-device-serial": creds.serial, "x-device-key": creds.key }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && payload.action !== "pin") setFatal(true);
    if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
    return body;
  }, [creds]);

  // a QR code exists only after Kommen/Gehen was chosen: it carries that direction, the phone only confirms
  const refresh = useCallback(async (dir) => {
    try {
      const b = await call({ action: "token", direction: dir || undefined });
      setToken(dir ? { token: b.token, dir } : null); setOffset(new Date(b.serverTime).getTime() - Date.now()); setErr(""); if (b.orgName) setOrgName(b.orgName); if (Array.isArray(b.features)) setFeatures(b.features);
    } catch (e) { setErr(e.message); }
  }, [call]);

  useEffect(() => { refresh(null); const t = setInterval(() => refresh(null), 300000); return () => clearInterval(t); }, [refresh]); // name + time
  const activeDir = choice && choice.until > now ? choice.dir : null;
  useEffect(() => { // new QR for the chosen direction, renewed every 25 s while the choice is active
    if (!activeDir) { setToken(null); return undefined; }
    refresh(activeDir);
    const t = setInterval(() => refresh(activeDir), 25000);
    return () => clearInterval(t);
  }, [activeDir, choice && choice.until, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { // keep the screen on, if the browser allows it
    let lock = null;
    const get = async () => { try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) { /* not allowed */ } };
    get(); document.addEventListener("visibilitychange", get);
    return () => { document.removeEventListener("visibilitychange", get); try { if (lock) lock.release(); } catch (e) { /* ignore */ } };
  }, []);

  const back = () => { setPinMode(null); setCard(null); setChoice(null); choiceRef.current = null; clearTimeout(idleRef.current); };
  const choose = (dir) => {
    const c = { dir, until: Date.now() + 20000 }; // 20 s: enough to hold the card or to open the phone camera
    choiceRef.current = c; setChoice(c);
    if (card && card.name && !card.needPin && !card.err) bookCard(card.code, dir); // card was held first: book now
  };
  const touch = () => { clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 30000); }; // back to the QR code after 30 s

  // USB chip card readers type the card number very fast and end with Enter (keyboard emulation)
  useEffect(() => {
    const onKey = (e) => {
      const b = bufRef.current; const t = Date.now();
      if (t - b.at > 120) b.text = "";
      b.at = t;
      if (e.key === "Enter") { const code = b.text; b.text = ""; if (code.length >= 4) { e.preventDefault(); startCard(code); } return; }
      if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) b.text += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  async function startCard(code) {
    setPinMode(null);
    try {
      const b = await call({ action: "card", code });
      const c = choiceRef.current;
      const dir = c && c.until > Date.now() ? c.dir : null;
      if (b.needPin) { setCard({ code, name: b.name, needPin: true, pin: "", dir }); touch(); return; }
      if (dir) { await bookCard(code, dir); return; }
      setCard({ code, name: b.name, needPin: false, dir: null }); // card first: ask Kommen or Gehen (10 s)
      clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 10000);
    } catch (e) { setCard({ code, err: e.message }); clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 5000); }
  }
  async function bookCard(code, direction, pin) {
    try {
      const b = await call({ action: "card", code, direction, pin });
      setCard(null); setChoice(null); choiceRef.current = null;
      setPinMode({ step: "done", name: b.name, direction, time: new Date(b.time) });
      clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 4000);
    } catch (e) { setCard((c) => ({ ...(c || { code }), pin: "", err: e.message })); clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 6000); }
  }

  async function openPin() {
    touch(); setPinMode({ step: "name" });
    try { const b = await call({ action: "staff" }); setStaff(b.staff || []); } catch (e) { setPinMode({ step: "name", err: e.message }); }
  }
  async function stampPin(direction) {
    touch();
    try {
      const b = await call({ action: "pin", staff_id: pinMode.person.id, pin: pinMode.pin, direction });
      setPinMode({ step: "done", name: b.name, direction, time: new Date(b.time) });
      clearTimeout(idleRef.current); idleRef.current = setTimeout(back, 4000);
    } catch (e) { setPinMode((m) => ({ ...m, pin: "", err: e.message })); }
  }

  const t = new Date(now + offset);
  const url = token && activeDir && token.dir === activeDir && typeof window !== "undefined" ? `${window.location.origin}/stempeln?t=${token.token}` : "";
  const shell = { minHeight: "100vh", background: BG, color: TXT, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" };
  const bigBtn = { border: 0, borderRadius: 18, fontSize: 22, fontWeight: 750, padding: "20px 0", cursor: "pointer", color: "#fff" };

  if (fatal) return (
    <div style={shell}><div style={{ maxWidth: 460, textAlign: "center", marginTop: "20vh" }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Dieses Terminal ist gesperrt oder nicht mehr eingerichtet.</div>
      <div style={{ fontSize: 15, color: SUB, marginBottom: 16 }}>Die Leitung kann es unter „Anwesenheit“ wieder entsperren – oder einen neuen Code erstellen.</div>
      <button onClick={onReset} style={{ ...bigBtn, background: "#2F6FB8", padding: "14px 22px", fontSize: 17 }}>Neu einrichten</button>
    </div></div>
  );

  return (
    <div style={shell} onClick={pinMode ? touch : undefined}>
      <style>{PRESS_CSS}</style>
      <div style={{ width: "100%", maxWidth: 560, background: "#fff", color: "#16304F", borderRadius: 16, padding: "12px 16px", textAlign: "center", fontSize: 24, fontWeight: 800, marginBottom: 12, minHeight: 32 }}>{orgName || " "}</div>
      <div style={{ fontSize: 15, color: SUB }}>{creds.name}</div>
      <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: -2, lineHeight: 1.1 }}>{pad(t.getHours())}:{pad(t.getMinutes())}<span style={{ fontSize: 30, color: SUB }}>:{pad(t.getSeconds())}</span></div>
      <div style={{ fontSize: 16, color: SUB, marginBottom: 18 }}>{t.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>

      {card && (
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          {card.err && !card.name ? (
            <div role="alert" style={{ fontSize: 22, color: "#FFB4B4", marginTop: 30 }}>{card.err}</div>
          ) : (
            <>
              <div style={{ fontSize: 26, fontWeight: 750, marginBottom: 6 }}>Hallo, {card.name}</div>
              {card.needPin && (
                <>
                  <div style={{ fontSize: 16, color: SUB }}>Bitte PIN eingeben</div>
                  <div style={{ fontSize: 34, letterSpacing: 12, margin: "8px 0", minHeight: 44 }}>{"●".repeat(card.pin.length)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", ""].map((k, i) => k === "" ? <span key={i} /> : (
                      <button key={i} onClick={() => { touch(); setCard((c) => ({ ...c, err: "", pin: k === "⌫" ? c.pin.slice(0, -1) : (c.pin + k).slice(0, 6) })); }}
                        style={{ background: CARD, color: TXT, border: "1.5px solid #34557F", borderRadius: 14, padding: "14px 0", fontSize: 22, cursor: "pointer" }}>{k}</button>
                    ))}
                  </div>
                </>
              )}
              {card.err && <div role="alert" style={{ color: "#FFB4B4", marginBottom: 8 }}>{card.err}</div>}
              {!card.needPin && !card.dir && <div style={{ fontSize: 17, color: SUB, marginBottom: 10 }}>Bitte wählen:</div>}
              {card.needPin && card.dir ? (
                <button className="tbtn" disabled={card.pin.length < 4} onClick={() => bookCard(card.code, card.dir, card.pin)}
                  style={{ ...bigBtn, width: "100%", background: card.dir === "in" ? GREEN : RED, opacity: card.pin.length < 4 ? 0.5 : 1 }}>{card.dir === "in" ? "Kommen bestätigen" : "Gehen bestätigen"}</button>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button className="tbtn" disabled={card.needPin && card.pin.length < 4} onClick={() => bookCard(card.code, "in", card.needPin ? card.pin : undefined)} style={{ ...bigBtn, background: GREEN, opacity: card.needPin && card.pin.length < 4 ? 0.5 : 1 }}>Kommen</button>
                  <button className="tbtn" disabled={card.needPin && card.pin.length < 4} onClick={() => bookCard(card.code, "out", card.needPin ? card.pin : undefined)} style={{ ...bigBtn, background: RED, opacity: card.needPin && card.pin.length < 4 ? 0.5 : 1 }}>Gehen</button>
                </div>
              )}
              <button onClick={back} style={{ marginTop: 16, background: "none", border: "1.5px solid #5E7FA8", color: TXT, borderRadius: 14, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}>Abbrechen</button>
            </>
          )}
        </div>
      )}

      {!pinMode && !card && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, width: "100%", maxWidth: 560, marginBottom: 14 }}>
            {[["in", "Kommen", GREEN], ["out", "Gehen", RED]].map(([dir, label, col]) => {
              const on = choice && choice.dir === dir && choice.until > now;
              return (
                <button key={dir + (on ? choice.until : "")} className={`tbtn${on ? " sel" : ""}`} onClick={() => choose(dir)} aria-pressed={!!on}
                  style={{ background: col, color: "#fff", border: on ? "5px solid #fff" : "5px solid transparent", borderRadius: 22, padding: "26px 0", fontSize: 30, fontWeight: 800, cursor: "pointer", boxShadow: on ? "0 0 0 4px " + col : "none", opacity: choice && !on && choice.until > now ? 0.45 : 1 }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 15, color: SUB, marginBottom: 14 }}>1. Kommen oder Gehen wählen · 2. Karte oder Chip an das Kartenlesegerät halten</div>
          <div style={{ fontSize: 18, fontWeight: 650, margin: "6px 0 8px", visibility: url ? "visible" : "hidden" }}>Oder mit dem Handy scannen</div>
          {url ? (
            <div style={{ background: "#fff", borderRadius: 20, padding: 14, minWidth: 300, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
              aria-label="QR-Code zum Stempeln" dangerouslySetInnerHTML={{ __html: qrSvg(url, 300) }} />
          ) : (
            <div style={{ border: "2px dashed #34557F", borderRadius: 20, minWidth: 300, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#5E7FA8", fontSize: 15, textAlign: "center", padding: 20, boxSizing: "border-box" }}>
              {activeDir ? "Lädt …" : "Der QR-Code fürs Handy erscheint nach Kommen oder Gehen"}
            </div>
          )}

          {features.includes("terminal_pin_only") && <button onClick={openPin} style={{ border: "1.5px solid #5E7FA8", background: CARD, color: TXT, borderRadius: 16, fontSize: 18, fontWeight: 650, padding: "14px 22px", cursor: "pointer" }}>Ohne Handy: mit PIN stempeln</button>}
          {err && <div role="alert" style={{ marginTop: 14, color: "#FFB4B4" }}>{err}</div>}
        </>
      )}

      {pinMode && pinMode.step === "name" && (
        <div style={{ width: "100%", maxWidth: 520 }}>
          <div style={{ fontSize: 20, fontWeight: 650, marginBottom: 10 }}>Wer bist du?</div>
          {pinMode.err && <div role="alert" style={{ color: "#FFB4B4", marginBottom: 8 }}>{pinMode.err}</div>}
          {staff.length === 0 && !pinMode.err && <div style={{ color: SUB }}>Niemand hat bisher eine Stempel-PIN festgelegt (in der App unter „Zeiten“).</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {staff.map((p) => <button key={p.id} onClick={() => { touch(); setPinMode({ step: "pin", person: p, pin: "" }); }} style={{ background: CARD, color: TXT, border: "1.5px solid #34557F", borderRadius: 14, padding: "16px 8px", fontSize: 17, fontWeight: 600, cursor: "pointer" }}>{p.name}</button>)}
          </div>
          <button onClick={back} style={{ marginTop: 18, background: "none", border: "1.5px solid #5E7FA8", color: TXT, borderRadius: 14, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}>‹ Zurück zum QR-Code</button>
        </div>
      )}

      {pinMode && pinMode.step === "pin" && (
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 650 }}>{pinMode.person.name}</div>
          <div style={{ fontSize: 34, letterSpacing: 12, margin: "10px 0", minHeight: 44 }}>{"●".repeat(pinMode.pin.length)}</div>
          {pinMode.err && <div role="alert" style={{ color: "#FFB4B4", marginBottom: 8 }}>{pinMode.err}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", ""].map((k, i) => k === "" ? <span key={i} /> : (
              <button key={i} onClick={() => { touch(); setPinMode((m) => ({ ...m, err: "", pin: k === "⌫" ? m.pin.slice(0, -1) : (m.pin + k).slice(0, 6) })); }}
                style={{ background: CARD, color: TXT, border: "1.5px solid #34557F", borderRadius: 14, padding: "16px 0", fontSize: 24, cursor: "pointer" }}>{k}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button disabled={pinMode.pin.length < 4} onClick={() => stampPin("in")} style={{ ...bigBtn, background: GREEN, opacity: pinMode.pin.length < 4 ? 0.5 : 1 }}>Kommen</button>
            <button disabled={pinMode.pin.length < 4} onClick={() => stampPin("out")} style={{ ...bigBtn, background: RED, opacity: pinMode.pin.length < 4 ? 0.5 : 1 }}>Gehen</button>
          </div>
          <button onClick={back} style={{ marginTop: 16, background: "none", border: "1.5px solid #5E7FA8", color: TXT, borderRadius: 14, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}>Abbrechen</button>
        </div>
      )}

      {pinMode && pinMode.step === "done" && (
        <div role="status" style={{ textAlign: "center", marginTop: 30 }}>
          <div style={{ fontSize: 70 }}>✓</div>
          <div style={{ fontSize: 26, fontWeight: 750 }}>{pinMode.direction === "in" ? "Hallo" : "Tschüss"}, {pinMode.name}</div>
          <div style={{ fontSize: 20, color: SUB }}>{pinMode.direction === "in" ? "Eingestempelt" : "Ausgestempelt"} um {pad(pinMode.time.getHours())}:{pad(pinMode.time.getMinutes())} Uhr</div>
        </div>
      )}
    </div>
  );
}
