"use client";

import React from "react";
import { SiteShell } from "./SiteChrome";
import DemoButton from "./DemoRequest";
import { SceneAllgemein, DT_CSS } from "./DemoTour";

// Produkte (25.11.2026): Übersicht /produkte und je Produkt eine Seite /produkte/<slug>. Deutsch / Englisch.
// Bilder: echte Bildschirmfotos (public/demo, public/site); wo es kein englisches Foto gibt, die gezeichnete Beispielansicht.

export const PRODUCTS = [
  {
    slug: "dienstplan-labor", img: { de: "/demo/plan.webp", en: "scene" },
    de: {
      name: "Dienstplan Labor", short: "Früh-, Spät- und Nachtdienste rund um die Uhr, fair verteilt nach Vertragsstunden.",
      lead: "Für Labore, Kliniken und Stationen mit Diensten rund um die Uhr. Ein Klick, und Dienstigo verteilt alle Schichten des Monats gerecht – nach Vertrag, Wünschen, Urlaub und Ruhezeiten.",
      points: [["Ein Klick, 60 Varianten", "Dienstigo rechnet 60 Pläne durch und zeigt Ihnen den besten."], ["Früh, Mittel, Büro, Spät, Nacht", "Die üblichen Labordienste sind schon eingerichtet und lassen sich anpassen."], ["Wochenenden und Feiertage fair", "Nächte und Wochenenden werden reihum verteilt, Ausnahmen per Häkchen."], ["Stunden im Blick", "Soll, Ist und Differenz je Person; der Saldo geht in den nächsten Monat."], ["Krankheit und Tausch", "Ausfall eintragen, Dienstigo schlägt Ersatz vor."], ["Freigabe und Archiv", "Pläne werden freigegeben und bleiben nachvollziehbar gespeichert."]],
    },
    en: {
      name: "Lab shift planning", short: "Early, late, and night shifts around the clock, distributed fairly according to contract hours.",
      lead: "For laboratories, clinics, and wards with round-the-clock shifts. One click, and Dienstigo distributes all of the month’s shifts fairly – according to contracts, wishes, leave, and rest periods.",
      points: [["One click, 60 variants", "Dienstigo calculates 60 schedules and shows you the best one."], ["Early, middle, office, late, night", "The usual lab shifts are already set up and can be adjusted."], ["Fair weekends and holidays", "Nights and weekends are rotated fairly, with exceptions set by a checkbox."], ["Hours at a glance", "Target, actual, and difference per person; the balance carries over to the next month."], ["Sickness and swaps", "Enter an absence, and Dienstigo suggests a replacement."], ["Approval and archive", "Schedules are approved and stored in a traceable way."]],
    },
  },
  {
    slug: "dienstplan", img: { de: "scene", en: "scene" },
    de: {
      name: "Dienstplan", short: "Eigene Schichten und Öffnungstage – für Praxen, Hotels, Restaurants und jeden Betrieb.",
      lead: "Sie legen Ihre Schichten mit Namen und Uhrzeit selbst an und bestimmen, an welchen Tagen wie viele Personen arbeiten. Dienstigo erstellt daraus den Monatsplan.",
      points: [["Eigene Schichten", "So viele Schichten, wie Sie brauchen – mit Namen, Uhrzeit und Farbe."], ["Öffnungstage", "Geschlossene Tage, halbe Tage und Betriebsferien mit einem Klick."], ["Besetzung je Schicht", "Wie viele Personen gleichzeitig arbeiten, auch am Wochenende."], ["Teilzeit und Minijobs", "Wochenstunden und Verdienstgrenzen werden berücksichtigt."], ["Urlaub und Wünsche", "Genehmigter Urlaub steht schon im Plan, Wünsche fließen ein."], ["Von Hand anpassen", "Jede Zelle lässt sich nach dem Erstellen ändern."]],
    },
    en: {
      name: "Shift planning", short: "Your own shifts and opening days – for practices, hotels, restaurants, and any business.",
      lead: "You create your own shifts with names and times and decide how many people work on which days. From this, Dienstigo creates the monthly schedule.",
      points: [["Your own shifts", "As many shifts as you need – with name, time, and color."], ["Opening days", "Closed days, half days, and company holidays with one click."], ["Staffing per shift", "How many people work at the same time, including on weekends."], ["Part-time and mini-jobs", "Weekly hours and earnings limits are taken into account."], ["Leave and wishes", "Approved leave is already in the schedule, and wishes are included."], ["Adjust by hand", "Every cell can be changed after the schedule is created."]],
    },
  },
  {
    slug: "zeiterfassung", img: { de: "/site/terminal-de.webp", en: "/site/terminal-en.webp" }, wide: true,
    de: {
      name: "Zeiterfassung", short: "Stempeln am Tablet, per Handy oder Chip – und am Monatsende die Stundenzettel.",
      lead: "Ein Tablet am Eingang genügt: Kommen oder Gehen wählen, dann QR-Code mit dem Handy scannen, Chip an den Leser halten oder PIN eingeben. Am Monatsende sind die Stundenzettel fertig.",
      points: [["Drei Wege zum Stempeln", "Handy mit QR-Code, Chip oder PIN – Sie entscheiden."], ["Uhrzeit vom Server", "Gestempelte Zeiten lassen sich nicht verändern, Korrekturen brauchen einen Grund."], ["Erinnerung", "Wer das Stempeln vergisst, wird erinnert."], ["Zeitkonto", "Plus- und Minusstunden sind immer aktuell."], ["Stundenzettel", "Für alle oder eine Person, als PDF für die Lohnbuchhaltung."], ["Zuschläge", "Nacht, Sonntag und Feiertag mit Lohnart-Code."]],
    },
    en: {
      name: "Time tracking", short: "Clock in on a tablet, by phone, or with a chip card – and get the timesheets at the end of the month.",
      lead: "A tablet at the entrance is all you need: choose clock in or clock out, then scan the QR code with a phone, hold a chip card to the reader, or enter a PIN. At the end of the month, the timesheets are ready.",
      points: [["Three ways to clock in", "Phone with QR code, chip card, or PIN – you decide."], ["Time from the server", "Recorded times cannot be altered, and corrections require a reason."], ["Reminders", "Anyone who forgets to clock in gets a reminder."], ["Time account", "Overtime and undertime are always up to date."], ["Timesheets", "For everyone or for one person, as a PDF for payroll."], ["Premiums", "Night, Sunday, and public-holiday premiums with wage-type codes."]],
    },
  },
  {
    slug: "touren", img: { de: "/demo/touren-woche-de.webp", en: "/demo/touren-woche-en.webp" },
    de: {
      name: "Touren", short: "Einsätze beim Kunden planen: Auftrag, Personal, Route und Ersatz bei Krankheit.",
      lead: "Für Reinigung, Pflege, Hausmeister und alle mobilen Dienste. Aufträge eintragen, das passende Personal zuteilen, und das Team sieht alles auf dem Handy.",
      points: [["Aufträge in Minuten", "Kunde, Adresse, Uhrzeit, Dauer und Anzahl Personal."], ["Passende Vorschläge", "Vom Kunden bevorzugt, in der Nähe, fair verteilt und mit den nötigen Fähigkeiten."], ["Regelmäßige Kunden", "Jede Woche, alle zwei Wochen oder monatlich – mit Pause und Ende."], ["„Bitte prüfen“", "Krankheit, fehlendes Personal und Verspätungen auf einen Blick."], ["Ersatz für alle Tage", "Ist jemand mehrere Tage krank, übernimmt eine Kollegin alles mit einem Klick."], ["Fahrten und Druck", "Fahrer, Wochenplan zum Ausdrucken und Kundenverlauf."]],
    },
    en: {
      name: "Dispatcher", short: "Plan jobs at customers’ premises: order, staff, route, and replacements in case of illness.",
      lead: "For cleaning, care, facility, and all mobile services. Enter the jobs, assign the right staff, and the team sees everything on their phones.",
      points: [["Jobs in minutes", "Customer, address, time, duration, and number of staff."], ["The right suggestions", "Preferred by the customer, nearby, fairly distributed, and with the necessary skills."], ["Recurring customers", "Weekly, every two weeks, or monthly – with pauses and an end date."], ["“Please check”", "Sickness, missing staff, and delays at a glance."], ["One replacement for all days", "If someone is ill for several days, a colleague takes over everything with one click."], ["Transport and printing", "Drivers, a printable weekly schedule, and the customer history."]],
    },
  },
  {
    slug: "mitarbeiter-app", img: { de: "/site/app-de.webp", en: "/site/app-en.webp" }, phone: true,
    de: {
      name: "Mitarbeiter-App", short: "Plan, Einsätze, Anträge und Zeitkonto auf dem Handy – ohne App-Store.",
      lead: "Jede Person sieht ihren Plan und ihre Einsätze auf dem Handy, beantragt Urlaub und sieht ihr Zeitkonto. Die App läuft im Browser, ohne Installation aus dem App-Store.",
      points: [["Der nächste Dienst", "Groß oben: wann, wo und mit wem."], ["Der ganze Monat", "Kalender mit allen Schichten und Einsätzen."], ["Anträge", "Urlaub und Wünsche direkt an die Leitung."], ["Zeitkonto", "Jeder Tag lässt sich öffnen, Korrekturen können beantragt werden."], ["Einsätze vor Ort", "„Ich bin da“, „Fertig“ und Hinweise zum Kunden."], ["Deutsch und Englisch", "Jede Person wählt ihre Sprache."]],
    },
    en: {
      name: "Staff app", short: "Schedule, jobs, requests, and time account on the phone – no app store needed.",
      lead: "Everyone sees their schedule and jobs on their phone, requests leave, and checks their time account. The app runs in the browser, with no installation from an app store.",
      points: [["The next shift", "Right at the top: when, where, and with whom."], ["The whole month", "A calendar with all shifts and jobs."], ["Requests", "Leave and wishes go straight to management."], ["Time account", "Any day can be opened, and corrections can be requested."], ["Jobs on site", "“I’m here”, “Finish”, and notes about the customer."], ["German and English", "Everyone chooses their own language."]],
    },
  },
];

