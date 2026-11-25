"use client";

import React from "react";
import DemoTour from "./DemoTour";
import DemoButton from "./DemoRequest";
import { useSiteLang, LangSwitch } from "./SiteLang";

// Inhalt von /demo (Rundgang), Deutsch / Englisch (25.11.2026). Die Seite app/demo/page.js bleibt ein Server-Teil.

const CSS = `
.dgd{--dg-display:"Avenir Next","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;--dg-body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:#F3F5F9;color:#18233A;font-family:var(--dg-body),system-ui,sans-serif;font-size:1.0625rem;line-height:1.6;min-height:100vh}
.dgd *{box-sizing:border-box}
.dgd-wrap{max-width:1120px;margin:0 auto;padding:0 22px 56px}
.dgd-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
.dgd-mark{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:1.6rem;letter-spacing:-.03em;color:#243B6B;text-decoration:none}
.dgd-nav{display:flex;gap:10px;align-items:center}
.dgd-btn{display:inline-block;text-decoration:none;font-weight:700;border-radius:12px;padding:11px 18px;line-height:1.2}
.dgd-primary{background:#243B6B;color:#fff}
.dgd-ghost{border:1.5px solid #AEBBD3;color:#18233A;background:#fff}
.dgd h1{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(2rem,4vw,3rem);letter-spacing:-.035em;line-height:1.05;margin:18px 0 8px}
.dgd-lead{color:#3A465E;margin:0 0 26px;max-width:40em}
.dgd-end{margin-top:48px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.dgd :focus-visible{outline:3px solid #E3A72F;outline-offset:3px}
@media (max-width:560px){.dgd-top .dgd-ghost{display:none}.dgd-top .dgd-reg{display:none}}
`;

const T = {
  de: { nav: "Hauptnavigation", login: "Anmelden", demo: "Demo anfragen", reg: "Jetzt registrieren", h1: "So funktioniert Dienstigo",
    lead: "Sechs kurze Kapitel mit Bildern aus dem echten Programm. Klicken Sie sich durch oder drücken Sie „Abspielen“, dann läuft der Rundgang von selbst.", personal: "Persönliche Demo anfragen", home: "Zur Startseite" },
  en: { nav: "Main navigation", login: "Sign in", demo: "Request a demo", reg: "Register now", h1: "How Dienstigo works",
    lead: "Six short chapters with pictures from the real program. Click through them, or press “Play” and the tour runs by itself.", personal: "Request a personal demo", home: "Back to the home page" },
};

export default function DemoPageBody() {
  const lang = useSiteLang();
  const L = T[lang];
  return (
    <div className="dgd" lang={lang}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dgd-wrap">
        <header className="dgd-top">
          <a href="/" className="dgd-mark">Dienstigo</a>
          <nav className="dgd-nav" aria-label={L.nav}>
            <LangSwitch lang={lang} />
            <a className="dgd-btn dgd-ghost" href="/login">{L.login}</a>
            <a className="dgd-btn dgd-primary dgd-reg" href="/registrieren">{L.reg}</a>
          </nav>
        </header>
        <main>
          <h1>{L.h1}</h1>
          <p className="dgd-lead">{L.lead}</p>
          <DemoTour key={lang} lang={lang} />
          <div className="dgd-end">
            <a className="dgd-btn dgd-primary" href="/registrieren">{L.reg}</a>
            <DemoButton className="dgd-btn dgd-ghost">{L.personal}</DemoButton>
            <a className="dgd-btn dgd-ghost" href="/">{L.home}</a>
          </div>
        </main>
      </div>
    </div>
  );
}
