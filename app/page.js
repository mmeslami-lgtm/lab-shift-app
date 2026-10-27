import SignedInRedirect from "../components/SignedInRedirect";
import LoginMenu from "../components/LoginMenu";

// Public start page (dienstigo.de). Visitors see what Dienstigo does; whoever is signed in is sent to their
// own area right away (SignedInRedirect). The Labor planner lives at /labor, sign-in at /login.
// Schriften: System-Schriften des Geräts (keine Google-Fonts – die brachten den Vercel-Build zum Absturz).

export const metadata = {
  title: { absolute: "Dienstigo – Dienstplan und Zeiterfassung für Praxen, Labore und kleine Teams" },
  description: "Dienstigo plant Schichten fair nach Verträgen, Wünschen und Urlaub, erfasst die Arbeitszeit per Handy oder Chip und liefert am Monatsende die Stundenzettel für die Lohnabrechnung.",
  alternates: { canonical: "/" },
};

const DEMO = "mailto:info@dienstigo.de?subject=Demo%20Dienstigo";
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const TODAY = 2; // Mittwoch is "heute" in the sample week
const KIND = { F: "Früh", S: "Spät", N: "Nacht", U: "Urlaub" };
const PLAN = [
  ["Anna", "F F F - - S S"],
  ["Ben", "S S - F F - -"],
  ["Clara", "N N N - - - -"],
  ["David", "- F S S N N -"],
  ["Emma", "U U U U U - -"],
];

const FEATURES = [
  ["Schichtplan auf Knopfdruck", "Dienstigo verteilt Früh-, Spät- und Nachtdienste gerecht nach Vertragsstunden, achtet auf Wochenenden und Wünsche und rechnet 60 Varianten durch, bevor es Ihnen die beste zeigt."],
  ["Urlaub, ohne nachzutragen", "Mitarbeitende beantragen Urlaub in der App. Sobald Sie genehmigen, steht er im Plan, und an diesen Tagen wird niemand eingeplant."],
  ["Der Plan auf dem Handy", "Jede Person sieht ihre Schichten, wer am Tag mitarbeitet und ihr Zeitkonto. Wünsche und Anträge gehen direkt an die Leitung. Ohne App-Store."],
  ["Stempeln am Eingang", "Ein Tablet am Eingang genügt: Kommen oder Gehen tippen, dann Handy, Chip oder PIN. Gestempelte Zeiten bleiben unverändert, Korrekturen nur mit Begründung."],
  ["Fertig für die Lohnabrechnung", "Ein Klick, und für jede Person liegt ein Stundenzettel bereit: Netto- und Sollzeit, Zeitkonto, Urlaub, Krankheit sowie Nacht-, Sonntags- und Feiertagsstunden."],
  ["Ihre Daten bleiben in Deutschland", "Die Datenbank steht in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt, und jede Person sieht nur, was sie sehen darf."],
];

const STEPS = [
  ["Planen", "Monat wählen, genehmigter Urlaub ist schon eingetragen, Dienstplan erstellen."],
  ["Veröffentlichen", "Alle sehen ihren Plan sofort in der App."],
  ["Stempeln", "Kommen und Gehen am Tablet, Erinnerung bei vergessenen Zeiten."],
  ["Abschließen", "Stundenzettel drucken oder als PDF an die Lohnbuchhaltung schicken."],
];

const CSS = `
.dg{--dg-display:"Avenir Next","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;--dg-body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--paper:#F3F5F9;--ink:#18233A;--navy:#243B6B;--muted:#56617A;--line:#DCE2EC;--f:#D6EAF8;--f-t:#0E5E8C;--s:#D8F0E0;--s-t:#1E6B3E;--n:#24345A;--n-t:#E9EEF8;--u:#ECE3FA;--u-t:#5B3A99;--now:#E3A72F;
  background:var(--paper);color:var(--ink);font-family:var(--dg-body),system-ui,sans-serif;font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.dg *{box-sizing:border-box}
.dg a{color:inherit}
.dg :focus-visible{outline:3px solid var(--now);outline-offset:3px;border-radius:6px}
.dg-wrap{max-width:1120px;margin:0 auto;padding:0 22px}
.dg-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
.dg-mark{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:1.6rem;letter-spacing:-.03em;color:var(--navy);text-decoration:none}
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
`;

