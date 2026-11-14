import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendMail, smtpConfigured } from "../../../lib/mailer";

// Paket 38b: Testfirmen, deren Testphase seit 30 Tagen vorbei ist → EINE Erinnerungs-E-Mail an info@
// (Absender-Postfach). Gelöscht wird nie automatisch, nur mit „Testfirma löschen“ in /admin.
async function trialReminders() {
  if (!smtpConfigured()) return 0;
  const limit = new Date(Date.now() - 30 * 86400000).toISOString();
  const r = await supabaseAdmin.from("organizations").select("id, name, trial_until").lt("trial_until", limit).is("trial_reminder_sent_at", null);
  if (r.error || !r.data || r.data.length === 0) return 0; // script 44 missing = nothing to do
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.dienstigo.de").replace(/\/$/, "");
  const lines = r.data.map((o) => `- ${o.name} (Testphase abgelaufen am ${new Date(o.trial_until).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})`);
  await sendMail({ to: process.env.SMTP_USER, fromName: "Dienstigo", subject: `Dienstigo – ${r.data.length} Testfirma/en seit 30 Tagen abgelaufen`, text: [
    "Hallo,",
    "",
    "diese Testfirmen sind seit mehr als 30 Tagen abgelaufen und haben keinen Vertrag:",
    ...lines,
    "",
    `Bitte in ${site}/admin entscheiden: „Testfirma löschen“, „+14 Tage verlängern“ oder „Dauerhaft freischalten“.`,
    "Es wird nichts automatisch gelöscht. Diese Erinnerung kommt für jede Firma nur einmal.",
    "",
    "Dienstigo",
  ].join("\n") });
  await supabaseAdmin.from("organizations").update({ trial_reminder_sent_at: new Date().toISOString() }).in("id", r.data.map((o) => o.id));
  return r.data.length;
}

// Daily "keep-alive" (Vercel Cron, see vercel.json): one tiny read so the free Supabase project is never
// paused for inactivity. Reads only a count – no data is returned or changed.
// Protection: when the env var CRON_SECRET is set in Vercel, Vercel sends it automatically and anyone
// else gets 401. Without CRON_SECRET the route still only answers "ok".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server nicht eingerichtet" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const { error } = await supabaseAdmin.from("organizations").select("id", { count: "exact", head: true });
  let reminded = 0;
  try { reminded = await trialReminders(); } catch (e) { console.error("trial reminder failed"); } // never breaks the keep-alive
  return new Response(JSON.stringify({ ok: !error, at: new Date().toISOString(), reminded }), { status: error ? 500 : 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
