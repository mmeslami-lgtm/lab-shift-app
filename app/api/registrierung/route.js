import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendMail, smtpConfigured } from "../../../lib/mailer";
import { findUserByEmail, openRegistrationAccount, registrationDefaults, sendAlreadyRegistered, siteOf } from "../../../lib/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registrierung von der Startseite (/registrieren, 25.11.2026). SERVER ONLY.
// Wie /api/demo-anfrage: prüfen (Spam-Schutz), in demo_requests speichern (kind = 'registration', Antworten in details),
// eine E-Mail an info@dienstigo.de.
// 27.11.2026 (Wunsch): der Zugang entsteht AUTOMATISCH (Testfirma 14 Tage, Bereiche/Land/Branche aus den Antworten,
// Einladung mit Link und vorläufigem Passwort) – außer die E-Mail hat schon ein Konto (dann nur eine Erinnerung,
// kein zweiter Zugang). Schutz: höchstens AUTO_DAY automatische Zugänge pro 24 Std.; darüber und bei Fehlern
// bleibt die Registrierung „offen“ und der Admin nimmt sie in /admin an.

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const PHONE = /^[0-9+()/.\- ]{0,40}$/;
const TO = "info@dienstigo.de";
const PER_DEVICE_HOUR = 3, ALL_HOUR = 30, AUTO_DAY = 20;
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function ipHash(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unbekannt";
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "dienstigo").slice(-24); // keyed: the address cannot be guessed back
  return createHash("sha256").update(key + "|" + ip).digest("hex").slice(0, 32);
}

const COUNTRY = ["DE", "AE", "OTHER"];
const INDUSTRY = ["cleaning", "care", "practice", "facility", "other"];
const SIZE = ["1-10", "11-30", "31-100", "100+"];
const NEEDS = ["shift", "time", "touren", "app"];
const MSG = {
  de: { bad: "Ungültige Anfrage.", big: "Anfrage zu groß.", first: "Bitte den Vornamen angeben.", last: "Bitte den Nachnamen angeben.", company: "Bitte den Firmennamen angeben.", email: "Bitte eine gültige E-Mail-Adresse angeben.", phone: "Bitte nur Ziffern und + ( ) / - in der Telefonnummer.", choose: "Bitte Land, Branche und Größe auswählen.", needs: "Bitte mindestens einen Bereich auswählen.", long: "Die Nachricht ist zu lang (höchstens 2000 Zeichen).", consent: "Bitte der Datenschutzerklärung zustimmen.", many: "Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen oder an info@dienstigo.de schreiben.", fail: "Das hat leider nicht geklappt. Bitte erneut versuchen oder an info@dienstigo.de schreiben." },
  en: { bad: "Invalid request.", big: "Request too large.", first: "Please enter your first name.", last: "Please enter your last name.", company: "Please enter your company name.", email: "Please enter a valid email address.", phone: "Please use only digits and + ( ) / - in the phone number.", choose: "Please select your country, industry, and company size.", needs: "Please select at least one area.", long: "The message is too long (maximum 2,000 characters).", consent: "Please accept the privacy policy.", many: "Too many requests in a short time. Please try again later or write to info@dienstigo.de.", fail: "Sorry, that did not work. Please try again or write to info@dienstigo.de." },
};
const clip = (v, n) => String(v || "").trim().slice(0, n);

