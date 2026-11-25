"use client";

import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabaseClient";
import { myAreas, rememberArea, AREAS } from "../../lib/homeRoute";
import LoginForm from "../../components/LoginForm";
import DemoButton from "../../components/DemoRequest";
import { tx, setLang } from "../../lib/i18n";
import { useLang } from "../../lib/useLang";

// /login – eine Anmeldung für alle (25.11.2026): E-Mail bzw. Handynummer + Passwort, danach geht es automatisch
// in den richtigen Bereich (lib/homeRoute). Hat ein Konto mehrere Bereiche (z. B. Dienstplan, Touren, Mitarbeiter-App)
// und wurde auf diesem Gerät noch keiner benutzt, erscheint einmal eine Auswahl; danach gilt der zuletzt benutzte Bereich.
// Alte Links mit ?als=mitarbeiter führen weiterhin in die Mitarbeiter-App.

export default function LoginPage() {
  const [state, setState] = useState("checking"); // checking | form | choose | forwarding
  const [areas, setAreas] = useState([]);
  const lang = useLang(); // neu zeichnen, wenn DE/EN gewechselt wird

  useEffect(() => {
    if (!supabaseConfigured) { setState("form"); return; }
    let done = false;
    const go = async (session) => {
      if (!session || done) return;
      done = true; setState("forwarding");
      let prefer = null;
      try { prefer = new URLSearchParams(window.location.search).get("als"); } catch (e) { /* ignore */ }
      const list = await myAreas(supabase, session.user.id);
      // 25.11.2026 (Wunsch): wer mehrere Bereiche hat, wird JEDES Mal gefragt; wer nur einen hat
      // (z. B. Mitarbeitende → Mitarbeiter-App), kommt immer direkt hinein.
      let to = null;
      if (prefer === "mitarbeiter" && list.includes("/mitarbeiter")) to = "/mitarbeiter";
      else if (list.length <= 1) to = list[0] || "/profil";
      if (to) { window.location.replace(to); return; }
      setAreas(list); setState("choose");
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(data.session); else setState("form"); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => go(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const open = (href) => { rememberArea(href); setState("forwarding"); window.location.replace(href); };

  return (
    <div style={{ background: "#F3F5F9", color: "#18233A", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "28px 16px 40px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <a href="/" style={{ display: "inline-block", fontSize: 24, fontWeight: 750, letterSpacing: -0.4, color: "#243B6B", textDecoration: "none" }}>Dienstigo</a>
          <div role="group" aria-label="Sprache / Language" data-lang-switch style={{ display: "flex", background: "#E3E8F1", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["de", "DE"], ["en", "EN"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={lang === k} onClick={() => setLang(k, true)}
                style={{ border: 0, borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: lang === k ? "#fff" : "transparent", color: lang === k ? "#243B6B" : "#56617A" }}>{l}</button>
            ))}
          </div>
        </div>
        {state === "form" ? (
          <LoginForm title={tx("Anmelden")} phone />
        ) : state === "choose" ? (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 750, margin: "0 0 6px" }}>{tx("Wohin möchten Sie?")}</h1>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#56617A" }}>{tx("Ihr Konto hat mehrere Bereiche. Beim nächsten Mal geht es automatisch in den zuletzt benutzten Bereich.")}</p>
            <div style={{ display: "grid", gap: 10 }}>
              {AREAS.filter((a) => areas.includes(a.href)).map((a) => (
                <button key={a.href} type="button" onClick={() => open(a.href)}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", border: "1px solid #D5DCE8", borderRadius: 16, background: "#fff", padding: "16px 18px", cursor: "pointer", boxShadow: "0 2px 10px -6px rgba(24,35,58,.35)" }}>
                  <span aria-hidden="true" style={{ fontSize: 28, width: 46, height: 46, display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF2F8", borderRadius: 12 }}>{a.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 750, color: "#18233A" }}>{tx(a.label)}</span>
                    <span style={{ display: "block", fontSize: 13, color: "#56617A" }}>{tx(a.sub)}</span>
                  </span>
                  <span aria-hidden="true" style={{ fontSize: 20, color: "#243B6B" }}>›</span>
                </button>
              ))}
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#56617A" }}>{tx("Wechseln können Sie jederzeit über das Menü.")}</p>
          </div>
        ) : (
          <div style={{ color: "#56617A", fontSize: 15 }}>{state === "forwarding" ? tx("Angemeldet, einen Moment …") : tx("Lädt …")}</div>
        )}
        <p style={{ marginTop: 22, fontSize: 14, color: "#5B6578" }}>
          {tx("Noch kein Zugang? Die Leitung Ihrer Firma richtet ihn ein. Neu bei Dienstigo?")} <DemoButton style={{ color: "#243B6B", fontWeight: 600 }}>{tx("Demo anfragen")}</DemoButton>
        </p>
      </div>
    </div>
  );
}
