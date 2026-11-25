"use client";

import React from "react";
import SignedInRedirect from "./SignedInRedirect";
import DemoButton from "./DemoRequest";
import { useSiteLang, LangSwitch } from "./SiteLang";

// Öffentliche Startseite (dienstigo.de) auf Deutsch und Englisch (25.11.2026). Wer angemeldet ist, kommt sofort
// in seinen Bereich (SignedInRedirect). Neu: Abschnitt „Touren / Dispatcher“, Knopf „Jetzt registrieren“ (/registrieren).
// Schriften: System-Schriften des Geräts (keine Google-Fonts – die brachten den Vercel-Build zum Absturz).
const CSS = `
.dg{--dg-display:"Avenir Next","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;--dg-body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--paper:#F3F5F9;--ink:#18233A;--navy:#243B6B;--muted:#56617A;--line:#DCE2EC;--f:#D6EAF8;--f-t:#0E5E8C;--s:#D8F0E0;--s-t:#1E6B3E;--n:#24345A;--n-t:#E9EEF8;--u:#ECE3FA;--u-t:#5B3A99;--now:#E3A72F;
  background:var(--paper);color:var(--ink);font-family:var(--dg-body),system-ui,sans-serif;font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.dg *{box-sizing:border-box}
.dg a{color:inherit}
.dg :focus-visible{outline:3px solid var(--now);outline-offset:3px;border-radius:6px}
.dg-wrap{max-width:1120px;margin:0 auto;padding:0 22px}
.dg-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
.dg-mark{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:1.6rem;letter-spacing:-.03em;color:var(--navy);text-decoration:none}
.dg-mark{position:relative;padding:0;background:none;width:auto;height:auto;display:inline-block;border-radius:0;flex:none}.dg-mark::before,.dg-mark::after{display:none!important;content:none!important}
.dg-nav{display:flex;flex-direction:row;align-items:center;gap:22px;font-size:.98rem;background:none;border:0;box-shadow:none;padding:0;margin:0;position:static;width:auto;height:auto}
.dg-nav a.dg-l{text-decoration:none;color:var(--muted)}
.dg-nav a.dg-l:hover{color:var(--ink)}
.dg-btn{display:inline-block;white-space:nowrap;text-decoration:none;font-weight:700;border-radius:12px;padding:12px 20px;font-size:1rem;line-height:1.2;transition:transform .08s ease,background-color .15s ease}
.dg-btn:active{transform:translateY(1px)}
.dg-primary{background:var(--navy);color:#fff!important}
.dg-primary:hover{background:#1B2E57}
.dg-ghost{border:1.5px solid #AEBBD3;color:var(--ink)!important;background:#fff}
.dg-ghost:hover{border-color:var(--navy)}
.dg-menu{position:relative;display:inline-block}
.dg-menu-btn{cursor:pointer;font-family:inherit}
.dg-menu-btn::after{content:"";display:inline-block;margin-left:8px;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-3px) rotate(45deg);transition:transform .15s}
.dg-open .dg-menu-btn::after{transform:translateY(1px) rotate(-135deg)}
.dg-drop{position:absolute;top:calc(100% + 8px);z-index:30;min-width:270px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px;box-shadow:0 22px 44px -20px rgba(24,35,58,.45);animation:dg-pop .16s ease-out}
.dg-drop-right{right:0}.dg-drop-left{left:0}
.dg-drop::before{content:"";position:absolute;left:0;right:0;top:-10px;height:10px}
.dg-drop a{display:block;text-decoration:none;color:var(--ink);padding:11px 14px;border-radius:11px}
.dg-drop a:hover,.dg-drop a:focus-visible{background:#EEF2F8}
.dg-drop a b{display:block;font-size:1rem}
.dg-drop a span{display:block;font-size:.85rem;color:var(--muted)}
.dg-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center;padding:40px 0 88px}
.dg-h1{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(2.5rem,5.4vw,4.3rem);line-height:1.02;letter-spacing:-.035em;margin:0 0 22px;color:var(--ink)}
.dg-lead{font-size:1.18rem;line-height:1.6;color:#2E3A52;margin:0 0 30px;max-width:34em}
.dg-cta{display:flex;flex-wrap:wrap;gap:12px}
.dg-note{margin-top:22px;font-size:.95rem;color:var(--muted)}
.dg-plan{background:#fff;border:1px solid var(--line);border-radius:22px;padding:18px 18px 40px;position:relative;box-shadow:0 24px 50px -28px rgba(36,59,107,.35)}
.dg-plan-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.dg-plan-title{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.05rem}
.dg-plan-sub{font-size:.85rem;color:var(--muted)}
.dg-grid{display:grid;grid-template-columns:minmax(52px,72px) repeat(7,1fr);gap:6px;align-items:center}
.dg-day{text-align:center;font-size:.8rem;color:var(--muted);padding:4px 0;border-radius:8px}
.dg-day.dg-today{color:var(--ink);font-weight:700;box-shadow:inset 0 -3px 0 var(--now)}
.dg-name{font-size:.86rem;font-weight:700;color:#33405A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dg-cell{height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.82rem}
.dg-cell.dg-free{border:1.5px dashed #E1E6EF}
.dg-F{background:var(--f);color:var(--f-t)}.dg-S{background:var(--s);color:var(--s-t)}.dg-N{background:var(--n);color:var(--n-t)}.dg-U{background:var(--u);color:var(--u-t)}
.dg-col-today{outline:2px solid rgba(227,167,47,.55);outline-offset:1px}
.dg-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:.8rem;color:var(--muted)}
.dg-legend span{display:inline-flex;align-items:center;gap:6px}
.dg-legend i{width:12px;height:12px;border-radius:4px;display:inline-block}
.dg-stamp{position:absolute;right:-14px;bottom:-22px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 14px;font-size:.88rem;box-shadow:0 14px 30px -18px rgba(24,35,58,.45);display:flex;align-items:center;gap:10px}
.dg-dot{width:10px;height:10px;border-radius:50%;background:#1F9D55;box-shadow:0 0 0 4px rgba(31,157,85,.18)}
@keyframes dg-fill{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes dg-pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.dg-cell{animation:dg-fill .38s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 38ms + 250ms)}
.dg-stamp{animation:dg-pop .45s ease-out both;animation-delay:1.75s}
@media (prefers-reduced-motion:reduce){.dg-cell,.dg-stamp{animation:none}}
.dg-sec{padding:84px 0;border-top:1px solid var(--line)}
.dg-h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(1.8rem,3.2vw,2.5rem);letter-spacing:-.03em;line-height:1.1;margin:0 0 40px;max-width:20em}
.dg-feats{display:grid;grid-template-columns:1fr 1fr;column-gap:64px;row-gap:40px}
.dg-feat h3{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.3rem;letter-spacing:-.015em;margin:0 0 8px}
.dg-feat p{margin:0;color:#3A465E;max-width:32em}
.dg-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;list-style:none;padding:0;margin:0;counter-reset:s}
.dg-step{position:relative;padding-top:56px}
.dg-step::before{counter-increment:s;content:counter(s);position:absolute;top:0;left:0;width:40px;height:40px;border-radius:50%;background:var(--navy);color:#fff;font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;display:flex;align-items:center;justify-content:center}
.dg-step::after{content:"";position:absolute;top:20px;left:52px;right:-16px;height:2px;background:var(--line)}
.dg-step:last-child::after{display:none}
.dg-step h3{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.2rem;margin:0 0 6px}
.dg-step p{margin:0;color:#3A465E;font-size:1rem}
.dg-who{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start}
.dg-who p{margin:0 0 14px;color:#3A465E;max-width:34em}
.dg-who strong{color:var(--ink)}
.dg-origin{border-left:4px solid var(--now);padding:4px 0 4px 22px}
.dg-origin p:first-child{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.45rem;line-height:1.3;color:var(--ink);letter-spacing:-.015em}
.dg-end{background:var(--navy);color:#fff;border-radius:28px;padding:56px 48px;margin:0 0 72px;display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap}
.dg-end h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(1.8rem,3.2vw,2.4rem);letter-spacing:-.03em;margin:0 0 8px;color:#fff}
.dg-end p{margin:0;color:#D5DDEE;max-width:30em}
.dg-end .dg-primary{background:#fff;color:var(--navy)!important}
.dg-end .dg-primary:hover{background:#E9EEF8}
.dg-end a.dg-mail{color:#fff;font-weight:700}
@media (max-width:900px){
  .dg-hero{grid-template-columns:1fr;gap:44px;padding:20px 0 72px}
  .dg-feats,.dg-who{grid-template-columns:1fr;gap:32px}
  .dg-steps{grid-template-columns:1fr 1fr;row-gap:36px}
  .dg-step:nth-child(2)::after{display:none}
  .dg-stamp{right:10px}
}
@media (max-width:560px){
  .dg-nav a.dg-l{display:none}
  .dg-nav{gap:10px}
  .dg-btn{padding:11px 15px}
  .dg-top .dg-primary{display:none}
  .dg-steps{grid-template-columns:1fr}
  .dg-step::after{display:none}
  .dg-sec{padding:64px 0}
  .dg-end{padding:40px 26px;border-radius:22px}
  .dg-plan{padding:14px 12px 40px}
  .dg-grid{gap:4px;grid-template-columns:48px repeat(7,1fr)}
  .dg-cell{height:30px;font-size:.75rem}
}
.dg-tour{display:grid;grid-template-columns:1.05fr 1fr;gap:34px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:22px;padding:28px}
.dg-tour img{width:100%;border-radius:14px;border:1px solid var(--line);box-shadow:0 16px 34px -22px rgba(24,35,58,.5)}
.dg-tour ul{margin:12px 0 18px;padding:0;list-style:none}
.dg-tour li{position:relative;padding-left:26px;margin:0 0 10px}
.dg-tour li::before{content:"";position:absolute;left:0;top:.55em;width:12px;height:12px;border-radius:4px;background:#2BB3A3}
.dg-kicker{display:inline-block;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1F8A80;margin-bottom:6px}
.dg-langbox{display:flex;align-items:center}
@media (max-width:900px){.dg-tour{grid-template-columns:1fr;padding:20px}}
`;
const DAYS = { de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };
const TODAY = 2; // Mittwoch is "heute" in the sample week
const PLAN = [
  ["Anna", "F F F - - S S"],
  ["Ben", "S S - F F - -"],
  ["Clara", "N N N - - - -"],
  ["David", "- F S S N N -"],
  ["Emma", "U U U U U - -"],
];
const T = {
  de: {
    home: "Dienstigo Startseite", nav: "Hauptnavigation", features: "Funktionen", tour: "Rundgang", login: "Anmelden", demo: "Demo anfragen", register: "Jetzt registrieren",
    h1: "Der Dienstplan steht. In fünf Minuten.",
    lead: "Dienstigo plant Schichten fair nach Verträgen, Wünschen und Urlaub, erfasst die Arbeitszeit per Handy oder Chip und liefert am Monatsende die Stundenzettel für die Lohnabrechnung. Geeignet für jede Organisation: vom Gesundheitswesen über Hotels und Restaurants bis zu mobilen Diensten.",
    watch: "Rundgang ansehen", watch2: ", Schritt für Schritt oder als Film.", db: "Datenbank in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt.",
    planAria: "Beispiel: Wochenplan mit fünf Mitarbeitenden", planTitle: "Dienstplan", planSub: "Beispielwoche", today: "Heute", free: "frei",
    kind: { F: "Früh", S: "Spät", N: "Nacht", U: "Urlaub" }, stampAria: "Anna ist um 5:56 Uhr eingestempelt", stamp: "eingestempelt, 05:56 Uhr",
    featH: "Was Dienstigo Ihnen abnimmt",
    feats: [
      ["Schichtplan auf Knopfdruck", "Dienstigo verteilt Früh-, Spät- und Nachtdienste gerecht nach Vertragsstunden, achtet auf Wochenenden und Wünsche und rechnet 60 Varianten durch, bevor es Ihnen die beste zeigt."],
      ["Urlaub, ohne nachzutragen", "Mitarbeitende beantragen Urlaub in der App. Sobald Sie genehmigen, steht er im Plan, und an diesen Tagen wird niemand eingeplant."],
      ["Der Plan auf dem Handy", "Jede Person sieht ihre Schichten, wer am Tag mitarbeitet und ihr Zeitkonto. Wünsche und Anträge gehen direkt an die Leitung. Ohne App-Store."],
      ["Stempeln am Eingang", "Ein Tablet am Eingang genügt: Kommen oder Gehen tippen, dann Handy, Chip oder PIN. Gestempelte Zeiten bleiben unverändert, Korrekturen nur mit Begründung."],
      ["Fertig für die Lohnabrechnung", "Ein Klick, und für jede Person liegt ein Stundenzettel bereit: Netto- und Sollzeit, Zeitkonto, Urlaub, Krankheit sowie Nacht-, Sonntags- und Feiertagsstunden."],
      ["Ihre Daten bleiben in Deutschland", "Die Datenbank steht in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt, und jede Person sieht nur, was sie sehen darf."],
    ],
    tourKicker: "Touren", tourH: "Einsätze beim Kunden – geplant in Minuten",
    tourLead: "Für Reinigung, Pflege, Hausmeisterdienste und alle, deren Team zum Kunden fährt.",
    tourList: ["Auftrag eintragen: Kunde, Adresse, Uhrzeit, Dauer und Anzahl Personal.", "Touren schlägt das passende Personal vor: in der Nähe, fair verteilt, mit den nötigen Fähigkeiten.", "Das Team sieht den Einsatz mit Route auf dem Handy, tippt „Ich bin da“ und „Fertig“ – das Büro sieht alles live.", "Regelmäßige Kunden, Krankheit und Ersatz, Fahrten und Druck sind schon eingebaut."],
    tourImg: "/demo/touren-woche-de.webp", tourAlt: "Touren: Wochenansicht mit Aufträgen und Personal", tourBtn: "Touren im Rundgang ansehen",
    stepsH: "So läuft ein Monat mit Dienstigo",
    steps: [["Planen", "Monat wählen, genehmigter Urlaub ist schon eingetragen, Dienstplan erstellen."], ["Veröffentlichen", "Alle sehen ihren Plan sofort in der App."], ["Stempeln", "Kommen und Gehen am Tablet, Erinnerung bei vergessenen Zeiten."], ["Abschließen", "Stundenzettel drucken oder als PDF an die Lohnbuchhaltung schicken."]],
    whoH: "Für jede Organisation mit Schichten und Einsätzen",
    who: [["Kliniken und Krankenhausstationen", " besetzen ihre Stationen rund um die Uhr mit Früh-, Spät- und Nachtdiensten, fair verteilt nach Vertragsstunden."], ["Arztpraxen und Labore", " planen Sprechstunden, Teilzeit und Minijobs sowie Dienste an Wochenenden und Feiertagen."], ["Hotels und Restaurants", " planen Rezeption, Küche und Service nach Öffnungszeiten und erfassen die Arbeitszeit am Eingang."], ["Mobile Dienste", " wie Reinigung, Pflege und Hausmeister planen Einsätze beim Kunden, mit Route, festen Teams und Ersatz bei Krankheit."], ["Kleine Betriebe", " legen eigene Schichten und Öffnungstage fest und behalten Urlaub und Zeitkonten im Blick."]],
    origin1: "Entstanden im Schichtdienst, nicht im Konferenzraum.", origin2: "Dienstigo wurde von jemandem entwickelt, der selbst im Labor Schichten arbeitet. Jede Funktion löst ein Problem, das im Alltag wirklich vorkommt.",
    endAria: "Kontakt", endH: "Sehen Sie es sich an", endP1: "Registrieren Sie Ihre Firma und testen Sie Dienstigo 14 Tage kostenlos – oder wir zeigen es Ihnen in 20 Minuten. Schreiben Sie an ", endP2: ".",
  },
  en: {
    home: "Dienstigo home page", nav: "Main navigation", features: "Features", tour: "Tour", login: "Sign in", demo: "Request a demo", register: "Register now",
    h1: "Your schedule is ready. In five minutes.",
    lead: "Dienstigo plans shifts fairly according to contracts, wishes, and leave, records working time by phone or chip card, and delivers the timesheets for payroll at the end of the month. Suitable for any organization, from healthcare, hotels, and restaurants to mobile services.",
    watch: "Take the tour", watch2: ", step by step or as a film.", db: "Database in Frankfurt am Main, Germany. Each company’s data is kept strictly separate.",
    planAria: "Example: weekly schedule with five employees", planTitle: "Shift plan", planSub: "Sample week", today: "Today", free: "off",
    kind: { F: "Early", S: "Late", N: "Night", U: "Leave" }, stampAria: "Anna clocked in at 5:56 a.m.", stamp: "clocked in, 05:56",
    featH: "What Dienstigo takes off your hands",
    feats: [
      ["Schedules at the push of a button", "Dienstigo distributes early, late, and night shifts fairly according to contract hours, takes weekends and wishes into account, and calculates 60 variants before showing you the best one."],
      ["Leave without extra paperwork", "Employees request leave in the app. As soon as you approve it, it appears in the schedule, and nobody is scheduled on those days."],
      ["The schedule on every phone", "Everyone sees their shifts, who else is working that day, and their time account. Wishes and requests go straight to management. No app store needed."],
      ["Clocking in at the entrance", "A tablet at the entrance is all you need: tap In or Out, then use a phone, chip card, or PIN. Recorded times cannot be altered, and corrections require a reason."],
      ["Ready for payroll", "One click, and a timesheet is ready for every employee: net and target hours, time account, leave, sickness, and night, Sunday, and public-holiday hours."],
      ["Your data stays in Germany", "The database is located in Frankfurt am Main. Each company’s data is kept strictly separate, and everyone sees only what they are permitted to see."],
    ],
    tourKicker: "Dispatcher", tourH: "Jobs at customers’ premises – planned in minutes",
    tourLead: "For cleaning, care, facility services, and every team that travels to customers.",
    tourList: ["Enter a job: customer, address, time, duration, and number of staff.", "Dispatcher suggests the right people: nearby, fairly distributed, and with the necessary skills.", "The team sees the job and route on their phones and taps “I’m here” and “Finish” – the office follows everything live.", "Recurring customers, sickness and replacements, transport, and printing are all built in."],
    tourImg: "/demo/touren-woche-en.webp", tourAlt: "Dispatcher: week view with jobs and staff", tourBtn: "See Dispatcher in the tour",
    stepsH: "A month with Dienstigo",
    steps: [["Plan", "Choose the month – approved leave is already entered – and create the schedule."], ["Publish", "Everyone sees their schedule in the app straight away."], ["Clock in", "Arrivals and departures on the tablet, with reminders for forgotten times."], ["Close the month", "Print the timesheets or send them to payroll as a PDF."]],
    whoH: "For every organization with shifts and field jobs",
    who: [["Clinics and hospital wards", " staff their wards around the clock with early, late, and night shifts, distributed fairly according to contract hours."], ["Medical practices and laboratories", " plan consultation hours, part-time staff, and mini-jobs, as well as weekend and public-holiday shifts."], ["Hotels and restaurants", " plan reception, kitchen, and service staff around opening hours and record working time at the entrance."], ["Mobile services", " such as cleaning, care, and facility services plan jobs at customers’ premises, with routes, fixed teams, and replacements in case of illness."], ["Small businesses", " define their own shifts and opening days and keep track of leave and time accounts."]],
    origin1: "Born on the shift floor, not in a meeting room.", origin2: "Dienstigo was developed by someone who works shifts in a laboratory. Every feature solves a problem that genuinely arises in day-to-day work.",
    endAria: "Contact", endH: "See it for yourself", endP1: "Register your company and try Dienstigo free for 14 days – or let us show you in 20 minutes. Write to ", endP2: ".",
  },
};

