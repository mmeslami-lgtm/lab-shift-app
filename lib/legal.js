// Rechtstexte der Testphase (Paket 38a). Bei JEDER inhaltlichen Änderung eines Textes die Fassung
// hier erhöhen (z. B. "1.0" -> "1.1"): dann muss der Inhaber beim nächsten Öffnen neu zustimmen,
// und in /admin ist sichtbar, welche Fassung wer wann angenommen hat.
export const LEGAL_STAND = "November 2026";

export const LEGAL_DOCS = [
  { key: "testphase", version: "1.0", label: "Nutzungsbedingungen Testphase", href: "/rechtliches/testphase" },
  { key: "avv", version: "1.0", label: "Auftragsverarbeitungsvertrag (AVV)", href: "/rechtliches/avv" },
  { key: "fiktive_daten", version: "1.0", label: "Ich gebe in der Testphase nur fiktive Testdaten ein.", href: null },
];

export const LEGAL_VERSIONS = Object.fromEntries(LEGAL_DOCS.map((d) => [d.key, d.version]));
export const LEGAL_LABEL = Object.fromEntries(LEGAL_DOCS.map((d) => [d.key, d.label]));

// true, wenn für jeden Text die aktuelle Fassung angenommen ist. rows = legal_acceptances der Firma.
export function legalComplete(rows) {
  return LEGAL_DOCS.every((d) => (rows || []).some((r) => r.doc === d.key && r.version === d.version));
}
