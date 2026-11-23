// Anmeldung mit Handynummer (Touren, 23.11.2026 – v. a. für Dubai: viele Mitarbeitende haben keine E-Mail).
// Supabase braucht eine E-Mail. Für eine Handynummer legen wir intern eine Adresse an, die nie Post bekommt:
//   +971 50 123 4567  →  971501234567@tel.dienstigo.de
// Die Person sieht diese Adresse nie – überall wird die Nummer angezeigt.
import { normPhone } from "./maps";

export const PHONE_DOMAIN = "tel.dienstigo.de";

// Text aus dem Eingabefeld → "+971501234567" oder null (zu kurz / ungültig)
export function cleanPhone(text, country) {
  const d = normPhone(text, country);
  if (!d || !/^\+[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}
export function phoneToEmail(e164) { return `${String(e164).replace(/\D/g, "")}@${PHONE_DOMAIN}`; }
export function isPhoneEmail(email) { return new RegExp(`^\\d{8,15}@${PHONE_DOMAIN.replace(/\./g, "\\.")}$`, "i").test(String(email || "")); }
// Anzeige: Handynummer statt interner Adresse, sonst die E-Mail
export function loginName(email) { return isPhoneEmail(email) ? "+" + String(email).split("@")[0] : email || ""; }
// Ländervorwahl fürs Anmeldefeld: aus der Zeitzone des Geräts (Dubai → AE, sonst DE)
export function guessCountry() {
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; if (/Dubai|Muscat/.test(tz)) return "AE"; } catch (e) { /* egal */ }
  return "DE";
}
