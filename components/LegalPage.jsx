// Shared frame for the legal pages (/impressum, /datenschutz). Static text, no login needed.
import React from "react";

const INK = "#1B2433";
const MUTED = "#5B6578";

export function Section({ title, children }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#243B6B", margin: "0 0 6px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: INK }}>{children}</div>
    </section>
  );
}

// [Platzhalter] are shown highlighted so nothing unfinished goes online unnoticed
export function P({ children }) {
  return <span style={{ background: "#FFF1C2", borderRadius: 4, padding: "0 4px" }}>{children}</span>;
}

export default function LegalPage({ title, updated, children }) {
  return (
    <main style={{ minHeight: "100vh", background: "#E9EEF8", padding: "24px 16px 40px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", background: "#fff", border: "1px solid #CBD8EE", borderRadius: 18, padding: "22px 20px 28px" }}>
        <a href="/" style={{ fontSize: 14, color: "#185FA5", textDecoration: "none" }}>← Zur Startseite</a>
        <h1 style={{ fontSize: 26, fontWeight: 750, color: INK, margin: "12px 0 4px" }}>{title}</h1>
        {updated && <div style={{ fontSize: 13, color: MUTED }}>Stand: {updated}</div>}
        {children}
      </article>
    </main>
  );
}
