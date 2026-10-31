import DemoTour from "../../components/DemoTour";
import DemoButton from "../../components/DemoRequest";

// /demo – Rundgang durch Dienstigo mit echten Bildschirmfotos (Klick oder "Abspielen").

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
@media (max-width:560px){.dgd-top .dgd-ghost{display:none}}
`;

export default function DemoPage() {
  return (
    <div className="dgd">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dgd-wrap">
        <header className="dgd-top">
          <a href="/" className="dgd-mark">Dienstigo</a>
          <nav className="dgd-nav" aria-label="Hauptnavigation">
            <a className="dgd-btn dgd-ghost" href="/login">Anmelden</a>
            <DemoButton className="dgd-btn dgd-primary">Demo anfragen</DemoButton>
          </nav>
        </header>
        <main>
          <h1>So funktioniert Dienstigo</h1>
          <p className="dgd-lead">Fünf kurze Kapitel mit Bildern aus dem echten Programm. Klicken Sie sich durch oder drücken Sie „Abspielen“, dann läuft der Rundgang von selbst.</p>
          <DemoTour />
          <div className="dgd-end">
            <DemoButton className="dgd-btn dgd-primary">Persönliche Demo anfragen</DemoButton>
            <a className="dgd-btn dgd-ghost" href="/">Zur Startseite</a>
          </div>
        </main>
      </div>
    </div>
  );
}
