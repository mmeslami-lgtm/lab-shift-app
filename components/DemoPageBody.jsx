"use client";

import React from "react";
import DemoTour from "./DemoTour";
import DemoButton from "./DemoRequest";
import { SiteShell } from "./SiteChrome";

// Inhalt von /demo (Rundgang), Deutsch / Englisch (25.11.2026). Die Seite app/demo/page.js bleibt ein Server-Teil.


const T = {
  de: { nav: "Hauptnavigation", login: "Anmelden", demo: "Demo anfragen", reg: "Jetzt registrieren", h1: "So funktioniert Dienstigo",
    lead: "Sechs kurze Kapitel mit Bildern aus dem echten Programm. Klicken Sie sich durch oder drücken Sie „Abspielen“, dann läuft der Rundgang von selbst.", personal: "Persönliche Demo anfragen", home: "Zur Startseite" },
  en: { nav: "Main navigation", login: "Sign in", demo: "Request a demo", reg: "Register now", h1: "How Dienstigo works",
    lead: "Six short chapters with pictures from the real program. Click through them, or press “Play” and the tour runs by itself.", personal: "Request a personal demo", home: "Back to the home page" },
};

export default function DemoPageBody() {
  return (
    <SiteShell active="tour">
      {(lang) => {
        const L = T[lang];
        return (
          <main>
            <section className="dg-page-h" style={{ paddingBottom: 22 }}>
              <h1 className="dg-h1">{L.h1}</h1>
              <p className="dg-lead" style={{ marginBottom: 0 }}>{L.lead}</p>
            </section>
            <div className="dg-block" style={{ background: "#fff", border: "1px solid #DCE2EC", borderRadius: 24, padding: 22, boxShadow: "0 30px 60px -40px rgba(24,35,58,.55)" }}>
              <DemoTour key={lang} lang={lang} />
            </div>
            <div className="dg-cta" style={{ marginTop: 36 }}>
              <a className="dg-btn dg-primary" href="/registrieren">{L.reg}</a>
              <DemoButton className="dg-btn dg-ghost">{L.personal}</DemoButton>
              <a className="dg-btn dg-ghost" href="/">{L.home}</a>
            </div>
          </main>
        );
      }}
    </SiteShell>
  );
}
