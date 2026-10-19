"use client";

import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabaseClient";
import { homeRoute } from "../../lib/homeRoute";
import LoginForm from "../../components/LoginForm";

// /login – one sign-in for everybody. Afterwards each person lands where they belong:
// planner of their company, employee app, or (operator) the admin area. Already signed in: straight on.
export default function LoginPage() {
  const [state, setState] = useState("checking"); // checking | form | forwarding

  useEffect(() => {
    if (!supabaseConfigured) { setState("form"); return; }
    let done = false;
    const go = async (session) => {
      if (!session || done) return;
      done = true; setState("forwarding");
      window.location.replace(await homeRoute(supabase, session.user.id));
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(data.session); else setState("form"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => go(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div style={{ background: "#F3F5F9", color: "#18233A", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "28px 16px 40px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <a href="/" style={{ display: "inline-block", fontSize: 22, fontWeight: 750, letterSpacing: -0.4, color: "#243B6B", textDecoration: "none", marginBottom: 22 }}>Dienstigo</a>
        {state === "form" ? (
          <LoginForm title="Anmelden" />
        ) : (
          <div style={{ color: "#5B6578", fontSize: 15 }}>{state === "forwarding" ? "Angemeldet, einen Moment …" : "Lädt …"}</div>
        )}
        <p style={{ marginTop: 22, fontSize: 14, color: "#5B6578" }}>
          Noch kein Zugang? Die Leitung Ihrer Firma richtet ihn ein. Neu bei Dienstigo? <a href="mailto:info@dienstigo.de?subject=Demo%20Dienstigo" style={{ color: "#243B6B", fontWeight: 600 }}>Demo anfragen</a>
        </p>
      </div>
    </div>
  );
}
