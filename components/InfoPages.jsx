"use client";

import React from "react";
import { SiteShell } from "./SiteChrome";
import DemoButton, { DemoForm } from "./DemoRequest";

// Über uns, Fragen (FAQ), Kontakt (25.11.2026). Deutsch / Englisch, gleicher Rahmen wie die Startseite.

const ICSS = `
.dg-blocks{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.dg-block{background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px;box-shadow:0 18px 36px -30px rgba(24,35,58,.5);position:relative;overflow:hidden}
.dg-block h2{font-family:var(--dg-display),system-ui,sans-serif;font-size:1.25rem;font-weight:700;margin:0 0 8px;letter-spacing:-.01em}
.dg-block p{margin:0;color:#3A465E}
.dg-ico{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:14px;background:linear-gradient(135deg,#243B6B,#2BB3A3);box-shadow:0 12px 22px -10px rgba(36,59,107,.7);transform:rotate(-6deg)}
.dg-block:hover .dg-ico{transform:rotate(0) scale(1.06);transition:transform .3s ease}
.dg-values{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0 0}
.dg-values span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-weight:700;color:var(--navy);box-shadow:0 8px 18px -14px rgba(24,35,58,.5)}
.dg-faq{max-width:820px}
.dg-faq details{background:#fff;border:1px solid var(--line);border-radius:16px;margin:0 0 12px;box-shadow:0 12px 26px -24px rgba(24,35,58,.5)}
.dg-faq summary{cursor:pointer;list-style:none;padding:18px 54px 18px 22px;font-weight:700;font-size:1.06rem;position:relative}
.dg-faq summary::-webkit-details-marker{display:none}
.dg-faq summary::after{content:"+";position:absolute;right:20px;top:50%;width:28px;height:28px;margin-top:-14px;border-radius:50%;background:#EEF2F8;color:var(--navy);display:flex;align-items:center;justify-content:center;font-size:20px;transition:transform .25s ease}
.dg-faq details[open] summary::after{transform:rotate(45deg)}
.dg-faq details p{margin:0;padding:0 22px 20px;color:#3A465E}
.dg-faq details[open] p{animation:dg-pop .25s ease-out}
.dg-contact{display:grid;grid-template-columns:1fr 1.1fr;gap:28px;align-items:start}
.dg-mailcard{background:var(--navy);color:#fff;border-radius:24px;padding:32px;position:relative;overflow:hidden}
.dg-mailcard::after{content:"";position:absolute;width:260px;height:260px;right:-80px;bottom:-110px;border-radius:50%;background:rgba(43,179,163,.35);filter:blur(10px);animation:dg-drift 14s ease-in-out infinite}
.dg-mailcard h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;margin:0 0 8px;font-size:1.5rem;color:#fff}
.dg-mailcard p{margin:0 0 20px;color:#D5DDEE}
.dg-mailcard a.dg-big{display:inline-block;font-size:1.35rem;font-weight:800;color:#fff;text-decoration:none;border-bottom:2px solid rgba(255,255,255,.4);position:relative;z-index:1}
.dg-formcard{background:#fff;border:1px solid var(--line);border-radius:24px;padding:28px 24px;box-shadow:0 24px 44px -32px rgba(24,35,58,.55)}
@media (max-width:820px){.dg-blocks,.dg-contact{grid-template-columns:1fr}}
`;

const ABOUT = {
  de: {
    h1: "Über Dienstigo", lead: "Dienstigo ist eine Online-Software für Dienstplan, Zeiterfassung und Einsätze beim Kunden – entwickelt vom Team Dienstigo, aus dem Schichtdienst für den Schichtdienst.",
    values: ["Fair", "Einfach", "Sicher", "Zeitsparend"],
    blocks: [
      ["🧪", "Entstanden im Schichtdienst", "Dienstigo wurde von jemandem entwickelt, der selbst im Labor Schichten arbeitet. Jede Funktion löst ein Problem, das im Alltag wirklich vorkommt – vom Nachtdienst bis zur kurzfristigen Krankmeldung."],
      ["🎯", "Unser Ziel", "Planung, die fair ist und Zeit spart: weniger Tabellen, weniger Telefonate und keine Diskussionen mehr darüber, wer schon wieder am Wochenende arbeitet."],
      ["✨", "Einfach statt kompliziert", "Dienstigo läuft im Browser und auf dem Handy, ohne Installation und ohne lange Schulung. Alles ist auf Deutsch und Englisch verfügbar."],
      ["🔒", "Ihre Daten sind sicher", "Die Datenbank liegt in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt, und jede Person sieht nur, was sie sehen darf."],
    ],
    teamH: "Das Team Dienstigo", teamP: "Wir sind ein kleines Team aus Entwicklung und Praxis. Rückmeldungen unserer Kunden fließen direkt in das Programm ein – schreiben Sie uns, was Ihnen fehlt.",
  },
  en: {
    h1: "About Dienstigo", lead: "Dienstigo is online software for shift planning, time tracking, and jobs at customers’ premises – developed by the Dienstigo team, from shift work for shift work.",
    values: ["Fair", "Simple", "Secure", "Time-saving"],
    blocks: [
      ["🧪", "Born in shift work", "Dienstigo was developed by someone who works shifts in a laboratory. Every feature solves a problem that genuinely arises in day-to-day work – from night shifts to last-minute sick calls."],
      ["🎯", "Our goal", "Planning that is fair and saves time: fewer spreadsheets, fewer phone calls, and no more arguments about who is working the weekend again."],
      ["✨", "Simple, not complicated", "Dienstigo runs in the browser and on the phone, with no installation and no lengthy training. Everything is available in German and English."],
      ["🔒", "Your data is secure", "The database is located in Frankfurt am Main, Germany. Each company’s data is kept strictly separate, and everyone sees only what they are permitted to see."],
    ],
    teamH: "The Dienstigo team", teamP: "We are a small team that combines software development with hands-on experience. Our customers’ feedback goes straight into the program – write to us and tell us what you are missing.",
  },
};

