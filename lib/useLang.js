"use client";
// React-Hilfe: Komponente zeichnet sich neu, wenn die Sprache wechselt (Anmeldeseite, Passwort-Leiste).
import { useEffect, useState } from "react";
import { getLang, onLang } from "./i18n";

export function useLang() {
  const [lang, set] = useState(getLang());
  useEffect(() => { set(getLang()); return onLang(set); }, []);
  return lang;
}