export default function StartPage() {
  let i = 0;
  return (
    <div className="dg">
      <SignedInRedirect />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dg-wrap">
        <header className="dg-top">
          <a href="/" className="dg-mark" aria-label="Dienstigo Startseite">Dienstigo</a>
          <nav className="dg-nav" aria-label="Hauptnavigation">
            <a className="dg-l" href="#funktionen">Funktionen</a>
            <a className="dg-l" href="/demo">Rundgang</a>
            <LoginMenu />
            <a className="dg-btn dg-primary" href={DEMO}>Demo anfragen</a>
          </nav>
        </header>

        <main>
          <section className="dg-hero">
            <div>
              <h1 className="dg-h1">Der Dienstplan steht. In fünf Minuten.</h1>
              <p className="dg-lead">
                Dienstigo plant Schichten fair nach Verträgen, Wünschen und Urlaub, erfasst die Arbeitszeit per Handy
                oder Chip und liefert am Monatsende die Stundenzettel für die Lohnabrechnung. Für Praxen, Labore und kleine Teams.
              </p>
              <div className="dg-cta">
                <a className="dg-btn dg-primary" href={DEMO}>Demo anfragen</a>
                <LoginMenu align="left" />
              </div>
              <p className="dg-note"><a href="/demo" style={{ color: "#243B6B", fontWeight: 700 }}>Rundgang ansehen</a>, Schritt für Schritt oder als Film.</p>
              <p className="dg-note" style={{ marginTop: 6 }}>Datenbank in Frankfurt am Main. Die Daten jeder Firma sind strikt getrennt.</p>
            </div>

            <figure className="dg-plan" aria-label="Beispiel: Wochenplan mit fünf Mitarbeitenden" style={{ margin: 0 }}>
              <div className="dg-plan-head">
                <span className="dg-plan-title">Dienstplan</span>
                <span className="dg-plan-sub">Beispielwoche</span>
              </div>
              <div className="dg-grid" role="table">
                <span role="columnheader" />
                {DAYS.map((d, k) => <span key={d} role="columnheader" className={`dg-day${k === TODAY ? " dg-today" : ""}`}>{k === TODAY ? "Heute" : d}</span>)}
                {PLAN.map(([name, row]) => (
                  <div key={name} role="row" style={{ display: "contents" }}>
                    <span role="rowheader" className="dg-name">{name}</span>
                    {row.split(" ").map((c, k) => {
                      const n = i++;
                      return c === "-"
                        ? <span key={k} role="cell" aria-label="frei" className={`dg-cell dg-free${k === TODAY ? " dg-col-today" : ""}`} style={{ "--i": n }} />
                        : <span key={k} role="cell" title={KIND[c]} aria-label={KIND[c]} className={`dg-cell dg-${c}${k === TODAY ? " dg-col-today" : ""}`} style={{ "--i": n }}>{c}</span>;
                    })}
                  </div>
                ))}
              </div>
              <div className="dg-legend" aria-hidden="true">
                <span><i className="dg-F" />Früh</span><span><i className="dg-S" />Spät</span><span><i className="dg-N" />Nacht</span><span><i className="dg-U" />Urlaub</span>
              </div>
              <div className="dg-stamp" aria-label="Anna ist um 5:56 Uhr eingestempelt">
                <span className="dg-dot" />
                <span><b>Anna</b> eingestempelt, 05:56 Uhr</span>
              </div>
            </figure>
          </section>

          <section id="funktionen" className="dg-sec">
            <h2 className="dg-h2">Was Dienstigo Ihnen abnimmt</h2>
            <div className="dg-feats">
              {FEATURES.map(([t, p]) => (
                <div key={t} className="dg-feat"><h3>{t}</h3><p>{p}</p></div>
              ))}
            </div>
          </section>

          <section id="ablauf" className="dg-sec">
            <h2 className="dg-h2">So läuft ein Monat mit Dienstigo</h2>
            <ol className="dg-steps">
              {STEPS.map(([t, p]) => <li key={t} className="dg-step"><h3>{t}</h3><p>{p}</p></li>)}
            </ol>
          </section>

          <section className="dg-sec">
            <div className="dg-who">
              <div>
                <h2 className="dg-h2" style={{ marginBottom: 20 }}>Gemacht für Teams mit Schichten</h2>
                <p><strong>Arztpraxen</strong> planen Sprechstunden, Teilzeit und Minijobs und erfassen die Arbeitszeit, ohne Papierlisten.</p>
                <p><strong>Labore</strong> besetzen Früh-, Spät- und Nachtdienste rund um die Uhr, auch an Wochenenden und Feiertagen.</p>
                <p><strong>Kleine Betriebe</strong> legen eigene Schichten und Öffnungstage fest und behalten Urlaub und Zeitkonten im Blick.</p>
              </div>
              <div className="dg-origin">
                <p>Entstanden im Schichtdienst, nicht im Konferenzraum.</p>
                <p>Dienstigo wurde von jemandem entwickelt, der selbst im Labor Schichten arbeitet. Jede Funktion löst ein Problem, das im Alltag wirklich vorkommt.</p>
              </div>
            </div>
          </section>

          <section className="dg-end" aria-label="Kontakt">
            <div>
              <h2>Sehen Sie es sich an</h2>
              <p>Wir zeigen Ihnen Dienstigo in 20 Minuten, mit den Schichten Ihres eigenen Betriebs. Schreiben Sie an <a className="dg-mail" href={DEMO}>info@dienstigo.de</a>.</p>
            </div>
            <div className="dg-cta"><a className="dg-btn dg-primary" href={DEMO}>Demo anfragen</a><a className="dg-btn dg-ghost" href="/demo">Rundgang ansehen</a></div>
          </section>
        </main>
      </div>
    </div>
  );
}
