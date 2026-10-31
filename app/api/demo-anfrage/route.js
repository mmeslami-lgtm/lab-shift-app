import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendMail, smtpConfigured } from "../../../lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo-Anfrage from the public pages (window „Demo anfragen“). SERVER ONLY.
// 1. checks the form (spam protection: hidden field, at least 3 seconds to fill in, limits per device and overall),
// 2. saves it in demo_requests (only the platform admin sees it in /admin),
// 3. sends one e-mail to info@dienstigo.de through our own SMTP (Reply-To = the visitor, so "Antworten" works).
// If the e-mail fails, the request is still saved and /admin shows "E-Mail nicht gesendet".

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const PHONE = /^[0-9+()/.\- ]{0,40}$/;
const TO = "info@dienstigo.de";
const PER_DEVICE_HOUR = 3, ALL_HOUR = 30;
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function ipHash(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unbekannt";
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "dienstigo").slice(-24); // keyed: the address cannot be guessed back
  return createHash("sha256").update(key + "|" + ip).digest("hex").slice(0, 32);
}

export async function POST(request) {
  if (Number(request.headers.get("content-length") || 0) > 12000) return json({ error: "Anfrage zu groß." }, 413);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage." }, 400); }
  const company = String(b.company || "").trim(), email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim(), message = String(b.message || "").trim();
  const elapsed = Number(b.t || 0);

  // Bots: answer "ok" without saving anything, so they learn nothing.
  if (String(b.website || "") !== "" || !(elapsed >= 3000)) return json({ ok: true });

  if (company.length < 2 || company.length > 200) return json({ error: "Bitte den Firmennamen angeben." }, 400);
  if (!EMAIL.test(email) || email.length > 254) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  if (!PHONE.test(phone)) return json({ error: "Bitte nur Ziffern und + ( ) / - in der Telefonnummer." }, 400);
  if (message.length > 2000) return json({ error: "Die Nachricht ist zu lang (höchstens 2000 Zeichen)." }, 400);
  if (b.consent !== true) return json({ error: "Bitte der Datenschutzerklärung zustimmen." }, 400);

  const hash = ipHash(request);
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  try {
    const [mine, all] = await Promise.all([
      supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since),
      supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    if (mine.error || all.error) throw mine.error || all.error;
    if (mine.count >= PER_DEVICE_HOUR || all.count >= ALL_HOUR) {
      return json({ error: "Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen oder an info@dienstigo.de schreiben." }, 429);
    }
    const ins = await supabaseAdmin.from("demo_requests")
      .insert({ company, email, phone: phone || null, message: message || null, consent: true, ip_hash: hash })
      .select("id, created_at").single();
    if (ins.error) throw ins.error;

    let mailError = null;
    if (!smtpConfigured()) mailError = "SMTP nicht eingerichtet";
    else {
      const when = new Date(ins.data.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
      const text = [
        "Neue Demo-Anfrage über dienstigo.de", "",
        `Firma:    ${company}`, `E-Mail:   ${email}`, `Telefon:  ${phone || "–"}`, `Zeit:     ${when}`, "",
        "Nachricht:", message || "–", "",
        "„Antworten“ schreibt direkt an die anfragende Person.",
        "Alle Anfragen: https://www.dienstigo.de/admin (Demo-Anfragen)",
      ].join("\n");
      try { await sendMail({ to: TO, replyTo: email, subject: `Demo-Anfrage: ${company}`, text }); }
      catch (e) { mailError = String(e && e.message || "Fehler").slice(0, 200); console.error("demo mail:", mailError); }
    }
    await supabaseAdmin.from("demo_requests").update({ mail_sent: !mailError, mail_error: mailError }).eq("id", ins.data.id);
    return json({ ok: true });
  } catch (e) {
    console.error("demo request failed");
    return json({ error: "Das hat leider nicht geklappt. Bitte erneut versuchen oder an info@dienstigo.de schreiben." }, 500);
  }
}
