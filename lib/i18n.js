// Einfaches Wörterbuch für zweisprachige Texte (Paket D1 = Grundlage; die Seiten werden in D2 umgestellt).
// Benutzung:  import { t } from "../lib/i18n";   t(ctx.language, "common.save")
// Fehlt ein englischer Text, kommt der deutsche; fehlt der Schlüssel ganz, kommt der Schlüssel selbst.
// Platzhalter: t("en", "trial.daysLeft", { n: 3 }) -> "{n}" wird ersetzt.

const DICT = {
  de: {
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.close": "Schließen",
    "common.loading": "Lädt …",
    "common.error": "Fehler",
    "common.logout": "Abmelden",
    "common.yes": "Ja",
    "common.no": "Nein",
    "trial.daysLeft": "Testphase: noch {n} Tage",
    "holiday": "Feiertag",
  },
  en: {
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.loading": "Loading …",
    "common.error": "Error",
    "common.logout": "Log out",
    "common.yes": "Yes",
    "common.no": "No",
    "trial.daysLeft": "Trial: {n} days left",
    "holiday": "Public holiday",
  },
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

// Locale für Datum/Zahl: Deutsch -> de-DE, Englisch -> en-GB (Tag.Monat-Reihenfolge, in Dubai üblich)
export const localeOf = (lang) => (lang === "en" ? "en-GB" : "de-DE");
