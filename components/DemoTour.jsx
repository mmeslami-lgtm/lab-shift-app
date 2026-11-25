"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Rundgang auf /demo: echte Bildschirmfotos (public/demo/*.webp) mit einem hervorgehobenen Bereich und
// kurzem Text. Weiter/Zurück per Klick oder Pfeiltasten, oder "Abspielen": dann läuft der Rundgang wie ein
// Film von selbst durch alle Kapitel. Hervorhebung in Prozent des Bildes: [links, oben, rechts, unten].
// 25.11.2026: Deutsch / Englisch (en: [Titel, Text]) und neues Kapitel „Touren / Dispatcher“ (Bilder je Sprache: img-de / img-en).
const CHAPTERS = [
  {
    key: "plan", title: "Dienstplan Labor", who: "für Labore", en: ["Shift plan – lab", "for laboratories"],
    steps: [
      { img: "personen", phone: false, box: [54, 6, 99, 92], title: "Mitarbeitende anlegen", text: "Name, Wochenstunden und Vollzeit, Teilzeit oder Minijob einmal eintragen. Wer keine Nächte oder Wochenenden arbeitet, bekommt ein Häkchen.", en: ["Add your staff", "Enter each person’s name, weekly hours, and full-time, part-time, or mini-job status once. Anyone who does not work nights or weekends simply gets a checkmark."] },
      { img: "plan", phone: false, box: [14, 7, 92, 100], title: "Dienstplan erstellen", text: "Ein Klick: Dienstigo verteilt alle Schichten des Monats gerecht und zeigt Ihnen die beste von 60 Varianten.", en: ["Create the schedule", "One click: Dienstigo distributes all of the month’s shifts fairly and shows you the best of 60 variants."] },
      { img: "plan", phone: false, box: [75, 0, 91, 100], title: "Jede Schicht im Blick", text: "Früh, Mittel, Büro, Spät und Nacht sind für Labore schon eingerichtet. Ändern geht per Klick in die Zelle.", en: ["Every shift at a glance", "Early, middle, office, late, and night shifts are already set up for laboratories. To change one, simply click the cell."] },
      { img: "summe", phone: false, box: [46, 9, 66, 98], title: "Stunden fair verteilt", text: "Ziel und Differenz zeigen, ob jede Person ihre Vertragsstunden erreicht. Am Monatsende geht der Saldo in den nächsten Monat.", en: ["Hours distributed fairly", "Target and difference show whether each person reaches their contract hours. At the end of the month, the balance is carried over to the next month."] },
    ],
  },
  {
    key: "allgemein", title: "Dienstplan allgemein", who: "für alle Betriebe", en: ["Shift plan – general", "for every business"],
    steps: [
      { scene: "allgemein", box: [2, 2, 48, 49], title: "Eigene Schichten", text: "Ob Praxis, Café, Pflegedienst oder Laden: Sie legen Ihre Schichten mit Namen und Uhrzeit selbst an, so viele Sie brauchen.", en: ["Your own shifts", "Whether you run a practice, a café, a care service, or a shop, you create your own shifts with names and times – as many as you need."] },
      { scene: "allgemein", box: [51, 2, 98, 49], title: "Öffnungstage und Besetzung", text: "Sie bestimmen, an welchen Tagen geöffnet ist und wie viele Personen pro Schicht gleichzeitig arbeiten. Teilzeit, Minijobs, Urlaub und Wünsche werden berücksichtigt.", en: ["Opening days and staffing", "You decide on which days you are open and how many people work in each shift. Part-time staff, mini-jobs, leave, and wishes are all taken into account."] },
      { scene: "allgemein", box: [2, 50, 98, 88], title: "Der fertige Plan", text: "Daraus erstellt Dienstigo den Monatsplan, mit allem, was auch das Labor hat: Mitarbeiter-App, Stempeln am Eingang und Stundenzettel.", en: ["The finished schedule", "From this, Dienstigo creates the monthly schedule – with everything the lab version offers: the staff app, clocking in at the entrance, and timesheets."] },
    ],
  },
  {
    key: "touren", title: "Touren", who: "Einsätze beim Kunden", en: ["Dispatcher", "jobs at customers’ premises"],
    steps: [
      { img: "touren-woche", lang: true, phone: false, box: [25, 16, 98, 49], title: "Alles im roten Kasten", text: "Oben sehen Sie alles, was eine Entscheidung braucht: wer krank ist, wo Personal fehlt, welcher Einsatz länger dauert. Darunter alle Aufträge der Woche mit Uhrzeit, Kunde und Personal.", en: ["Everything in the red box", "At the top you see everything that needs a decision: who is ill, where staff are missing, and which job is running over. Below are all of the week’s jobs with time, customer, and staff."] },
      { img: "touren-zuteilen", lang: true, phone: false, box: [2, 31, 98, 70], title: "Das passende Personal", text: "Touren schlägt vor, wer passt: vom Kunden bevorzugt, in der Nähe, fair nach Vertragsstunden und mit den nötigen Fähigkeiten. Ein Klick teilt zu.", en: ["The right people", "Dispatcher suggests who fits best: preferred by the customer, nearby, fair according to contract hours, and with the necessary skills. One click assigns them."] },
      { img: "touren-app", lang: true, phone: true, box: [3, 16, 97, 53], title: "Der Einsatz auf dem Handy", text: "Das Team sieht Zeit, Adresse, Route und Hinweise. Vor Ort tippt es „Ich bin da“, am Ende „Fertig“ – das Büro sieht alles live.", en: ["The job on the phone", "The team sees the time, address, route, and instructions. On arrival they tap “I’m here”, and at the end “Finish” – the office follows everything live."] },
      { img: "touren-ersatz", lang: true, phone: false, box: [3, 39, 97, 71], title: "Krank? Ein Ersatz für alle Tage", text: "Ist jemand mehrere Tage krank, übernimmt mit einem Klick eine Kollegin alle Einsätze. Regelmäßige Kunden, Fahrten und Druck sind ebenfalls eingebaut.", en: ["Sick? One replacement for all days", "If someone is ill for several days, a colleague can take over all of their jobs with one click. Recurring customers, transport, and printing are built in as well."] },
    ],
  },
  {
    key: "app", title: "Mitarbeiter-App", who: "für das Team", en: ["Staff app", "for the team"],
    steps: [
      { img: "app-plan", phone: true, box: [2, 6, 97, 27], title: "Die nächste Schicht", text: "Jede Person sieht ihre nächste Schicht und den ganzen Monat auf dem Handy. Ohne App-Store.", en: ["The next shift", "Everyone sees their next shift and the whole month on their phone. No app store needed."] },
      { img: "app-antrag", phone: true, box: [3, 17, 95, 68], title: "Urlaub beantragen", text: "Art, von, bis, an die Leitung senden. Nach der Genehmigung steht der Urlaub automatisch im Plan.", en: ["Requesting leave", "Choose the type and dates and send the request to management. Once approved, the leave appears in the schedule automatically."] },
      { img: "app-zeiten", phone: true, box: [2, 5, 62, 16], title: "Das eigene Zeitkonto", text: "Plus- und Minusstunden sind immer aktuell. Jeder Tag lässt sich öffnen und bei Bedarf eine Korrektur beantragen.", en: ["Your own time account", "Overtime and undertime are always up to date. Any day can be opened, and a correction can be requested if necessary."] },
    ],
  },
  {
    key: "stempeln", title: "Stempeln", who: "am Eingang", en: ["Clocking in", "at the entrance"],
    steps: [
      { img: "terminal", phone: false, box: [21, 31, 78, 48], title: "Kommen oder Gehen", text: "Am Tablet im Eingang zuerst die Richtung wählen.", en: ["In or out", "On the tablet at the entrance, first choose the direction."] },
      { img: "terminal-qr", phone: false, box: [32, 56, 68, 100], title: "Handy oder Chip", text: "Dann den QR-Code mit der App scannen oder den Chip an den Leser halten. Auf Wunsch geht es auch nur mit PIN.", en: ["Phone or chip card", "Then scan the QR code with the app or hold the chip card to the reader. A PIN alone can also be used if you prefer."] },
      { img: "app-ok", phone: true, box: [2, 38, 98, 66], title: "Sofort bestätigt", text: "Grün heißt eingestempelt. Die Uhrzeit kommt vom Server, gestempelte Zeiten bleiben unverändert.", en: ["Confirmed instantly", "Green means clocked in. The time comes from the server, and recorded times cannot be altered."] },
    ],
  },
  {
    key: "zettel", title: "Stundenzettel", who: "zum Monatsende", en: ["Timesheets", "at the end of the month"],
    steps: [
      { img: "stundenzettel-start", phone: false, box: [0, 8, 62, 38], title: "Monat wählen, drucken", text: "Für alle oder eine Person. Im Druckfenster als PDF speichern und an die Lohnbuchhaltung schicken.", en: ["Choose the month and print", "For everyone or for one person. Save as a PDF in the print window and send it to payroll."] },
      { img: "stundenzettel", phone: false, box: [0, 6, 100, 16], title: "Alles auf einen Blick", text: "Zeitkonto, Urlaub, Krankheit und Zuschlagsstunden stehen oben auf jeder Seite, darunter jeder Tag des Monats.", en: ["Everything at a glance", "The time account, leave, sickness, and premium hours appear at the top of every page, followed by each day of the month."] },
      { img: "stundenzettel", phone: false, box: [0, 81, 100, 98], title: "Zuschläge mit Lohnart", text: "Nacht-, Sonntags- und Feiertagszuschläge samt Lohnart-Code, so wie die Lohnbuchhaltung sie braucht.", en: ["Premiums with wage codes", "Night, Sunday, and public-holiday premiums, including the wage-type code, exactly as payroll needs them."] },
    ],
  },
];
const UI = {
  de: { chapters: "Kapitel", step: (c, a, b) => `${c}, Schritt ${a} von ${b}`, back: "Zurück", next: "Weiter", pause: "Pause", play: "Abspielen", all: "Alle Schritte" },
  en: { chapters: "Chapters", step: (c, a, b) => `${c}, step ${a} of ${b}`, back: "Back", next: "Next", pause: "Pause", play: "Play", all: "All steps" },
};
const SCL = {
  de: { aria: "Beispielansicht: Schichten, Öffnungstage und Wochenplan einer Arztpraxis", shifts: "Schichten", add: "+ Schicht hinzufügen", open: "Öffnungstage", per: "Personen je Schicht", firm: "Praxis Dr. Muster", tag: "Beispielansicht", names: ["Vormittag", "Nachmittag", "Samstag"], days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] },
  en: { aria: "Sample view: shifts, opening days, and weekly schedule of a medical practice", shifts: "Shifts", add: "+ Add shift", open: "Opening days", per: "People per shift", firm: "Dr. Muster’s practice", tag: "Sample view", names: ["Morning", "Afternoon", "Saturday"], days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
};
// Beispielansicht für den allgemeinen Dienstplaner (Arztpraxis), gezeichnet statt fotografiert.
const SC = {
  shifts: [["Vormittag", "08:00 – 13:00", "#D6EAF8", "#0E5E8C"], ["Nachmittag", "13:30 – 18:30", "#D8F0E0", "#1E6B3E"], ["Samstag", "09:00 – 13:00", "#FBEACB", "#8A5A00"]],
  days: [["Mo", 1], ["Di", 1], ["Mi", 1], ["Do", 1], ["Fr", 1], ["Sa", 1], ["So", 0]],
  staff: [["Lena", "V V N V - S"], ["Murat", "N N V - V -"], ["Sofia", "V - V N N -"], ["Jonas", "- V N V V S"]],
};
function SceneAllgemein({ lang }) {
  const W = SCL[lang];
  const chip = (k) => (k === "V" ? SC.shifts[0] : k === "N" ? SC.shifts[1] : k === "S" ? SC.shifts[2] : null);
  return (
    <div className="dt-scene" role="img" aria-label={W.aria}>
      <div className="dt-sc-col" style={{ left: "3%", top: "4%", width: "44%" }}>
        <div className="dt-sc-h">{W.shifts}</div>
        {SC.shifts.map(([n, t, bg, fg], k) => (
          <div key={n} className="dt-sc-row"><i style={{ background: bg, borderColor: fg }} /><span className="dt-sc-in">{W.names[k]}</span><span className="dt-sc-in dt-sc-t">{t}</span></div>
        ))}
        <div className="dt-sc-add">{W.add}</div>
      </div>
      <div className="dt-sc-col" style={{ left: "53%", top: "4%", width: "44%" }}>
        <div className="dt-sc-h">{W.open}</div>
        <div className="dt-sc-days">{SC.days.map(([d, on], k) => <span key={d} className={on ? "dt-on" : "dt-off"}>{W.days[k]}</span>)}</div>
        <div className="dt-sc-h" style={{ marginTop: "1em" }}>{W.per}</div>
        {SC.shifts.map(([n], k) => <div key={n} className="dt-sc-row"><span className="dt-sc-lbl">{W.names[k]}</span><span className="dt-sc-in dt-sc-num">{[3, 2, 1][k]}</span></div>)}
      </div>
      <div className="dt-sc-grid" style={{ left: "3%", top: "52%", width: "94%" }}>
        <span className="dt-sc-gh">{W.firm}</span>{W.days.slice(0, 6).map((d) => <span key={d} className="dt-sc-gh">{d}</span>)}
        {SC.staff.map(([n, row]) => (
          <React.Fragment key={n}>
            <span className="dt-sc-name">{n}</span>
            {row.split(" ").map((k, i) => { const c = chip(k); return <span key={i} className="dt-sc-cell" style={c ? { background: c[2], color: c[3] } : { border: "1px dashed #E1E6EF" }}>{c ? W.names[SC.shifts.indexOf(c)].slice(0, 3) : ""}</span>; })}
          </React.Fragment>
        ))}
      </div>
      <span className="dt-sc-tag">{W.tag}</span>
    </div>
  );
}

