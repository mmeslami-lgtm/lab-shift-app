// Land & Sprache pro Firma (Paket D1, Skript 45).
// Deutschland ist überall der Standard: fehlt etwas, verhält sich alles wie bisher.

export const COUNTRIES = {
  DE: { label: "Deutschland", timezone: "Europe/Berlin", currency: "EUR", surcharges: true },
  AE: { label: "UAE", timezone: "Asia/Dubai", currency: "AED", surcharges: false },
};
export const LANGUAGES = { de: "Deutsch", en: "English" };

export const DEFAULT_COUNTRY = { country: "DE", language: "de", timezone: "Europe/Berlin", currency: "EUR", holidays: [] };

export const countryOf = (code) => COUNTRIES[code] || COUNTRIES.DE;
// Deutsche Zuschläge (Nacht/Sonntag/Feiertag, Lohnart-Codes) nur in Deutschland
export const surchargesOn = (ctxOrCountry) => countryOf(typeof ctxOrCountry === "string" ? ctxOrCountry : ctxOrCountry && ctxOrCountry.country).surcharges;
// Zeitzone sicher wählen (nur bekannte Werte)
export const tzOf = (tz) => (tz === "Asia/Dubai" ? "Asia/Dubai" : "Europe/Berlin");

// Liest Land/Sprache/Zeitzone/Währung der Firma und – nur für UAE – die eingetragenen Feiertage.
export async function loadCountry(sb, orgId) {
  try {
    const r = await sb.from("organizations").select("country, language, timezone, currency").eq("id", orgId);
    if (r.error || !r.data || !r.data[0]) return { ...DEFAULT_COUNTRY };
    const o = r.data[0];
    const country = COUNTRIES[o.country] ? o.country : "DE";
    const out = { country, language: o.language === "en" ? "en" : "de", timezone: tzOf(o.timezone), currency: o.currency === "AED" ? "AED" : "EUR", holidays: [] };
    if (country !== "DE") {
      const h = await sb.from("country_holidays").select("day, name").eq("country", country).order("day");
      if (!h.error) out.holidays = h.data || [];
    }
    return out;
  } catch (e) {
    return { ...DEFAULT_COUNTRY };
  }
}
