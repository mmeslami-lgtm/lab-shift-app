"use client";

import React from "react";
import SignedInRedirect from "./SignedInRedirect";
import DemoButton from "./DemoRequest";
import { SiteShell } from "./SiteChrome";
import { ProductCards } from "./Products";

// Öffentliche Startseite (dienstigo.de) auf Deutsch und Englisch (25.11.2026). Wer angemeldet ist, kommt sofort
// in seinen Bereich (SignedInRedirect). Neu: Abschnitt „Touren / Dispatcher“, Knopf „Jetzt registrieren“ (/registrieren).
// Schriften: System-Schriften des Geräts (keine Google-Fonts – die brachten den Vercel-Build zum Absturz).
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
    phoneAlt: "Mitarbeiter-App: der nächste Einsatz auf dem Handy", prodH: "Unsere Produkte", prodP: "Jedes Produkt funktioniert allein und alle passen zusammen. Sie buchen nur, was Sie brauchen.", home: "Dienstigo Startseite", nav: "Hauptnavigation", features: "Funktionen", tour: "Rundgang", login: "Anmelden", demo: "Demo anfragen", register: "Jetzt registrieren",
    h1: ["Der Dienstplan steht", "in fünf Minuten."],
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
    who: [["Kliniken und Krankenhausstationen", " besetzen ihre Stationen rund um die Uhr mit Früh-, Spät- und Nachtdiensten, fair verteilt nach Vertragsstunden."], ["Arztpraxen und Labore", " planen Sprechstunden, Teilzeit und Minijobs sowie Dienste an Wochenenden und Feiertagen."], ["Hotels und Restaurants", " planen Rezeption, Küche und Service nach Öffnungszeiten und erfassen die Arbeitszeit am Eingang."], ["Mobile Dienste", " wie Reinigung, Pflege und Hausmeister planen Einsätze beim Kunden, mit Route, festen Teams und Ersatz bei Krankheit."], ["Firmen mit mehreren Filialen", " planen alle Standorte in einem Programm – jede Filiale mit eigenen Schichten und eigenem Team."], ["Kleine Betriebe", " legen eigene Schichten und Öffnungstage fest und behalten Urlaub und Zeitkonten im Blick."]],
    origin1: "Entstanden im Schichtdienst, nicht im Konferenzraum.", origin2: "Dienstigo wurde von jemandem entwickelt, der selbst im Labor Schichten arbeitet. Jede Funktion löst ein Problem, das im Alltag wirklich vorkommt.",
    endAria: "Kontakt", endH: "Sehen Sie es sich an", endP1: "Registrieren Sie Ihre Firma und testen Sie Dienstigo 14 Tage kostenlos – oder wir zeigen es Ihnen in 20 Minuten. Schreiben Sie an ", endP2: ".",
  },
  en: {
    phoneAlt: "Staff app: the next job on the phone", prodH: "Our products", prodP: "Each product works on its own, and they all fit together. You only book what you need.", home: "Dienstigo home page", nav: "Main navigation", features: "Features", tour: "Tour", login: "Sign in", demo: "Request a demo", register: "Register now",
    h1: ["Your schedule is ready", "in five minutes."],
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
    who: [["Clinics and hospital wards", " staff their wards around the clock with early, late, and night shifts, distributed fairly according to contract hours."], ["Medical practices and laboratories", " plan consultation hours, part-time staff, and mini-jobs, as well as weekend and public-holiday shifts."], ["Hotels and restaurants", " plan reception, kitchen, and service staff around opening hours and record working time at the entrance."], ["Mobile services", " such as cleaning, care, and facility services plan jobs at customers’ premises, with routes, fixed teams, and replacements in case of illness."], ["Companies with several branches", " plan all locations in one program – each branch with its own shifts and its own team."], ["Small businesses", " define their own shifts and opening days and keep track of leave and time accounts."]],
    origin1: "Born on the shift floor, not in a meeting room.", origin2: "Dienstigo was developed by someone who works shifts in a laboratory. Every feature solves a problem that genuinely arises in day-to-day work.",
    endAria: "Contact", endH: "See it for yourself", endP1: "Register your company and try Dienstigo free for 14 days – or let us show you in 20 minutes. Write to ", endP2: ".",
  },
};

export default function Landing() {
  return <SiteShell before={<SignedInRedirect />}>{(lang) => <Body lang={lang} />}</SiteShell>;
}

function Body({ lang }) {
  const L = T[lang];
  const [h1a, h1b] = L.h1;
  let i = 0;
  // Maus bewegt die 3D-Bilder leicht mit (nur mit Maus, nicht beim Wischen auf dem Handy)
  const tilt = (e) => {
    if (e.pointerType !== "mouse") return;
    const b = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--ry", `${((e.clientX - b.left) / b.width - 0.5) * 12}deg`);
    e.currentTarget.style.setProperty("--rx", `${(0.5 - (e.clientY - b.top) / b.height) * 8}deg`);
  };
  const untilt = (e) => { e.currentTarget.style.setProperty("--ry", "0deg"); e.currentTarget.style.setProperty("--rx", "0deg"); };
  return (
    <>

        <main>
          <section className="dg-hero">
            <div>
              <h1 className="dg-h1">{h1a} <em>{h1b}</em></h1>
              <p className="dg-lead">{L.lead}</p>
              <div className="dg-cta">
                <a className="dg-btn dg-primary" href="/registrieren">{L.register}</a>
                <DemoButton className="dg-btn dg-ghost">{L.demo}</DemoButton>
                <a className="dg-btn dg-ghost" href="/login">{L.login}</a>
              </div>
              <p className="dg-note"><a href="/demo" style={{ color: "#243B6B", fontWeight: 700 }}>{L.watch}</a>{L.watch2}</p>
              <p className="dg-note" style={{ marginTop: 6 }}>{L.db}</p>
            </div>

            <div className="dg-stage" onPointerMove={tilt} onPointerLeave={untilt}>
            <figure className="dg-plan dg-3d dg-3d-desk dg-in-hero" aria-label={L.planAria} style={{ margin: 0, overflow: "visible", padding: "18px 18px 40px" }}>
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
            </figure>
            <div className="dg-3d dg-3d-phone dg-in-hero"><img src={`/demo/touren-app-${lang}.webp`} alt={L.phoneAlt} /></div>
            <div className="dg-float" style={{ left: "4%", bottom: "6%" }} aria-label={L.stampAria}>
              <span className="dg-dot" />
              <span><b>Anna</b> {L.stamp}</span>
            </div>
            </div>
          </section>

          <section id="funktionen" className="dg-sec">
            <h2 className="dg-h2">{L.featH}</h2>
            <div className="dg-feats">
              {L.feats.map(([t, p]) => (
                <div key={t} className="dg-feat"><h3>{t}</h3><p>{p}</p></div>
              ))}
            </div>
          </section>

          <section id="produkte" className="dg-sec">
            <h2 className="dg-h2" style={{ marginBottom: 12 }}>{L.prodH}</h2>
            <p style={{ margin: "0 0 28px", color: "#3A465E", maxWidth: "40em" }}>{L.prodP}</p>
            <ProductCards lang={lang} />
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
    </>
  );
}