export default function Landing() {
  const lang = useSiteLang();
  const L = T[lang];
  let i = 0;
  return (
    <div className="dg" lang={lang}>
      <SignedInRedirect />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dg-wrap">
        <header className="dg-top">
          <a href="/" className="dg-mark" aria-label={L.home}>Dienstigo</a>
          <nav className="dg-nav" aria-label={L.nav}>
            <a className="dg-l" href="#funktionen">{L.features}</a>
            <a className="dg-l" href="/demo">{L.tour}</a>
            <a className="dg-btn dg-ghost" href="/login">{L.login}</a>
            <a className="dg-btn dg-primary" href="/registrieren">{L.register}</a>
            <span className="dg-langbox"><LangSwitch lang={lang} /></span>
          </nav>
        </header>

        <main>
          <section className="dg-hero">
            <div>
              <h1 className="dg-h1">{L.h1}</h1>
              <p className="dg-lead">{L.lead}</p>
              <div className="dg-cta">
                <a className="dg-btn dg-primary" href="/registrieren">{L.register}</a>
                <DemoButton className="dg-btn dg-ghost">{L.demo}</DemoButton>
                <a className="dg-btn dg-ghost" href="/login">{L.login}</a>
              </div>
              <p className="dg-note"><a href="/demo" style={{ color: "#243B6B", fontWeight: 700 }}>{L.watch}</a>{L.watch2}</p>
              <p className="dg-note" style={{ marginTop: 6 }}>{L.db}</p>
            </div>

            <figure className="dg-plan" aria-label={L.planAria} style={{ margin: 0 }}>
              <div className="dg-plan-head">
                <span className="dg-plan-title">{L.planTitle}</span>
                <span className="dg-plan-sub">{L.planSub}</span>
              </div>
              <div className="dg-grid" role="table">
                <span role="columnheader" />
                {DAYS[lang].map((d, k) => <span key={d} role="columnheader" className={`dg-day${k === TODAY ? " dg-today" : ""}`}>{k === TODAY ? L.today : d}</span>)}
                {PLAN.map(([name, row]) => (
                  <div key={name} role="row" style={{ display: "contents" }}>
                    <span role="rowheader" className="dg-name">{name}</span>
                    {row.split(" ").map((c, k) => {
                      const n = i++;
                      const lab = lang === "en" ? { F: "E", S: "L", N: "N", U: "V" }[c] : c;
                      return c === "-"
                        ? <span key={k} role="cell" aria-label={L.free} className={`dg-cell dg-free${k === TODAY ? " dg-col-today" : ""}`} style={{ "--i": n }} />
                        : <span key={k} role="cell" title={L.kind[c]} aria-label={L.kind[c]} className={`dg-cell dg-${c}${k === TODAY ? " dg-col-today" : ""}`} style={{ "--i": n }}>{lab}</span>;
                    })}
                  </div>
                ))}
              </div>
              <div className="dg-legend" aria-hidden="true">
                <span><i className="dg-F" />{L.kind.F}</span><span><i className="dg-S" />{L.kind.S}</span><span><i className="dg-N" />{L.kind.N}</span><span><i className="dg-U" />{L.kind.U}</span>
              </div>
              <div className="dg-stamp" aria-label={L.stampAria}>
                <span className="dg-dot" />
                <span><b>Anna</b> {L.stamp}</span>
              </div>
            </figure>
          </section>

          <section id="funktionen" className="dg-sec">
            <h2 className="dg-h2">{L.featH}</h2>
            <div className="dg-feats">
              {L.feats.map(([t, p]) => (
                <div key={t} className="dg-feat"><h3>{t}</h3><p>{p}</p></div>
              ))}
            </div>
          </section>

          <section id="touren" className="dg-sec">
            <div className="dg-tour">
              <div>
                <span className="dg-kicker">{L.tourKicker}</span>
                <h2 className="dg-h2" style={{ marginBottom: 10 }}>{L.tourH}</h2>
                <p style={{ margin: 0, color: "#3A465E" }}>{L.tourLead}</p>
                <ul>{L.tourList.map((x) => <li key={x}>{x}</li>)}</ul>
                <a className="dg-btn dg-ghost" href="/demo#touren">{L.tourBtn}</a>
              </div>
              <img src={L.tourImg} alt={L.tourAlt} loading="lazy" />
            </div>
          </section>

          <section id="ablauf" className="dg-sec">
            <h2 className="dg-h2">{L.stepsH}</h2>
            <ol className="dg-steps">
              {L.steps.map(([t, p]) => <li key={t} className="dg-step"><h3>{t}</h3><p>{p}</p></li>)}
            </ol>
          </section>

          <section className="dg-sec">
            <div className="dg-who">
              <div>
                <h2 className="dg-h2" style={{ marginBottom: 20 }}>{L.whoH}</h2>
                {L.who.map(([b, p]) => <p key={b}><strong>{b}</strong>{p}</p>)}
              </div>
              <div className="dg-origin">
                <p>{L.origin1}</p>
                <p>{L.origin2}</p>
              </div>
            </div>
          </section>

          <section className="dg-end" aria-label={L.endAria}>
            <div>
              <h2>{L.endH}</h2>
              <p>{L.endP1}<a className="dg-mail" href="mailto:info@dienstigo.de">info@dienstigo.de</a>{L.endP2}</p>
            </div>
            <div className="dg-cta"><a className="dg-btn dg-primary" href="/registrieren">{L.register}</a><DemoButton className="dg-btn dg-ghost">{L.demo}</DemoButton><a className="dg-btn dg-ghost" href="/demo">{L.watch}</a></div>
          </section>
        </main>
      </div>
    </div>
  );
}
