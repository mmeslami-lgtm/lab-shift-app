// Funktionen (Feature-Schalter) PRO FIRMA. Nur die Plattform-Verwaltung (/admin) schaltet sie;
// für alle anderen Firmen bleibt alles wie vorher. Neue Sonderwünsche einer Firma kommen hierher:
// 1) Schlüssel + Beschreibung eintragen, 2) im Code mit hasFeature(org, "schluessel") abfragen,
// 3) erst für die Testfirma einschalten und prüfen, dann für den Kunden.
export const FEATURES = {
  terminal_pin_only: "Terminal: „Ohne Handy: mit PIN stempeln“ anzeigen",
};

export const hasFeature = (org, key) => !!(org && Array.isArray(org.features) && org.features.includes(key));
