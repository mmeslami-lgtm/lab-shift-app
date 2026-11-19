// Zweisprachige Texte (Paket D1 = Grundlage, D2 = Seiten auf Englisch).
//
// Grundidee: Der deutsche Text bleibt im Code stehen und ist gleichzeitig der Schlüssel.
//   tx("Speichern")                      -> "Speichern" (Deutsch) bzw. "Save" (Englisch)
//   tx("Noch {0} Tage", n)               -> Platzhalter {0}, {1} … werden ersetzt (auch auf Deutsch)
//   tx(fehler.message)                   -> unbekannte Texte (z. B. Datenbank-Meldungen) kommen unverändert zurück
// Deutsche Firmen sehen deshalb immer genau denselben Text wie vorher.
//
// Welche Sprache gilt?
//   * nach der Anmeldung: Sprache der Firma (ProductGate ruft setLang(org.language, true) auf)
//   * vorher (Anmeldung, Passwort): zuletzt benutzte Sprache auf diesem Gerät, sonst Sprache des Browsers
//     (detectLang); Knopf "DE | EN" auf der Anmeldeseite (setLang(..., true)).
// Server und erster Aufbau im Browser rechnen immer mit Deutsch (keine Hydration-Unterschiede);
// PasswordGate ruft detectLang() erst nach dem Laden auf.

import { EN, EN_PATTERNS } from "./i18n-en";

let current = "de";
const listeners = new Set();
const STORE = "dg-lang";

export function getLang() { return current; }
export function setLang(lang, remember = false) {
  const l = lang === "en" ? "en" : "de";
  if (remember) { try { window.localStorage.setItem(STORE, l); } catch (e) { /* private mode */ } }
  if (l === current) return;
  current = l;
  listeners.forEach((fn) => { try { fn(l); } catch (e) { /* ignore */ } });
}
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// Nur im Browser aufrufen (nach dem ersten Aufbau)
export function detectLang() {
  try {
    const s = window.localStorage.getItem(STORE);
    if (s === "de" || s === "en") return s;
  } catch (e) { /* ignore */ }
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "de"]);
    return list.some((x) => String(x || "").toLowerCase().startsWith("de")) ? "de" : "en";
  } catch (e) { return "de"; }
}

function fill(s, args) {
  if (!args.length) return s;
  return s.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined || args[i] === null ? "" : String(args[i])));
}
export function tx(de, ...args) {
  if (de === undefined || de === null) return de;
  const key = String(de);
  if (current === "en") {
    const en = EN[key];
    if (en !== undefined) return fill(en, args);
    // Texte mit wechselnden Teilen vom Server/aus der Datenbank: Regex -> englische Vorlage mit $1 …
    for (const [re, rep] of EN_PATTERNS) if (re.test(key)) return key.replace(re, rep);
  }
  return fill(key, args);
}

// Locale für Datum/Zahl: Deutsch -> de-DE, Englisch -> en-GB (Tag vor Monat, in Dubai üblich)
export const localeOf = (lang) => (lang === "en" ? "en-GB" : "de-DE");
export const loc = () => localeOf(current);
// Dezimalzeichen: Deutsch "8,5" / Englisch "8.5" (Zahl schon als Text, z. B. aus toFixed)
export const dec = (txt) => (current === "en" ? String(txt) : String(txt).replace(".", ","));

// Älteres Wörterbuch mit Schlüsseln (D1); bleibt für Kompatibilität
const DICT = {
  de: { "common.save": "Speichern", "common.cancel": "Abbrechen", "common.close": "Schließen", "common.loading": "Lädt …", "common.error": "Fehler", "common.logout": "Abmelden", "common.yes": "Ja", "common.no": "Nein", "trial.daysLeft": "Testphase: noch {n} Tage", "holiday": "Feiertag" },
  en: { "common.save": "Save", "common.cancel": "Cancel", "common.close": "Close", "common.loading": "Loading …", "common.error": "Error", "common.logout": "Log out", "common.yes": "Yes", "common.no": "No", "trial.daysLeft": "Trial: {n} days left", "holiday": "Public holiday" },
};
export const LANGS = Object.keys(DICT);
export function t(lang, key, vars) {
  const l = DICT[lang] ? lang : "de";
  let s = DICT[l][key];
  if (s === undefined) s = DICT.de[key];
  if (s === undefined) s = key;
  if (vars) Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(String(vars[k])); });
  return s;
}

// Monats- und Wochentagsnamen (Deutsch = Schlüssel, Englisch im Wörterbuch)
export const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const WD_LONG_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const WD_SHORT_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const monthName = (m) => tx(MONTHS_DE[m]);
export const monthShort = (m) => (current === "en" ? tx(MONTHS_DE[m]).slice(0, 3) : MONTHS_DE[m].slice(0, 3) + ".");
export const wdLong = (i) => tx(WD_LONG_DE[i]);
export const wdShort = (i) => tx(WD_SHORT_DE[i]);
// Tag + Monat: de "Mo, 3. Nov." / "Montag, 3. November"   en "Mon, 3 Nov" / "Monday, 3 November"
export function dayMonth(d, { weekday = null, month = "long" } = {}) {
  const wd = weekday === "long" ? wdLong(d.getDay()) : weekday === "short" ? wdShort(d.getDay()) : "";
  const mo = month === "short" ? monthShort(d.getMonth()) : monthName(d.getMonth());
  const core = current === "en" ? `${d.getDate()} ${mo}` : `${d.getDate()}. ${mo}`;
  return wd ? `${wd}, ${core}` : core;
}
// Zahlen-Datum: de "03.11.2026" / "03.11."   en "03/11/2026" / "03/11"
const p2 = (n) => String(n).padStart(2, "0");
export const dmy = (d) => (current === "en" ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`);
export const dm = (d) => (current === "en" ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}` : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`);
export const isoDmy = (iso) => dmy(new Date(String(iso).slice(0, 10) + "T12:00:00"));
