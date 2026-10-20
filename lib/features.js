// Funktionen (Feature-Schalter) PRO FIRMA. Nur die Plattform-Verwaltung (/admin) schaltet sie;
// für alle anderen Firmen bleibt alles wie vorher. Neue Sonderwünsche einer Firma kommen hierher:
// 1) Schlüssel + Beschreibung eintragen, 2) im Code mit hasFeature(org, "schluessel") abfragen,
// 3) erst für die Testfirma einschalten und prüfen, dann für den Kunden.
export const FEATURES = {
  terminal_pin_only: "Terminal: „Ohne Handy: mit PIN stempeln“ anzeigen",
  soll_vertrag: "Zeitkonto: Soll = Vertrag (Mo–Fr Wochenstunden ÷ 5, Feiertage frei) statt Dienstplan",
  mobil_stempeln: "Mobil stempeln: Kommen/Gehen direkt in der Mitarbeiter-App (ohne Terminal, z. B. ambulante Dienste)",
  nur_mobil: "Mobil stempeln: nur Handy (kein Terminal)",
  mobil_standort: "Mobil stempeln: Standort NUR im Moment des Stempelns speichern (keine laufende Ortung)",
};

export const hasFeature = (org, key) => !!(org && Array.isArray(org.features) && org.features.includes(key));