const ALL = CHAPTERS.flatMap((c, ci) => c.steps.map((s, si) => ({ ...s, ci, si })));
const STEP_MS = 6500;

const CSS = `
.dt{--navy:#243B6B;--ink:#18233A;--muted:#56617A;--line:#DCE2EC;--now:#E3A72F}
.dt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}
.dt-tab{border:1.5px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:8px 14px;font:inherit;font-size:.95rem;cursor:pointer}
.dt-tab[aria-selected="true"]{background:var(--navy);border-color:var(--navy);color:#fff}
.dt-tab small{opacity:.75;margin-left:6px}
.dt-stage{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:28px;align-items:start}
.dt-shot{background:#E9EEF6;border:1px solid var(--line);border-radius:20px;padding:16px;display:flex;justify-content:center;align-items:center;min-height:420px}
.dt-frame{position:relative;overflow:hidden;border-radius:12px;line-height:0;max-width:100%}
.dt-frame.dt-phone{max-width:300px;border-radius:26px;border:8px solid #1B2433}
.dt-frame img{width:100%;height:auto;display:block;max-height:68vh;object-fit:contain}
.dt-frame img{animation:dt-in .45s ease both}
.dt-hl{position:absolute;border:3px solid var(--now);border-radius:10px;box-shadow:0 0 0 9999px rgba(15,25,45,.42);transition:left .55s cubic-bezier(.3,.7,.2,1),top .55s cubic-bezier(.3,.7,.2,1),width .55s cubic-bezier(.3,.7,.2,1),height .55s cubic-bezier(.3,.7,.2,1);pointer-events:none}
@keyframes dt-in{from{opacity:0}to{opacity:1}}
.dt-frame:has(.dt-scene){width:100%;max-width:820px}
.dt-scene{position:relative;width:100%;aspect-ratio:16/10;background:#fff;container-type:inline-size;line-height:1.25;color:#18233A}
.dt-scene>*{font-size:1.55cqw}
.dt-sc-col,.dt-sc-grid{position:absolute}
.dt-sc-h{font-weight:700;margin-bottom:.6em}
.dt-sc-row{display:flex;align-items:center;gap:.5em;margin-bottom:.4em}
.dt-sc-row i{width:1em;height:1em;border-radius:.25em;border:1.5px solid;flex:none}
.dt-sc-in{border:1px solid #C9D2E2;border-radius:.45em;padding:.25em .5em;flex:1;white-space:nowrap;overflow:hidden}
.dt-sc-t{font-family:ui-monospace,monospace;flex:1.2}
.dt-sc-num{flex:none;width:3em;text-align:center}
.dt-sc-lbl{flex:1}
.dt-sc-add{color:#0E5E8C;font-weight:700;margin-top:.3em}
.dt-sc-days{display:flex;gap:.35em;flex-wrap:wrap}
.dt-sc-days span{border-radius:.45em;padding:.3em .55em;font-weight:700}
.dt-on{background:#243B6B;color:#fff}.dt-off{background:#EEF1F6;color:#8A94A8;text-decoration:line-through}
.dt-sc-grid{display:grid;grid-template-columns:7.5em repeat(6,1fr);gap:.3em;align-items:center}
.dt-sc-gh{font-size:.85em;color:#56617A;text-align:center}.dt-sc-gh:first-child{text-align:left;font-weight:700;color:#18233A}
.dt-sc-name{font-weight:700;font-size:.9em}
.dt-sc-cell{height:2.1em;border-radius:.4em;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8em}
.dt-scene>.dt-sc-tag{position:absolute;right:2%;top:2%;font-size:1.2cqw;color:#8A94A8}
.dt-side h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:1.7rem;letter-spacing:-.025em;line-height:1.15;margin:4px 0 10px;color:var(--ink)}
.dt-side p{margin:0 0 20px;color:#3A465E;font-size:1.06rem;line-height:1.6}
.dt-count{font-size:.92rem;color:var(--muted)}
.dt-ctrl{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dt-btn{border:1.5px solid #AEBBD3;background:#fff;color:var(--ink);border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;cursor:pointer}
.dt-btn:disabled{opacity:.45;cursor:not-allowed}
.dt-btn.dt-primary{background:var(--navy);border-color:var(--navy);color:#fff}
.dt-btn:active:not(:disabled){transform:translateY(1px)}
.dt-bar{height:4px;background:var(--line);border-radius:4px;overflow:hidden;margin:18px 0 6px}
.dt-bar i{display:block;height:100%;background:var(--navy);width:0}
.dt-bar i.dt-run{animation:dt-grow linear forwards}
@keyframes dt-grow{from{width:0}to{width:100%}}
.dt-dots{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.dt-dot{width:10px;height:10px;border-radius:50%;border:0;background:var(--line);padding:0;cursor:pointer}
.dt-dot[aria-current="step"]{background:var(--navy)}
.dt :focus-visible{outline:3px solid var(--now);outline-offset:3px}
@media (prefers-reduced-motion:reduce){.dt-hl{transition:none}.dt-frame img{animation:none}}
@media (max-width:560px){.dt-tabs{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;margin-right:-22px}.dt-tab{white-space:nowrap;flex:none}.dt-tab small{display:none}}
@media (max-width:860px){.dt-stage{grid-template-columns:1fr}.dt-shot{min-height:0;padding:10px}.dt-frame.dt-phone{max-width:240px}}
`;

