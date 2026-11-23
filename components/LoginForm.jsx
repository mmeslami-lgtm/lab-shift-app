"use client";

import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { tx, getLang } from "../lib/i18n";
import { useLang } from "../lib/useLang";
import { cleanPhone, phoneToEmail, guessCountry } from "../lib/phoneLogin";

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";

const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 12px", fontSize: 16, background: "#fff", color: INK };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 17, fontWeight: 650, padding: "13px 16px", cursor: "pointer" };

export function translateAuthError(msg) {
  const m = String(msg || "").toLowerCase();
  if (m.includes("invalid login")) return tx("E-Mail oder Passwort ist falsch.");
  if (m.includes("email not confirmed")) return tx("Die E-Mail-Adresse ist noch nicht bestätigt.");
  if (m.includes("rate limit") || m.includes("too many")) return tx("Zu viele Versuche. Bitte kurz warten.");
  return msg || tx("Anmeldung fehlgeschlagen.");
}

// "Guten Morgen / Guten Tag / Guten Abend" by the time of day on this device
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? tx("Gute Nacht") : h < 11 ? tx("Guten Morgen") : h < 18 ? tx("Guten Tag") : tx("Guten Abend");
}

// Email + password sign-in. The session is picked up by whoever listens to supabase.auth.
// phone (nur Mitarbeiter-App, 23.11.2026): darunter der Link „Mit Handynummer anmelden“ – das Formular bleibt sonst gleich.
const MODE_KEY = "dg-login-mode";
export default function LoginForm({ title, phone = false }) {
  useLang(); // neu zeichnen bei DE/EN
  if (!title) title = tx("Anmelden");
  const [mode, setModeState] = useState(() => { if (!phone) return "email"; try { return localStorage.getItem(MODE_KEY) === "phone" ? "phone" : "email"; } catch (e) { return "email"; } });
  const setMode = (m) => { setModeState(m); setError(""); setForgot(null); try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* egal */ } };
  const [tel, setTel] = useState("");
  const [country, setCountry] = useState(() => guessCountry());
  const usePhone = phone && mode === "phone";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "Passwort vergessen?" (9 Nov 2026): a temporary password by e-mail, then a new own one at sign-in (/api/passwort)
  const [forgot, setForgot] = useState(null); // null | { msg, bad }
  async function sendForgot() {
    if (!email.trim()) { setForgot({ msg: tx("Bitte oben zuerst Ihre E-Mail-Adresse eintragen."), bad: true }); return; }
    setForgot({ msg: tx("Moment …"), bad: false });
    try {
      const res = await fetch("/api/passwort", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), lang: getLang() }) });
      const b = await res.json().catch(() => ({}));
      setForgot(res.ok ? { msg: b.message, bad: false } : { msg: b.error || tx("Das hat nicht geklappt."), bad: true });
    } catch (e) { setForgot({ msg: tx("Keine Verbindung. Bitte später noch einmal versuchen."), bad: true }); }
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    let login = email.trim();
    if (usePhone) {
      const n = cleanPhone(tel, country);
      if (!n) { setError(tx("Bitte die Handynummer prüfen.")); return; }
      login = phoneToEmail(n);
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: login, password });
    setBusy(false);
    if (err) setError(usePhone && /invalid login/i.test(err.message) ? tx("Handynummer oder Passwort ist falsch.") : translateAuthError(err.message));
  }

  return (
    <form onSubmit={signIn} style={{ background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <div style={{ textAlign: "center", padding: "6px 0 14px", marginBottom: 12, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 22, fontWeight: 750, color: PRIMARY }}>{greeting()}</div>
        <div style={{ fontSize: 15, color: MUTED, marginTop: 4 }}>{tx("Herzlich willkommen!")}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 10 }}>{title}</div>
      {usePhone ? (
        <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 12 }}>{tx("Handynummer")}
          <span style={{ display: "flex", gap: 8 }}>
            <select aria-label={tx("Ländervorwahl")} value={country} onChange={(e) => setCountry(e.target.value)} style={{ ...fld, width: "auto", flex: "0 0 auto" }}>
              <option value="AE">+971</option><option value="DE">+49</option>
            </select>
            <input type="tel" inputMode="tel" autoComplete="username" required value={tel} onChange={(e) => setTel(e.target.value)} placeholder={tx("z. B. 050 123 4567")} style={{ ...fld, flex: 1 }} />
          </span>
        </label>
      ) : (
        <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 12 }}>{tx("E-Mail")}
          <input type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} style={fld} />
        </label>
      )}
      <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 14 }}>{tx("Passwort")}
        <span style={{ position: "relative", display: "block" }}>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...fld, paddingRight: 96 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? tx("Passwort verbergen") : tx("Passwort anzeigen")}
            style={{ position: "absolute", right: 6, top: 10, border: 0, background: "none", color: PRIMARY, fontSize: 14, fontWeight: 650, padding: "8px 10px", cursor: "pointer" }}
          >
            {showPassword ? tx("Verbergen") : tx("Anzeigen")}
          </button>
        </span>
      </label>
      {error && <div role="alert" style={{ fontSize: 13, color: "#B3263E", background: "#FCE5EA", borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>{tx(error)}</div>}
      <button type="submit" disabled={busy} style={{ ...btn, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? tx("Moment …") : tx("Anmelden")}</button>
      {usePhone ? (
        <div style={{ fontSize: 13, color: MUTED, textAlign: "center", marginTop: 12 }}>{tx("Passwort vergessen? Bitte die Leitung fragen – sie gibt Ihnen ein neues.")}</div>
      ) : (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button type="button" onClick={sendForgot} style={{ border: 0, background: "none", color: PRIMARY, fontSize: 15, fontWeight: 650, textDecoration: "underline", cursor: "pointer", padding: 6 }}>{tx("Passwort vergessen?")}</button>
        </div>
      )}
      {phone && (
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button type="button" onClick={() => setMode(usePhone ? "email" : "phone")} style={{ border: 0, background: "none", color: PRIMARY, fontSize: 14, textDecoration: "underline", cursor: "pointer", padding: 6 }}>{usePhone ? tx("Mit E-Mail anmelden") : tx("Mit Handynummer anmelden")}</button>
        </div>
      )}
      {forgot && <div role="status" style={{ fontSize: 13, color: forgot.bad ? "#B3263E" : "#1F5F3A", background: forgot.bad ? "#FCE5EA" : "#E3F4EA", borderRadius: 12, padding: "9px 12px", marginTop: 8 }}>{tx(forgot.msg)}</div>}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>{tx("Zugänge werden von der Leitung vergeben. Eine Selbst-Registrierung gibt es nicht.")}</div>
    </form>
  );
}
