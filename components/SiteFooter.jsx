// Small footer on every page: Impressum · Datenschutz. Extra space below so the bottom menu of the
// employee app (fixed at the bottom of the screen) never covers it.
import React from "react";

export default function SiteFooter() {
  const link = { color: "#243B6B", textDecoration: "none", fontWeight: 600 };
  return (
    <footer style={{ textAlign: "center", fontSize: 13, color: "#5B6578", padding: "18px 12px calc(90px + env(safe-area-inset-bottom))", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <a href="/impressum" style={link}>Impressum</a>
      <span aria-hidden="true" style={{ margin: "0 10px" }}>·</span>
      <a href="/datenschutz" style={link}>Datenschutz</a>
      <div style={{ marginTop: 4 }}>Serverstandort der Datenbank: Frankfurt am Main</div>
    </footer>
  );
}
