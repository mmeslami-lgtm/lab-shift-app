"use client";

import React, { useRef, useState } from "react";
import { useSiteLang, LangSwitch } from "./SiteLang";

// /registrieren (25.11.2026): neue Firma meldet sich an. Der Server (/api/registrierung) speichert die Anfrage;
// ein Zugang entsteht erst, wenn der Plattform-Admin in /admin „Annehmen“ drückt (dann E-Mail mit Passwort).
// Spam-Schutz wie bei „Demo anfragen“: verstecktes Feld + Mindestzeit.

const NAVY = "#243B6B", INK = "#18233A", MUTED = "#5B6578", LINE = "#D5DBE6";
const lbl = { display: "block", fontWeight: 650, fontSize: 15, margin: "0 0 5px", color: INK };
const inp = { display: "block", width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 16, border: `1.5px solid ${LINE}`, borderRadius: 12, margin: "0 0 14px", fontFamily: "inherit", background: "#fff", color: INK };
const opt = { color: MUTED, fontWeight: 400 };

const T = {
  de: {
    title: "Jetzt registrieren", intro: "Erzählen Sie uns kurz von Ihrer Firma. Gleich danach erhalten Sie eine E-Mail mit dem Link und Ihrem Passwort. Die ersten 14 Tage sind kostenlos.",
    first: "Vorname", last: "Nachname", company: "Firmenname", country: "Land", industry: "Branche", size: "Anzahl Mitarbeitende", needs: "Was brauchen Sie?", needsHint: "Mehrere möglich",
    email: "E-Mail", phone: "Mobil / WhatsApp", lang: "Sprache für E-Mails und Programm", source: "Wie haben Sie von uns gehört?", message: "Nachricht", optional: "(optional)", choose: "– bitte wählen –",
    countries: [["DE", "Deutschland"], ["AE", "Vereinigte Arabische Emirate"], ["OTHER", "Anderes Land"]],
    industries: [["cleaning", "Reinigung"], ["care", "Pflege & Betreuung"], ["practice", "Praxis oder Labor"], ["facility", "Hausmeister & Technik"], ["other", "Andere"]],
    sizes: [["1-10", "1–10"], ["11-30", "11–30"], ["31-100", "31–100"], ["100+", "mehr als 100"]],
    needList: [["shift", "Dienstplan", "Schichten planen"], ["time", "Zeiterfassung", "Stempeln, Stundenzettel"], ["touren", "Touren", "Einsätze beim Kunden"], ["app", "Mitarbeiter-App", "Plan und Einsätze auf dem Handy"]],
    langs: [["de", "Deutsch"], ["en", "English"]],
    consent1: "Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Registrierung gespeichert werden. Details in der ", consent2: "Datenschutzerklärung",
    send: "Registrierung senden", sending: "Wird gesendet …", req: "Pflichtfeld",
    errFirst: "Bitte den Vornamen angeben.", errLast: "Bitte den Nachnamen angeben.", errCompany: "Bitte den Firmennamen angeben.", errEmail: "Bitte eine gültige E-Mail-Adresse angeben.", errChoose: "Bitte Land, Branche und Größe auswählen.", errNeeds: "Bitte mindestens einen Bereich auswählen.", errConsent: "Bitte der Datenschutzerklärung zustimmen.",
    fail: "Das hat leider nicht geklappt. Bitte erneut versuchen oder an info@dienstigo.de schreiben.", offline: "Keine Verbindung. Bitte erneut versuchen oder an info@dienstigo.de schreiben.",
    thanks: "Vielen Dank!", thanksP: "Ihre Registrierung ist bei uns angekommen. Sobald Ihr Zugang eingerichtet ist, erhalten Sie eine E-Mail mit Ihrem Passwort.", createdH: "Ihr Zugang ist eingerichtet!", createdP: "Wir haben Ihnen gerade eine E-Mail mit dem Link und Ihrem vorläufigen Passwort geschickt. Bitte sehen Sie auch im Spam-Ordner nach. Die kostenlose Testphase läuft 14 Tage.", existsP: "Mit dieser E-Mail-Adresse gibt es bereits einen Zugang. Wir haben Ihnen eine E-Mail mit dem Link zur Anmeldung geschickt.", toLogin: "Zur Anmeldung", home: "Zur Startseite", login: "Schon registriert? Anmelden",
  },
  en: {
    title: "Register now", intro: "Tell us briefly about your company. Right afterwards, you will receive an email with the link and your password. The first 14 days are free of charge.",
    first: "First name", last: "Last name", company: "Company name", country: "Country", industry: "Industry", size: "Number of employees", needs: "What do you need?", needsHint: "Select all that apply",
    email: "Email", phone: "Mobile / WhatsApp", lang: "Language for emails and the app", source: "How did you hear about us?", message: "Message", optional: "(optional)", choose: "– please select –",
    countries: [["DE", "Germany"], ["AE", "United Arab Emirates"], ["OTHER", "Other country"]],
    industries: [["cleaning", "Cleaning"], ["care", "Care & support"], ["practice", "Practice or laboratory"], ["facility", "Facility & technical services"], ["other", "Other"]],
    sizes: [["1-10", "1–10"], ["11-30", "11–30"], ["31-100", "31–100"], ["100+", "more than 100"]],
    needList: [["shift", "Shift planning", "Plan shifts"], ["time", "Time tracking", "Clocking in, timesheets"], ["touren", "Dispatcher", "Jobs at customers’ premises"], ["app", "Staff app", "Schedule and jobs on the phone"]],
    langs: [["de", "Deutsch"], ["en", "English"]],
    consent1: "I agree that my details may be stored in order to process this registration. Details can be found in the ", consent2: "privacy policy",
    send: "Send registration", sending: "Sending …", req: "Required",
    errFirst: "Please enter your first name.", errLast: "Please enter your last name.", errCompany: "Please enter your company name.", errEmail: "Please enter a valid email address.", errChoose: "Please select your country, industry, and company size.", errNeeds: "Please select at least one area.", errConsent: "Please accept the privacy policy.",
    fail: "Sorry, that did not work. Please try again or write to info@dienstigo.de.", offline: "No connection. Please try again or write to info@dienstigo.de.",
    thanks: "Thank you!", thanksP: "We have received your registration. As soon as your account is set up, you will receive an email with your password.", createdH: "Your account is ready!", createdP: "We have just sent you an email with the link and your temporary password. Please also check your spam folder. The free trial runs for 14 days.", existsP: "There is already an account with this email address. We have sent you an email with the link to sign in.", toLogin: "Go to sign-in", home: "Back to the home page", login: "Already registered? Sign in",
  },
};
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

