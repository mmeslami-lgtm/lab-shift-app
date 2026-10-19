"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Rundgang auf /demo: echte Bildschirmfotos (public/demo/*.webp) mit einem hervorgehobenen Bereich und
// kurzem Text. Weiter/Zurück per Klick oder Pfeiltasten, oder "Abspielen": dann läuft der Rundgang wie ein
// Film von selbst durch alle Kapitel. Hervorhebung in Prozent des Bildes: [links, oben, rechts, unten].
const CHAPTERS = [
  {
    key: "plan", title: "Dienstplan Labor", who: "für Labore",
    steps: [
      { img: "personen", phone: false, box: [54, 6, 99, 92], title: "Mitarbeitende anlegen", text: "Name, Wochenstunden und Vollzeit, Teilzeit oder Minijob einmal eintragen. Wer keine Nächte oder Wochenenden arbeitet, bekommt ein Häkchen." },
      { img: "plan", phone: false, box: [14, 7, 92, 100], title: "Dienstplan erstellen", text: "Ein Klick: Dienstigo verteilt alle Schichten des Monats gerecht und zeigt Ihnen die beste von 60 Varianten." },
      { img: "plan", phone: false, box: [75, 0, 91, 100], title: "Jede Schicht im Blick", text: "Früh, Mittel, Büro, Spät und Nacht sind für Labore schon eingerichtet. Ändern geht per Klick in die Zelle." },
      { img: "summe", phone: false, box: [46, 9, 66, 98], title: "Stunden fair verteilt", text: "Ziel und Differenz zeigen, ob jede Person ihre Vertragsstunden erreicht. Am Monatsende geht der Saldo in den nächsten Monat." },
    ],
  },
  {
    key: "allgemein", title: "Dienstplan allgemein", who: "für alle Betriebe",
    steps: [
      { scene: "allgemein", box: [2, 2, 48, 49], title: "Eigene Schichten", text: "Ob Praxis, Café, Pflegedienst oder Laden: Sie legen Ihre Schichten mit Namen und Uhrzeit selbst an, so viele Sie brauchen." },
      { scene: "allgemein", box: [51, 2, 98, 49], title: "Öffnungstage und Besetzung", text: "Sie bestimmen, an welchen Tagen geöffnet ist und wie viele Personen pro Schicht gleichzeitig arbeiten. Teilzeit, Minijobs, Urlaub und Wünsche werden berücksichtigt." },
      { scene: "allgemein", box: [2, 50, 98, 88], title: "Der fertige Plan", text: "Daraus erstellt Dienstigo den Monatsplan, mit allem, was auch das Labor hat: Mitarbeiter-App, Stempeln am Eingang und Stundenzettel." },
    ],
  },
  {
    key: "app", title: "Mitarbeiter-App", who: "für das Team",
    steps: [
      { img: "app-plan", phone: true, box: [2, 6, 97, 27], title: "Die nächste Schicht", text: "Jede Person sieht ihre nächste Schicht und den ganzen Monat auf dem Handy. Ohne App-Store." },
      { img: "app-antrag", phone: true, box: [3, 17, 95, 68], title: "Urlaub beantragen", text: "Art, von, bis, an die Leitung senden. Nach der Genehmigung steht der Urlaub automatisch im Plan." },
      { img: "app-zeiten", phone: true, box: [2, 5, 62, 16], title: "Das eigene Zeitkonto", text: "Plus- und Minusstunden sind immer aktuell. Jeder Tag lässt sich öffnen und bei Bedarf eine Korrektur beantragen." },
    ],
  },
  {
    key: "stempeln", title: "Stempeln", who: "am Eingang",
    steps: [
      { img: "terminal", phone: false, box: [21, 31, 78, 48], title: "Kommen oder Gehen", text: "Am Tablet im Eingang zuerst die Richtung wählen." },
      { img: "terminal-qr", phone: false, box: [32, 56, 68, 100], title: "Handy oder Chip", text: "Dann den QR-Code mit der App scannen oder den Chip an den Leser halten. Auf Wunsch geht es auch nur mit PIN." },
      { img: "app-ok", phone: true, box: [2, 38, 98, 66], title: "Sofort bestätigt", text: "Grün heißt eingestempelt. Die Uhrzeit kommt vom Server, gestempelte Zeiten bleiben unverändert." },
    ],
  },
  {
    key: "zettel", title: "Stundenzettel", who: "zum Monatsende",
    steps: [
      { img: "stundenzettel-start", phone: false, box: [0, 8, 62, 38], title: "Monat wählen, drucken", text: "Für alle oder eine Person. Im Druckfenster als PDF speichern und an die Lohnbuchhaltung schicken." },
      { img: "stundenzettel", phone: false, box: [0, 6, 100, 16], title: "Alles auf einen Blick", text: "Zeitkonto, Urlaub, Krankheit und Zuschlagsstunden stehen oben auf jeder Seite, darunter jeder Tag des Monats." },
      { img: "stundenzettel", phone: false, box: [0, 81, 100, 98], title: "Zuschläge mit Lohnart", text: "Nacht-, Sonntags- und Feiertagszuschläge samt Lohnart-Code, so wie die Lohnbuchhaltung sie braucht." },
    ],
  },
];
// Beispielansicht für den allgemeinen Dienstplaner (Arztpraxis), gezeichnet statt fotografiert.
const SC = {
  shifts: [["Vormittag", "08:00 – 13:00", "#D6EAF8", "#0E5E8C"], ["Nachmittag", "13:30 – 18:30", "#D8F0E0", "#1E6B3E"], ["Samstag", "09:00 – 13:00", "#FBEACB", "#8A5A00"]],
  days: [["Mo", 1], ["Di", 1], ["Mi", 1], ["Do", 1], ["Fr", 1], ["Sa", 1], ["So", 0]],
  staff: [["Lena", "V V N V - S"], ["Murat", "N N V - V -"], ["Sofia", "V - V N N -"], ["Jonas", "- V N V V S"]],
};
function SceneAllgemein() {
  const chip = (k) => (k === "V" ? SC.shifts[0] : k === "N" ? SC.shifts[1] : k === "S" ? SC.shifts[2] : null);
  return (
    <div className="dt-scene" role="img" aria-label="Beispielansicht: Schichten, Öffnungstage und Wochenplan einer Arztpraxis">
      <div className="dt-sc-col" style={{ left: "3%", top: "4%", width: "44%" }}>
        <div className="dt-sc-h">Schichten</div>
        {SC.shifts.map(([n, t, bg, fg]) => (
          <div key={n} className="dt-sc-row"><i style={{ background: bg, borderColor: fg }} /><span className="dt-sc-in">{n}</span><span className="dt-sc-in dt-sc-t">{t}</span></div>
        ))}
        <div className="dt-sc-add">+ Schicht hinzufügen</div>
      </div>
      <div className="dt-sc-col" style={{ left: "53%", top: "4%", width: "44%" }}>
        <div className="dt-sc-h">Öffnungstage</div>
        <div className="dt-sc-days">{SC.days.map(([d, on]) => <span key={d} className={on ? "dt-on" : "dt-off"}>{d}</span>)}</div>
        <div className="dt-sc-h" style={{ marginTop: "1em" }}>Personen je Schicht</div>
        {SC.shifts.map(([n], k) => <div key={n} className="dt-sc-row"><span className="dt-sc-lbl">{n}</span><span className="dt-sc-in dt-sc-num">{[3, 2, 1][k]}</span></div>)}
      </div>
      <div className="dt-sc-grid" style={{ left: "3%", top: "52%", width: "94%" }}>
        <span className="dt-sc-gh">Praxis Dr. Muster</span>{["Mo", "Di", "Mi", "Do", "Fr", "Sa"].map((d) => <span key={d} className="dt-sc-gh">{d}</span>)}
        {SC.staff.map(([n, row]) => (
          <React.Fragment key={n}>
            <span className="dt-sc-name">{n}</span>
            {row.split(" ").map((k, i) => { const c = chip(k); return <span key={i} className="dt-sc-cell" style={c ? { background: c[2], color: c[3] } : { border: "1px dashed #E1E6EF" }}>{c ? c[0].slice(0, 3) : ""}</span>; })}
          </React.Fragment>
        ))}
      </div>
      <span className="dt-sc-tag">Beispielansicht</span>
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

export default function DemoTour() {
  const [idx, setIdx] = useState(0);
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
  useEffect(() => { const n = ALL[idx + 1]; if (n && n.img) { const im = new window.Image(); im.src = `/demo/${n.img}.webp`; } }, [idx]);

  const [l, t, r, b] = step.box;
  const startOf = useMemo(() => CHAPTERS.map((c, ci) => ALL.findIndex((s) => s.ci === ci)), []);

  return (
    <div className="dt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dt-tabs" role="tablist" aria-label="Kapitel">
        {CHAPTERS.map((c, ci) => (
          <button key={c.key} role="tab" aria-selected={ci === step.ci} className="dt-tab" onClick={() => { stop(); go(startOf[ci]); }}>
            {c.title}<small>{c.who}</small>
          </button>
        ))}
      </div>
      <div className="dt-stage">
        <div className="dt-shot">
          <div className={`dt-frame${step.phone ? " dt-phone" : ""}`}>
            {step.scene ? <SceneAllgemein /> : <img key={step.img} src={`/demo/${step.img}.webp`} alt={`${chapter.title}: ${step.title}`} />}
            <span className="dt-hl" aria-hidden="true" style={{ left: `${l}%`, top: `${t}%`, width: `${r - l}%`, height: `${b - t}%` }} />
          </div>
        </div>
        <div className="dt-side" aria-live="polite">
          <div className="dt-count">{chapter.title}, Schritt {step.si + 1} von {chapter.steps.length}</div>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          <div className="dt-ctrl">
            <button className="dt-btn" onClick={() => { stop(); go(idx - 1); }} disabled={idx === 0}>Zurück</button>
            <button className="dt-btn" onClick={() => { stop(); go(idx + 1); }} disabled={idx === ALL.length - 1}>Weiter</button>
            <button className="dt-btn dt-primary" onClick={() => { if (playing) stop(); else { if (idx === ALL.length - 1) setIdx(0); setPlaying(true); } }} aria-pressed={playing}>
              {playing ? "Pause" : "Abspielen"}
            </button>
          </div>
          <div className="dt-bar" aria-hidden="true"><i key={`${idx}-${playing}`} className={playing ? "dt-run" : ""} style={{ animationDuration: `${STEP_MS}ms` }} /></div>
          <div className="dt-dots" aria-label="Alle Schritte">
            {ALL.map((s, k) => (
              <button key={k} className="dt-dot" aria-label={`${CHAPTERS[s.ci].title}: ${s.title}`} aria-current={k === idx ? "step" : undefined} onClick={() => { stop(); go(k); }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