const UI = {
  de: { title: "Produkte", lead: "Fünf Bausteine, die einzeln funktionieren und zusammenpassen. Sie buchen nur, was Sie brauchen – alle 14 Tage kostenlos testen.", more: "Mehr erfahren →", all: "Alle Produkte", register: "Jetzt registrieren", tour: "Im Rundgang ansehen", demo: "Demo anfragen", other: "Weitere Produkte", sample: "Beispielansicht", ctaH: "Bereit zum Ausprobieren?", ctaP: "14 Tage kostenlos, ohne Zahlungsdaten." },
  en: { title: "Products", lead: "Five building blocks that work on their own and fit together. You only book what you need – try everything free for 14 days.", more: "Learn more →", all: "All products", register: "Register now", tour: "See it in the tour", demo: "Request a demo", other: "More products", sample: "Sample view", ctaH: "Ready to try it?", ctaP: "Free for 14 days, no payment details required." },
};

const PCSS = `
.dg-scene-wrap{width:100%}
.dg-card-img.dg-wide{align-items:center;padding:16px}
.dg-card-img.dg-wide img{width:100%;height:auto;object-fit:contain;border-radius:10px;transform:rotateX(10deg);transform-origin:center}
.dg-scene-wrap .dt-frame{border-radius:0}
.dg-card-img .dg-scene-wrap{width:92%;transform:rotateX(14deg);transform-origin:bottom;border-radius:10px 10px 0 0;overflow:hidden;box-shadow:0 16px 30px -18px rgba(24,35,58,.6)}
.dg-prod-hero{display:grid;grid-template-columns:1fr 1.1fr;gap:48px;align-items:center;padding:20px 0 56px}
.dg-prod-shot{perspective:1500px}
.dg-prod-shot>div{border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#fff;box-shadow:0 40px 70px -30px rgba(24,35,58,.55);transform:rotateY(-12deg) rotateX(6deg);transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dg-prod-shot:hover>div{transform:rotateY(-5deg) rotateX(3deg)}
.dg-prod-shot img{display:block;width:100%}
.dg-prod-shot.dg-phone>div{max-width:340px;margin:0 auto;border-radius:34px;border:9px solid #1B2433}
.dg-points{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.dg-point{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 14px 30px -26px rgba(24,35,58,.5)}
.dg-point h3{font-family:var(--dg-display),system-ui,sans-serif;font-size:1.08rem;font-weight:700;margin:0 0 6px}
.dg-point p{margin:0;color:#3A465E;font-size:.97rem}
.dg-point::before{content:"";display:block;width:30px;height:30px;border-radius:10px;margin-bottom:12px;background:linear-gradient(135deg,#243B6B,#2BB3A3);box-shadow:0 8px 16px -8px rgba(36,59,107,.7)}
@media (max-width:900px){.dg-prod-hero{grid-template-columns:1fr;gap:30px}.dg-points{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.dg-points{grid-template-columns:1fr}}
`;