export async function POST(request) {
  if (Number(request.headers.get("content-length") || 0) > 12000) return json({ error: MSG.de.big }, 413);
  let b; try { b = await request.json(); } catch (e) { return json({ error: MSG.de.bad }, 400); }
  const lang = b.lang === "en" ? "en" : "de"; const M = MSG[lang];
  const firstName = String(b.firstName || "").trim(), lastName = String(b.lastName || "").trim();
  const company = String(b.company || "").trim(), email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim(), message = String(b.message || "").trim();
  const elapsed = Number(b.t || 0);
  if (String(b.website || "") !== "" || !(elapsed >= 3000)) return json({ ok: true }); // Bots

  if (firstName.length < 1 || firstName.length > 80) return json({ error: M.first }, 400);
  if (lastName.length < 1 || lastName.length > 80) return json({ error: M.last }, 400);
  if (company.length < 2 || company.length > 200) return json({ error: M.company }, 400);
  if (!EMAIL.test(email) || email.length > 254) return json({ error: M.email }, 400);
  if (!PHONE.test(phone)) return json({ error: M.phone }, 400);
  if (!COUNTRY.includes(b.country) || !INDUSTRY.includes(b.industry) || !SIZE.includes(b.size)) return json({ error: M.choose }, 400);
  const needs = Array.isArray(b.needs) ? NEEDS.filter((n) => b.needs.includes(n)) : [];
  if (!needs.length) return json({ error: M.needs }, 400);
  if (message.length > 2000) return json({ error: M.long }, 400);
  if (b.consent !== true) return json({ error: M.consent }, 400);
  const details = { firstName, lastName, country: b.country, industry: b.industry, size: b.size, needs, source: clip(b.source, 200) || null };

  const hash = ipHash(request);
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  try {
    const [mine, all] = await Promise.all([
      supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since),
      supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    if (mine.error || all.error) throw mine.error || all.error;
    if (mine.count >= PER_DEVICE_HOUR || all.count >= ALL_HOUR) return json({ error: M.many }, 429);
    const ins = await supabaseAdmin.from("demo_requests")
      .insert({ company, email, phone: phone || null, message: message || null, consent: true, ip_hash: hash, kind: "registration", lang, details })
      .select("id, created_at").single();
    if (ins.error) throw ins.error;

    // Automatisch: Zugang anlegen, wenn diese E-Mail noch keinen hat
    const site = siteOf(request);
    let auto = "manual", autoInfo = "";
    try {
      const prev = await supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true })
        .eq("kind", "registration").eq("email", email).not("org_id", "is", null);
      const has = (prev.count || 0) > 0 || !!(await findUserByEmail(email));
      if (has) {
        auto = "exists";
        const sent = await sendAlreadyRegistered({ email, lang, site, firstName });
        autoInfo = `Diese E-Mail hat schon einen Zugang – kein zweiter angelegt${sent ? ", Erinnerung gesendet" : ""}.`;
        await supabaseAdmin.from("demo_requests").update({ status: "erledigt", done_at: new Date().toISOString(), details: { ...details, auto: "exists" } }).eq("id", ins.data.id);
      } else {
        const day = await supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true })
          .eq("kind", "registration").is("done_by", null).not("org_id", "is", null).gte("done_at", new Date(Date.now() - 86400000).toISOString());
        if ((day.count || 0) >= AUTO_DAY) autoInfo = "Tagesgrenze für automatische Zugänge erreicht – bitte in /admin annehmen.";
        else {
          const d = { id: ins.data.id, company, email, details, lang };
          const def = registrationDefaults(d);
          const out = await openRegistrationAccount({ d, ...def, site, doneBy: null });
          auto = "created";
          autoInfo = `Zugang automatisch angelegt: „${out.name}“ (${def.products.join(", ")}, ${def.country}, ${def.language}). Einladung ${out.mailSent ? "gesendet" : "NICHT gesendet (" + (out.mailError || "Fehler") + ") – bitte in /admin ein neues Passwort setzen"}.`;
          await supabaseAdmin.from("demo_requests").update({ details: { ...details, auto: "created" } }).eq("id", ins.data.id);
          await supabaseAdmin.from("admin_log").insert({ actor: null, actor_email: "auto-registrierung", action: "registration_auto", org_id: out.orgId, target: email, detail: { name: out.name, ...def, until: out.until, request: ins.data.id, mailSent: out.mailSent } });
        }
      }
    } catch (e) {
      auto = "manual";
      autoInfo = "Automatischer Zugang fehlgeschlagen – bitte in /admin annehmen: " + String((e && e.message) || "Fehler").slice(0, 160);
      console.error("registration auto:", autoInfo);
    }

    let mailError = null;
    if (!smtpConfigured()) mailError = "SMTP nicht eingerichtet";
    else {
      const when = new Date(ins.data.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
      const text = [
        "Neue Registrierung über dienstigo.de", "", autoInfo, "",
        `Name:        ${firstName} ${lastName}`, `Firma:       ${company}`, `E-Mail:      ${email}`, `Telefon:     ${phone || "–"}`,
        `Land:        ${details.country}`, `Branche:     ${details.industry}`, `Größe:       ${details.size} Mitarbeitende`,
        `Bereiche:    ${needs.join(", ")}`, `Sprache:     ${lang}`, `Gehört über: ${details.source || "–"}`, `Zeit:        ${when}`, "",
        "Nachricht:", message || "–", "",
        auto === "manual" ? "Annehmen oder ablehnen: https://www.dienstigo.de/admin (Anfragen)" : "Übersicht: https://www.dienstigo.de/admin (Anfragen)",
      ].join("\n");
      try { await sendMail({ to: TO, replyTo: email, subject: `Registrierung${auto === "created" ? " (Zugang angelegt)" : auto === "exists" ? " (hat schon Zugang)" : ""}: ${company}`, text }); }
      catch (e) { mailError = String(e && e.message || "Fehler").slice(0, 200); console.error("registration mail:", mailError); }
    }
    await supabaseAdmin.from("demo_requests").update({ mail_sent: !mailError, mail_error: mailError }).eq("id", ins.data.id);
    return json({ ok: true, auto });
  } catch (e) {
    console.error("registration failed");
    return json({ error: M.fail }, 500);
  }
}
