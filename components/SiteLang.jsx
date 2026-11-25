"use client";

import React, { useEffect } from "react";
import { getLang, setLang, detectLang } from "../lib/i18n";
import { useLang } from "../lib/useLang";

// Öffentliche Seiten (Startseite, Rundgang, Registrierung; 25.11.2026): Sprache DE/EN.
// Gespeicherte Wahl zuerst, sonst die Sprache des Browsers; auf dienstigo.com ohne gespeicherte Wahl Englisch.
// Die Wahl gilt danach auch für /login und das Programm (gleicher Speicher wie dort).
export function useSiteLang() {
  const lang = useLang();
  useEffect(() => {
    let d = detectLang();
    try {
      const stored = window.localStorage.getItem("dg-lang");
      if (!stored && /(^|\.)dienstigo\.com$/i.test(window.location.hostname)) d = "en";
    } catch (e) { /* ignore */ }
    if (d !== getLang()) setLang(d);
  }, []);
  return lang === "en" ? "en" : "de";
}

export function LangSwitch({ lang, style }) {
  return (
    <div role="group" aria-label="Sprache / Language" data-lang-switch style={{ display: "inline-flex", background: "#E3E8F1", borderRadius: 10, padding: 3, gap: 2, ...style }}>
      {[["de", "DE"], ["en", "EN"]].map(([k, l]) => (
        <button key={k} type="button" aria-pressed={lang === k} onClick={() => setLang(k, true)}
          style={{ border: 0, borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: lang === k ? "#fff" : "transparent", color: lang === k ? "#243B6B" : "#56617A", fontFamily: "inherit" }}>{l}</button>
      ))}
    </div>
  );
}
