"use client";

import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";

const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 12px", fontSize: 16, background: "#fff", color: INK };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "13px 16px", cursor: "pointer" };

export function translateAuthError(msg) {
  const m = String(msg || "").toLowerCase();
  if (m.includes("invalid login")) return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed")) return "Die E-Mail-Adresse ist noch nicht bestätigt.";
  if (m.includes("rate limit") || m.includes("too many")) return "Zu viele Versuche. Bitte kurz warten.";
  return msg || "Anmeldung fehlgeschlagen.";
}

// Email + password sign-in. The session is picked up by whoever listens to supabase.auth.
export default function LoginForm({ title = "Anmelden" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(translateAuthError(err.message));
  }

  return (
    <form onSubmit={signIn} style={{ background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 10 }}>{title}</div>
      <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 12 }}>E-Mail
        <input type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} style={fld} />
      </label>
      <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 14 }}>Passwort
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
            aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            style={{ position: "absolute", right: 6, top: 10, border: 0, background: "none", color: PRIMARY, fontSize: 14, fontWeight: 650, padding: "8px 10px", cursor: "pointer" }}
          >
            {showPassword ? "Verbergen" : "Anzeigen"}
          </button>
        </span>
      </label>
      {error && <div role="alert" style={{ fontSize: 13, color: "#B3263E", background: "#FCE5EA", borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>{error}</div>}
      <button type="submit" disabled={busy} style={{ ...btn, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Moment …" : "Anmelden"}</button>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Zugänge werden von der Leitung vergeben. Eine Selbst-Registrierung gibt es nicht.</div>
    </form>
  );
}