export default function DemoTour({ lang = "de" }) {
  const U = UI[lang === "en" ? "en" : "de"];
  const en = lang === "en";
  const ct = (c) => (en ? c.en[0] : c.title);
  const cw = (c) => (en ? c.en[1] : c.who);
  const st = (x) => (en ? x.en[0] : x.title);
  const sx = (x) => (en ? x.en[1] : x.text);
  const src = (x) => `/demo/${x.img}${x.lang ? (en ? "-en" : "-de") : ""}.webp`;
  const [idx, setIdx] = useState(() => { try { if (window.location.hash === "#touren") return ALL.findIndex((x) => x.ci === CHAPTERS.findIndex((c) => c.key === "touren")); } catch (e) { /* ignore */ } return 0; });
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const step = ALL[idx];
  const chapter = CHAPTERS[step.ci];

  const go = useCallback((n) => setIdx(Math.max(0, Math.min(ALL.length - 1, n))), []);
  const stop = useCallback(() => setPlaying(false), []);

  // autoplay: next step every STEP_MS; stops at the end
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing) return;
    if (idx >= ALL.length - 1) { timer.current = setTimeout(() => setPlaying(false), STEP_MS); return; }
    timer.current = setTimeout(() => setIdx((i) => i + 1), STEP_MS);
    return () => clearTimeout(timer.current);
  }, [playing, idx]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") { stop(); go(idx + 1); }
      if (e.key === "ArrowLeft") { stop(); go(idx - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, go, stop]);

  // preload the next picture so the film runs smoothly
  useEffect(() => { const n = ALL[idx + 1]; if (n && n.img) { const im = new window.Image(); im.src = src(n); } }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const [l, t, r, b] = step.box;
  const startOf = useMemo(() => CHAPTERS.map((c, ci) => ALL.findIndex((s) => s.ci === ci)), []);

  return (
    <div className="dt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dt-tabs" role="tablist" aria-label={U.chapters}>
        {CHAPTERS.map((c, ci) => (
          <button key={c.key} role="tab" aria-selected={ci === step.ci} className="dt-tab" onClick={() => { stop(); go(startOf[ci]); }}>
            {ct(c)}<small>{cw(c)}</small>
          </button>
        ))}
      </div>
      <div className="dt-stage">
        <div className="dt-shot">
          <div className={`dt-frame${step.phone ? " dt-phone" : ""}`}>
            {step.scene ? <SceneAllgemein lang={en ? "en" : "de"} /> : <img key={src(step)} src={src(step)} alt={`${ct(chapter)}: ${st(step)}`} />}
            <span className="dt-hl" aria-hidden="true" style={{ left: `${l}%`, top: `${t}%`, width: `${r - l}%`, height: `${b - t}%` }} />
          </div>
        </div>
        <div className="dt-side" aria-live="polite">
          <div className="dt-count">{U.step(ct(chapter), step.si + 1, chapter.steps.length)}</div>
          <h2>{st(step)}</h2>
          <p>{sx(step)}</p>
          <div className="dt-ctrl">
            <button className="dt-btn" onClick={() => { stop(); go(idx - 1); }} disabled={idx === 0}>{U.back}</button>
            <button className="dt-btn" onClick={() => { stop(); go(idx + 1); }} disabled={idx === ALL.length - 1}>{U.next}</button>
            <button className="dt-btn dt-primary" onClick={() => { if (playing) stop(); else { if (idx === ALL.length - 1) setIdx(0); setPlaying(true); } }} aria-pressed={playing}>
              {playing ? U.pause : U.play}
            </button>
          </div>
          <div className="dt-bar" aria-hidden="true"><i key={`${idx}-${playing}`} className={playing ? "dt-run" : ""} style={{ animationDuration: `${STEP_MS}ms` }} /></div>
          <div className="dt-dots" aria-label={U.all}>
            {ALL.map((s, k) => (
              <button key={k} className="dt-dot" aria-label={`${ct(CHAPTERS[s.ci])}: ${st(s)}`} aria-current={k === idx ? "step" : undefined} onClick={() => { stop(); go(k); }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