export default function RegisterForm() {
  const lang = useSiteLang();
  const L = T[lang];
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", country: "", industry: "", size: "", needs: [], email: "", phone: "", lang: "", source: "", message: "", consent: false, website: "" });
  const [state, setState] = useState("idle");
  const [auto, setAuto] = useState("manual");
  const [error, setError] = useState("");
  const opened = useRef(Date.now());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const toggle = (k) => setF({ ...f, needs: f.needs.includes(k) ? f.needs.filter((x) => x !== k) : [...f.needs, k] });

  async function send(e) {
    e.preventDefault();
    setError("");
    if (!f.firstName.trim()) return setError(L.errFirst);
    if (!f.lastName.trim()) return setError(L.errLast);
    if (f.company.trim().length < 2) return setError(L.errCompany);
    if (!f.country || !f.industry || !f.size) return setError(L.errChoose);
    if (!f.needs.length) return setError(L.errNeeds);
    if (!EMAIL.test(f.email.trim())) return setError(L.errEmail);
    if (!f.consent) return setError(L.errConsent);
    setState("sending");
    try {
      const res = await fetch("/api/registrierung", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, lang: f.lang || lang, t: Date.now() - opened.current }) });
      let out = {}; try { out = await res.json(); } catch (x) { /* ignore */ }
      if (res.ok && out.ok) { setAuto(out.auto || "manual"); setState("done"); window.scrollTo(0, 0); return; }
      setError(out.error || L.fail);
    } catch (x) { setError(L.offline); }
    setState("idle");
  }

  const select = (id, k, list) => (
    <select id={id} value={f[k]} onChange={set(k)} style={inp} required>
      <option value="">{L.choose}</option>
      {list.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );

  return (
    <div lang={lang} style={{ background: "#F3F5F9", color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", padding: "28px 16px 48px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <a href="/" style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, color: NAVY, textDecoration: "none" }}>Dienstigo</a>
          <LangSwitch lang={lang} />
        </div>
        <div style={{ background: "#fff", borderRadius: 20, padding: "26px 22px 22px", boxShadow: "0 18px 40px -24px rgba(16,24,40,.35)" }}>
          {state === "done" ? (
            <div data-register="done">
              <h1 style={{ fontSize: 26, fontWeight: 750, letterSpacing: -0.4, margin: "0 0 8px", color: NAVY }}>{auto === "created" ? L.createdH : L.thanks}</h1>
              <p style={{ margin: "0 0 20px", lineHeight: 1.6 }}>{auto === "created" ? L.createdP : auto === "exists" ? L.existsP : L.thanksP}</p>
              {auto !== "manual" ? <a href="/login" style={{ display: "inline-block", borderRadius: 12, background: NAVY, color: "#fff", fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}>{L.toLogin}</a>
                : <a href="/" style={{ display: "inline-block", borderRadius: 12, background: NAVY, color: "#fff", fontWeight: 700, padding: "12px 20px", textDecoration: "none" }}>{L.home}</a>}
            </div>
          ) : (
            <form onSubmit={send} noValidate>
              <h1 style={{ fontSize: 26, fontWeight: 750, letterSpacing: -0.4, margin: "0 0 6px", color: NAVY }}>{L.title}</h1>
              <p style={{ margin: "0 0 20px", color: MUTED, lineHeight: 1.55, fontSize: 15 }}>{L.intro}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                <div><label style={lbl} htmlFor="rg-first">{L.first} *</label><input id="rg-first" required maxLength={80} autoComplete="given-name" value={f.firstName} onChange={set("firstName")} style={inp} /></div>
                <div><label style={lbl} htmlFor="rg-last">{L.last} *</label><input id="rg-last" required maxLength={80} autoComplete="family-name" value={f.lastName} onChange={set("lastName")} style={inp} /></div>
              </div>
              <label style={lbl} htmlFor="rg-company">{L.company} *</label>
              <input id="rg-company" required maxLength={200} autoComplete="organization" value={f.company} onChange={set("company")} style={inp} />
              <label style={lbl} htmlFor="rg-country">{L.country} *</label>
              {select("rg-country", "country", L.countries)}
              <label style={lbl} htmlFor="rg-industry">{L.industry} *</label>
              {select("rg-industry", "industry", L.industries)}
              <label style={lbl} htmlFor="rg-size">{L.size} *</label>
              {select("rg-size", "size", L.sizes)}
              <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <legend style={{ ...lbl, padding: 0 }}>{L.needs} * <span style={opt}>{L.needsHint}</span></legend>
                <div style={{ display: "grid", gap: 8 }}>
                  {L.needList.map(([k, t, s]) => {
                    const on = f.needs.includes(k);
                    return (
                      <label key={k} style={{ display: "flex", gap: 10, alignItems: "center", border: `1.5px solid ${on ? NAVY : LINE}`, background: on ? "#EEF2F8" : "#fff", borderRadius: 12, padding: "10px 12px", cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(k)} style={{ width: 18, height: 18 }} />
                        <span><b style={{ display: "block" }}>{t}</b><span style={{ fontSize: 13, color: MUTED }}>{s}</span></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label style={lbl} htmlFor="rg-email">{L.email} *</label>
              <input id="rg-email" type="email" required maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} style={inp} />
              <label style={lbl} htmlFor="rg-phone">{L.phone} <span style={opt}>{L.optional}</span></label>
              <input id="rg-phone" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set("phone")} style={inp} />
              <label style={lbl} htmlFor="rg-lang">{L.lang} *</label>
              <select id="rg-lang" value={f.lang || lang} onChange={set("lang")} style={inp}>{L.langs.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              <label style={lbl} htmlFor="rg-source">{L.source} <span style={opt}>{L.optional}</span></label>
              <input id="rg-source" maxLength={200} value={f.source} onChange={set("source")} style={inp} />
              <label style={lbl} htmlFor="rg-message">{L.message} <span style={opt}>{L.optional}</span></label>
              <textarea id="rg-message" rows={3} maxLength={2000} value={f.message} onChange={set("message")} style={{ ...inp, resize: "vertical", minHeight: 80 }} />
              <div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="rg-website">Website</label>
                <input id="rg-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "2px 0 16px", lineHeight: 1.5, fontSize: 14 }}>
                <input type="checkbox" checked={f.consent} onChange={set("consent")} style={{ marginTop: 3, width: 18, height: 18, flex: "0 0 auto" }} />
                <span>{L.consent1}<a href="/datenschutz" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 650 }}>{L.consent2}</a>. *</span>
              </label>
              {error && <p role="alert" style={{ background: "#FDECEC", color: "#8A1C1C", padding: "10px 13px", borderRadius: 10, margin: "0 0 14px", fontSize: 14 }}>{error}</p>}
              <button type="submit" disabled={state === "sending"} style={{ width: "100%", padding: 14, fontSize: 16, fontWeight: 700, color: "#fff", background: NAVY, border: 0, borderRadius: 12, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}>
                {state === "sending" ? L.sending : L.send}
              </button>
              <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 14 }}><a href="/login" style={{ color: NAVY, fontWeight: 650 }}>{L.login}</a></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