const FAQ = {
  de: {
    h1: "Häufige Fragen", lead: "Die wichtigsten Antworten auf einen Blick. Ihre Frage ist nicht dabei? Schreiben Sie uns an info@dienstigo.de.",
    items: [
      ["Was kostet Dienstigo?", "Die ersten 14 Tage sind kostenlos und ohne Zahlungsdaten. Der Preis richtet sich danach, welche Produkte Sie nutzen. Schreiben Sie uns, und wir machen Ihnen ein Angebot."],
      ["Was passiert nach den 14 Tagen?", "Sie entscheiden, ob Sie weitermachen. Ohne Ihre Entscheidung endet die Testphase einfach – es entstehen keine Kosten."],
      ["Muss ich etwas installieren?", "Nein. Dienstigo läuft im Browser auf Computer, Tablet und Handy. Auch die Mitarbeiter-App braucht keinen App-Store."],
      ["Eignet sich Dienstigo für mehrere Filialen?", "Ja. Im Dienstplan allgemein bekommt jede Filiale eigene Schichten und ein eigenes Team, alles in einem Plan. Mitarbeitende sehen in der App, in welcher Filiale sie arbeiten, und der Stundenzettel zeigt den Ort. In Touren startet jede Person von ihrem eigenen Startpunkt, zum Beispiel ihrer Filiale."],
      ["Kann ich nur ein Produkt nutzen?", "Ja. Jedes Produkt funktioniert allein, zum Beispiel nur die Zeiterfassung oder nur Touren. Weitere Produkte können Sie jederzeit dazunehmen."],
      ["Wie kommen meine Mitarbeitenden ins Programm?", "Sie legen sie einmal an und geben ihnen einen Zugang. Die Anmeldung funktioniert mit E-Mail oder Handynummer."],
      ["Brauche ich ein Stempelgerät?", "Nicht unbedingt. Ein Tablet am Eingang genügt; gestempelt wird per Handy mit QR-Code, mit Chip oder mit PIN."],
      ["Wo liegen meine Daten?", "In einer Datenbank in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt, und jede Person sieht nur, was sie sehen darf."],
      ["Welche Sprachen gibt es?", "Deutsch und Englisch. Jede Person kann ihre Sprache selbst wählen."],
      ["Wie registriere ich meine Firma?", "Über „Jetzt registrieren“. Wir richten Ihren Zugang ein und schicken Ihnen eine E-Mail mit Ihrem Passwort."],
      ["Wer hilft mir am Anfang?", "Im Programm gibt es eine Schulung Schritt für Schritt. Bei Fragen erreichen Sie uns jederzeit per E-Mail."],
    ],
  },
  en: {
    h1: "Frequently asked questions", lead: "The most important answers at a glance. Is your question missing? Write to us at info@dienstigo.de.",
    items: [
      ["How much does Dienstigo cost?", "The first 14 days are free, with no payment details required. The price depends on which products you use. Write to us, and we will send you an offer."],
      ["What happens after the 14 days?", "You decide whether to continue. If you do not decide, the trial simply ends – there are no costs."],
      ["Do I need to install anything?", "No. Dienstigo runs in the browser on computers, tablets, and phones. The staff app does not need an app store either."],
      ["Is Dienstigo suitable for several branches?", "Yes. In the General planner, each branch gets its own shifts and its own team, all in one schedule. Employees see in the app which branch they work at, and the timesheet shows the location. In Dispatcher, each person starts from their own starting point – their branch, for example."],
      ["Can I use just one product?", "Yes. Each product works on its own – for example, only time tracking or only Dispatcher. You can add more products at any time."],
      ["How do my employees get into the program?", "You add them once and give them access. They sign in with their email address or mobile number."],
      ["Do I need a time clock?", "Not necessarily. A tablet at the entrance is enough; employees clock in by phone with a QR code, with a chip card, or with a PIN."],
      ["Where is my data stored?", "In a database in Frankfurt am Main, Germany. Each company’s data is kept strictly separate, and everyone sees only what they are permitted to see."],
      ["Which languages are available?", "German and English. Everyone can choose their own language."],
      ["How do I register my company?", "Click “Register now”. We will set up your account and send you an email with your password."],
      ["Who helps me get started?", "The program includes step-by-step training. If you have questions, you can reach us by email at any time."],
    ],
  },
};