function Scene({ lang }) {
  return <div className="dt dg-scene-wrap"><div className="dt-frame" style={{ maxWidth: "none" }}><SceneAllgemein lang={lang} /></div></div>;
}

function Shot({ p, lang, alt }) {
  const src = p.img[lang];
  return src === "scene" ? <Scene lang={lang} /> : <img src={src} alt={alt} loading="lazy" />;
}

function Styles() {
  return <style dangerouslySetInnerHTML={{ __html: DT_CSS + PCSS }} />;
}

export function ProductCards({ lang, skip }) {
  const U = UI[lang];
  return (
    <div className="dg-cards">
      <Styles />
      {PRODUCTS.filter((p) => p.slug !== skip).map((p) => (
        <a key={p.slug} className="dg-card" href={`/produkte/${p.slug}`} data-product={p.slug}>
          <div className={`dg-card-img${p.phone ? " dg-phone" : ""}${p.wide ? " dg-wide" : ""}`}><Shot p={p} lang={lang} alt={p[lang].name} /></div>
          <div className="dg-card-b"><h3>{p[lang].name}</h3><p>{p[lang].short}</p><span className="dg-more">{U.more}</span></div>
        </a>
      ))}
    </div>
  );
}

function Cta({ lang }) {
  const U = UI[lang];
  return (
    <section className="dg-end" style={{ marginTop: 64 }}>
      <div><h2>{U.ctaH}</h2><p>{U.ctaP}</p></div>
      <div className="dg-cta"><a className="dg-btn dg-primary" href="/registrieren">{U.register}</a><DemoButton className="dg-btn dg-ghost">{U.demo}</DemoButton></div>
    </section>
  );
}

