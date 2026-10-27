"use client";
import { useState } from "react";

const EMAIL = "info@dienstigo.de";
const PHONE = "+49 176 34340216";
const MAILTO = "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Demo Dienstigo");

const navy = "#1B2E57";
const card = { maxWidth: 640, margin: "48px auto", padding: "32px 28px", background: "#fff", border: "1px solid #E1E6EF", borderRadius: 22, fontFamily: "system-ui, sans-serif", color: "#14213D" };
const btn = { display: "inline-block", padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: "1rem", textDecoration: "none", cursor: "pointer", border: "1.5px solid " + navy };
const box = { background: "#F3F5FA", borderRadius: 16, padding: 20, marginBottom: 20 };
const label = { fontSize: ".9rem", color: "#5B6475" };

export default function DemoAnfrage() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      window.prompt("E-Mail-Adresse kopieren:", EMAIL);
    }
  }

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={card}>
        <a href="/" style={{ color: "#5B6475", textDecoration: "none" }}>← Zur Startseite</a>
        <h1 style={{ fontSize: "2rem", margin: "16px 0 8px", color: navy }}>Demo anfragen</h1>
        <p style={{ margin: "0 0 24px", lineHeight: 1.6 }}>
          Schreiben Sie uns eine kurze E-Mail. Wir melden uns und zeigen Ihnen Dienstigo online.
        </p>

        <div style={box}>
          <div style={label}>E-Mail</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0 16px", userSelect: "all", wordBreak: "break-all" }}>{EMAIL}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={copy} style={{ ...btn, background: navy, color: "#fff" }}>
              {copied ? "Kopiert ✓" : "Adresse kopieren"}
            </button>
            <a href={MAILTO} style={{ ...btn, background: "#fff", color: navy }}>E-Mail-Programm öffnen</a>
          </div>
        </div>

        <div style={box}>
          <div style={label}>Telefon</div>
          <a href={"tel:" + PHONE.replace(/\s/g, "")} style={{ fontSize: "1.4rem", fontWeight: 700, color: "#14213D", textDecoration: "none" }}>{PHONE}</a>
        </div>

        <p style={{ margin: 0, fontSize: ".95rem", color: "#5B6475", lineHeight: 1.6 }}>
          Hilfreich in Ihrer Nachricht: Name der Praxis oder des Labors, Anzahl der Mitarbeitenden und ein Wunschtermin.
        </p>
      </div>
    </div>
  );
}