const CONTACT = {
  de: { h1: "Kontakt", lead: "Fragen, Wünsche oder eine persönliche Vorführung? Wir freuen uns auf Ihre Nachricht.", mailH: "Schreiben Sie uns", mailP: "Wir melden uns so bald wie möglich bei Ihnen.", formH: "Demo anfragen", regH: "Lieber gleich selbst ausprobieren?", reg: "Jetzt registrieren" },
  en: { h1: "Contact", lead: "Questions, requests, or a personal demonstration? We look forward to hearing from you.", mailH: "Write to us", mailP: "We will get back to you as soon as possible.", formH: "Request a demo", regH: "Prefer to try it yourself right away?", reg: "Register now" },
};

const END = {
  de: { h: "Überzeugen Sie sich selbst", p: "14 Tage kostenlos testen oder eine Vorführung anfragen.", reg: "Jetzt registrieren", demo: "Demo anfragen" },
  en: { h: "See it for yourself", p: "Try it free for 14 days or request a demonstration.", reg: "Register now", demo: "Request a demo" },
};

function End({ lang }) {
  const E = END[lang];
  return (
    <section className="dg-end" style={{ marginTop: 64 }}>
      <div><h2>{E.h}</h2><p>{E.p}</p></div>
      <div className="dg-cta"><a className="dg-btn dg-primary" href="/registrieren">{E.reg}</a><DemoButton className="dg-btn dg-ghost">{E.demo}</DemoButton></div>
    </section>
  );
}

export function AboutPage() {
  return (
    <SiteShell active="about">
      {(lang) => {
        const A = ABOUT[lang];
        return (
          <main>
            <style dangerouslySetInnerHTML={{ __html: ICSS }} />
            <section className="dg-page-h">
              <h1 className="dg-h1">{A.h1}</h1>
              <p className="dg-lead">{A.lead}</p>
              <div className="dg-values">{A.values.map((v) => <span key={v}>{v}</span>)}</div>
            </section>
            <div className="dg-blocks">
              {A.blocks.map(([i, t, p]) => <div key={t} className="dg-block"><div className="dg-ico" aria-hidden="true">{i}</div><h2>{t}</h2><p>{p}</p></div>)}
            </div>
            <section className="dg-sec" style={{ marginTop: 64 }}>
              <div className="dg-origin" style={{ maxWidth: "44em" }}>
                <p>{A.teamH}</p>
                <p>{A.teamP} <a href="mailto:info@dienstigo.de" style={{ color: "#243B6B", fontWeight: 700 }}>info@dienstigo.de</a></p>
              </div>
            </section>
            <End lang={lang} />
          </main>
        );
      }}
    </SiteShell>
  );
}

export function FaqPage() {
  return (
    <SiteShell active="faq">
      {(lang) => {
        const F = FAQ[lang];
        return (
          <main>
            <style dangerouslySetInnerHTML={{ __html: ICSS }} />
            <section className="dg-page-h">
              <h1 className="dg-h1">{F.h1}</h1>
              <p className="dg-lead">{F.lead}</p>
            </section>
            <div className="dg-faq">
              {F.items.map(([q, a], k) => <details key={q} open={k === 0 ? true : undefined}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
            <End lang={lang} />
          </main>
        );
      }}
    </SiteShell>
  );
}

export function ContactPage() {
  return (
    <SiteShell active="contact">
      {(lang) => {
        const C = CONTACT[lang];
        return (
          <main>
            <style dangerouslySetInnerHTML={{ __html: ICSS }} />
            <section className="dg-page-h">
              <h1 className="dg-h1">{C.h1}</h1>
              <p className="dg-lead">{C.lead}</p>
            </section>
            <div className="dg-contact">
              <div>
                <div className="dg-mailcard">
                  <h2>{C.mailH}</h2>
                  <p>{C.mailP}</p>
                  <a className="dg-big" href="mailto:info@dienstigo.de">info@dienstigo.de</a>
                </div>
                <div className="dg-block" style={{ marginTop: 20 }}>
                  <h2>{C.regH}</h2>
                  <p style={{ marginBottom: 16 }}>{END[lang].p}</p>
                  <a className="dg-btn dg-primary" href="/registrieren">{C.reg}</a>
                </div>
              </div>
              <div className="dg-formcard">
                <DemoForm autoFocus={false} intro={<h2 style={{ fontFamily: "var(--dg-display),system-ui,sans-serif", fontSize: "1.4rem", fontWeight: 700, margin: "0 0 16px", color: "#243B6B" }}>{C.formH}</h2>} />
              </div>
            </div>
          </main>
        );
      }}
    </SiteShell>
  );
}