export function ProductsPage() {
  return (
    <SiteShell active="products">
      {(lang) => (
        <main>
          <section className="dg-page-h">
            <h1 className="dg-h1">{UI[lang].title}</h1>
            <p className="dg-lead">{UI[lang].lead}</p>
          </section>
          <ProductCards lang={lang} />
          <Cta lang={lang} />
        </main>
      )}
    </SiteShell>
  );
}

export function ProductPage({ slug }) {
  const p = PRODUCTS.find((x) => x.slug === slug) || PRODUCTS[0];
  const tourKey = { "dienstplan-labor": "", dienstplan: "", zeiterfassung: "", touren: "#touren", "mitarbeiter-app": "" }[p.slug];
  return (
    <SiteShell active="products">
      {(lang) => {
        const U = UI[lang], C = p[lang];
        return (
          <main>
            <Styles />
            <p className="dg-crumb"><a href="/produkte">{U.all}</a> / {C.name}</p>
            <section className="dg-prod-hero">
              <div>
                <h1 className="dg-h1">{C.name}</h1>
                <p className="dg-lead">{C.lead}</p>
                <div className="dg-cta">
                  <a className="dg-btn dg-primary" href="/registrieren">{U.register}</a>
                  <a className="dg-btn dg-ghost" href={`/demo${tourKey}`}>{U.tour}</a>
                </div>
              </div>
              <div className={`dg-prod-shot${p.phone ? " dg-phone" : ""}`}><div><Shot p={p} lang={lang} alt={C.name} /></div></div>
            </section>
            <section className="dg-points">
              {C.points.map(([t, x]) => <div key={t} className="dg-point"><h3>{t}</h3><p>{x}</p></div>)}
            </section>
            <section className="dg-sec" style={{ marginTop: 64 }}>
              <h2 className="dg-h2" style={{ marginBottom: 24 }}>{U.other}</h2>
              <ProductCards lang={lang} skip={p.slug} />
            </section>
            <Cta lang={lang} />
          </main>
        );
      }}
    </SiteShell>
  );
}
