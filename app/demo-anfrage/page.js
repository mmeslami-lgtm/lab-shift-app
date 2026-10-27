"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const navy = "#1B2E57";
const card = { maxWidth: 560, margin: "48px auto", padding: "32px 28px", background: "#fff", border: "1px solid #E1E6EF", borderRadius: 22, fontFamily: "system-ui, sans-serif", color: "#14213D" };
const lbl = { display: "block", fontWeight: 600, margin: "0 0 6px" };
const inp = { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "1rem", border: "1.5px solid #D5DBE6", borderRadius: 12, margin: "0 0 18px", fontFamily: "inherit", background: "#fff", color: "#14213D" };
const muted = { color: "#5B6475", fontWeight: 400 };
const linkBtn = { display: "inline-block", padding: "12px 20px", borderRadius: 12, fontWeight: 700, textDecoration: "none", border: "1.5px solid " + navy };

export default function DemoAnfrage() {
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState(""); // Spam-Schutz: Menschen sehen dieses Feld nicht
  const [state, setState] = useState("idle"); // idle | sending | done | error

  async function send(e) {
    e.preventDefault();
    if (trap) { setState("done"); return; }
    if (!supabase) { setState("error"); return; }
    setState("sending");
    const { error } = await supabase.from("demo_requests").insert({
      company: company.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      consent: true,
    });
    setState(error ? "error" : "done");
  }

  if (state === "done") {
    return (
      <div style={{ padding: "0 16px" }}>
        <div style={card}>
          <h1 style={{ fontSize: "2rem", margin: "0 0 8px", color: navy }}>Vielen Dank!</h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.6 }}>
            Ihre Anfrage ist bei uns angekommen. Wir melden uns in Kürze per E-Mail.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href="/demo" style={{ ...linkBtn, background: navy, color: "#fff" }}>Rundgang ansehen</a>
            <a href="/" style={{ ...linkBtn, background: "#fff", color: navy }}>Zur Startseite</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <a href="/" style={{ ...muted, textDecoration: "none" }}>← Zur Startseite</a>
        <h1 style={{ fontSize: "2rem", margin: "16px 0 8px", color: navy }}>Demo anfragen</h1>
        <p style={{ margin: "0 0 24px", lineHeight: 1.6 }}>
          Hinterlassen Sie uns Ihre Kontaktdaten. Wir melden uns und zeigen Ihnen Dienstigo online.
        </p>

        <form onSubmit={send}>
          <label style={lbl} htmlFor="company">Firma / Praxis / Labor *</label>
          <input id="company" required minLength={2} maxLength={200} autoComplete="organization"
            value={company} onChange={(e) => setCompany(e.target.value)} style={inp} />

          <label style={lbl} htmlFor="email">Geschäftliche E-Mail *</label>
          <input id="email" type="email" required maxLength={254} autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />

          <label style={lbl} htmlFor="phone">Telefon <span style={muted}>(optional)</span></label>
          <input id="phone" type="tel" maxLength={40} autoComplete="tel"
            value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} />

          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={trap} onChange={(e) => setTrap(e.target.value)}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0 22px", lineHeight: 1.5 }}>
            <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flex: "0 0 auto" }} />
            <span>
              Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Demo-Anfrage gespeichert werden.
              Details in der <a href="/datenschutz" style={{ color: navy, fontWeight: 600 }}>Datenschutzerklärung</a>. *
            </span>
          </label>

          {state === "error" && (
            <p style={{ background: "#FDECEC", color: "#8A1C1C", padding: "10px 14px", borderRadius: 10, margin: "0 0 16px" }}>
              Das hat leider nicht geklappt. Bitte versuchen Sie es erneut oder schreiben Sie an info@dienstigo.de.
            </p>
          )}

          <button type="submit" disabled={state === "sending"}
            style={{ width: "100%", padding: 14, fontSize: "1.05rem", fontWeight: 700, color: "#fff", background: navy, border: 0, borderRadius: 12, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}>
            {state === "sending" ? "Wird gesendet …" : "Demo anfragen"}
          </button>
        </form>
      </div>
    </div>
  );
}
