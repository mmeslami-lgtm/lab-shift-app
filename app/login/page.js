"use client";

import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabaseClient";
import { homeRoute } from "../../lib/homeRoute";
import LoginForm from "../../components/LoginForm";

// /login – eine Anmeldung für alle. Oben wählt man, als wer man sich anmeldet (Mitarbeiter, Leitung, Inhaber);
// danach geht es direkt in den passenden Bereich. Wer schon angemeldet ist, wird sofort weitergeleitet.
const ROLES = [["mitarbeiter", "Mitarbeiter"], ["leitung", "Leitung"], ["inhaber", "Inhaber"]];

export default function LoginPage() {
  const [state, setState] = useState("checking"); // checking | form | forwarding
  const [role, setRole] = useState("mitarbeiter");
  const [note, setNote] = useState("");

  useEffect(() => {
    try { const r = window.localStorage.getItem("dg-login-role"); if (r && ROLES.some(([k]) => k === r)) setRole(r); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setState("form"); return; }
    let done = false;
    const go = async (session) => {
      if (!session || done) return;
      done = true; setState("forwarding");
      let pref = role;
      try { pref = window.localStorage.getItem("dg-login-role") || role; } catch (e) { /* ignore */ }
      const to = await homeRoute(supabase, session.user.id, pref);
      let n = "";
      if (pref !== "mitarbeiter" && to === "/mitarbeiter") n = "Für dieses Konto gibt es keinen Leitungszugang – Sie kommen in die Mitarbeiter-App.";
      if (pref === "mitarbeiter" && to !== "/mitarbeiter" && to !== "/profil") n = "Dieses Konto ist kein Mitarbeiter-Konto – Sie kommen in Ihren Bereich.";
      setNote(n);
      setTimeout(() => window.location.replace(to), n ? 1800 : 0);
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(data.session); else setState("form"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => go(s));
    return () => sub.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k) => { setRole(k); try { window.localStorage.setItem("dg-login-role", k); } catch (e) { /* ignore */ } };

  return (
    <div style={{ background: "#F3F5F9", color: "#18233A", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "28px 16px 40px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <a href="/" style={{ display: "inline-block", fontSize: 24, fontWeight: 750, letterSpacing: -0.4, color: "#243B6B", textDecoration: "none", marginBottom: 20 }}>Dienstigo</a>
        {state === "form" ? (
          <>
            <div role="radiogroup" aria-label="Ich melde mich an als" style={{ display: "flex", background: "#E3E8F1", borderRadius: 14, padding: 4, gap: 4, marginBottom: 16 }}>
              {ROLES.map(([k, l]) => (
                <button key={k} role="radio" aria-checked={role === k} onClick={() => pick(k)}
                  style={{ flex: 1, border: 0, borderRadius: 11, padding: "11px 6px", fontSize: 15, fontWeight: 700, cursor: "pointer", background: role === k ? "#fff" : "transparent", color: role === k ? "#243B6B" : "#56617A", boxShadow: role === k ? "0 2px 8px -3px rgba(24,35,58,.35)" : "none", transition: "background .15s" }}>{l}</button>
              ))}
            </div>
            <LoginForm title={role === "mitarbeiter" ? "Anmelden – Mitarbeiter-App" : role === "leitung" ? "Anmelden – Leitung" : "Anmelden – Inhaber"} />
          </>
        ) : (
          <div style={{ color: "#56617A", fontSize: 15 }}>{note || (state === "forwarding" ? "Angemeldet, einen Moment …" : "Lädt …")}</div>
        )}
        <p style={{ marginTop: 22, fontSize: 14, color: "#5B6578" }}>
          Noch kein Zugang? Die Leitung Ihrer Firma richtet ihn ein. Neu bei Dienstigo? <a href="mailto:info@dienstigo.de?subject=Demo%20Dienstigo" style={{ color: "#243B6B", fontWeight: 600 }}>Demo anfragen</a>
        </p>
      </div>
    </div>
  );
}
