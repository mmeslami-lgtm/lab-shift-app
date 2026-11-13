import { supabaseAdmin } from "./supabaseAdmin";

// Testphase (Paket 38b, Skript 44): true, wenn die Testphase dieser Firma abgelaufen ist.
// Server-Routen mit service_role umgehen den Datenbank-Schutz (trial_guard), deshalb prüfen sie hier selbst.
// Fehlt die Spalte o. Ä. → false (nie blockieren, nur weil etwas nicht lesbar ist).
export async function trialOver(orgId) {
  try {
    const r = await supabaseAdmin.from("organizations").select("trial_until").eq("id", orgId);
    const t = !r.error && r.data && r.data[0] ? r.data[0].trial_until : null;
    return !!t && new Date(t).getTime() < Date.now();
  } catch (e) { return false; }
}
export const TRIAL_OVER_MSG = "Testphase abgelaufen – nur Ansicht. Bitte wenden Sie sich an info@dienstigo.de.";
