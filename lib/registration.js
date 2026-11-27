import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { sendMail, smtpConfigured } from "./mailer";
import { COUNTRIES } from "./country";

// SERVER ONLY. Zugang aus einer Registrierung (demo_requests, kind = 'registration') anlegen:
// Testfirma (14 Tage) + Inhaber-Konto + Einladung mit vorläufigem Passwort (DE/EN).
// Benutzt von /api/admin (Annehmen) und – seit 27.11.2026 – automatisch von /api/registrierung
// (Wunsch: „wenn jemand ‚Jetzt registrieren‘ schickt, soll das Programm Link und Passwort automatisch senden,
//  wenn er noch keinen bekommen hat“).

export function siteOf(request) {
  const fallback = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.dienstigo.de").replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    if (u.protocol === "https:" && (/(^|\.)dienstigo\.de$/.test(u.hostname) || /^lab-shift-app[a-z0-9-]*\.vercel\.app$/.test(u.hostname))) return u.origin;
  } catch (e) { /* fallback */ }
  return fallback;
}

export const REG_PRODUCTS = ["lab_planner", "generic_planner", "employee_app", "time_tracking", "touren"];

export function newPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ", a = "abcdefghijkmnopqrstuvwxyz", D = "23456789", S = "!#$%&*+-=?";
  const all = A + a + D + S; const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(A), pick(a), pick(D), pick(S)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export async function findUserByEmail(email) {
  // listUsers is paginated; our platform is small, so scan the pages
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function markFirstLogin(userId) {
  try {
    const r = await supabaseAdmin.rpc("flag_first_login", { p_user: userId });
    if (r.error) console.error("flag_first_login:", r.error.message);
  } catch (e) { console.error("flag_first_login failed"); }
}

// Vorschlag aus den Antworten des Formulars (gleich wie im Admin-Dialog)
export function registrationDefaults(d) {
  const x = (d && d.details) || {}, n = Array.isArray(x.needs) ? x.needs : [];
  const products = [
    n.includes("shift") ? (x.industry === "practice" ? "lab_planner" : "generic_planner") : null,
    n.includes("time") ? "time_tracking" : null,
    n.includes("touren") ? "touren" : null,
    n.includes("app") || n.includes("touren") || n.includes("shift") ? "employee_app" : null,
  ].filter(Boolean);
  return {
    products: products.length ? products : ["generic_planner", "employee_app"],
    country: x.country === "AE" ? "AE" : "DE",
    language: d && d.lang === "en" ? "en" : "de",
    industry: ["cleaning", "care", "facility"].includes(x.industry) ? x.industry : "general",
  };
}

// d = Zeile aus demo_requests (id, company, email, details, lang, org_id); doneBy = Admin-ID oder null (automatisch)
export async function openRegistrationAccount({ d, products, country, language, industry, site, doneBy = null }) {
  const email = String(d.email || "").trim().toLowerCase();
  const det = d.details || {};
  const person = `${String(det.firstName || "").trim()} ${String(det.lastName || "").trim()}`.trim().slice(0, 120);
  const base = String(d.company || "").trim().slice(0, 110) || "Firma";
  const all = await supabaseAdmin.from("organizations").select("name");
  const taken = new Set((all.data || []).map((o) => String(o.name).trim().toLowerCase()));
  let name = base, k = 1;
  while (taken.has(name.toLowerCase())) { k += 1; name = `${base} (${k})`; }
  const password = newPassword();
  const cu = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cu.error) { const e = new Error(/already|registered|exists/i.test(cu.error.message) ? "Diese E-Mail hat schon ein Konto." : cu.error.message); e.status = 409; throw e; }
  const user = cu.data.user;
  if (person) { try { await supabaseAdmin.auth.admin.updateUserById(user.id, { user_metadata: { full_name: person } }); } catch (e) { /* only cosmetic */ } }
  const rpc = await supabaseAdmin.rpc("create_organization", { p_name: name, p_owner: user.id, p_products: products });
  if (rpc.error) { await supabaseAdmin.auth.admin.deleteUser(user.id); throw new Error("Firma konnte nicht angelegt werden: " + rpc.error.message); }
  const orgId = rpc.data;
  const until = new Date(Date.now() + 14 * 86400000).toISOString();
  const c = COUNTRIES[country] || COUNTRIES.DE;
  await supabaseAdmin.from("organizations").update({ trial_until: until, country, language, timezone: c.timezone, currency: c.currency }).eq("id", orgId);
  if (products.includes("touren")) {
    const t = await supabaseAdmin.rpc("touren_apply_template", { p_org: orgId, p_industry: industry, p_lang: language });
    if (t.error) console.error("touren_apply_template:", t.error.message);
  }
  await supabaseAdmin.from("demo_requests").update({ org_id: orgId, status: "erledigt", done_at: new Date().toISOString(), done_by: doneBy }).eq("id", d.id);
  await markFirstLogin(user.id);
  let mailSent = false, mailError = null;
  if (smtpConfigured()) {
    const en = language === "en";
    const end = new Date(until).toLocaleDateString(en ? "en-GB" : "de-DE", { timeZone: c.timezone, day: "numeric", month: "long", year: "numeric" });
    const hello = en ? (det.firstName ? `Dear ${String(det.firstName).trim()},` : "Hello,") : (person ? `Guten Tag ${person},` : "Guten Tag,");
    const text = en ? [
      hello, "",
      `Thank you for registering with Dienstigo. Your account for “${name}” is ready, and the free trial runs until ${end}.`, "",
      `Sign in: ${site}/login`, `Email: ${email}`, `Temporary password: ${password}`, "",
      "After you sign in for the first time, you will choose your own password and accept the terms of use for the trial.",
      "Please enter only made-up (fictitious) data during the trial. With “Create sample staff”, you can fill your trial company with fictitious people.", "",
      "Any questions? Simply reply to this email.", "", "Kind regards,", "The Dienstigo team",
    ] : [
      hello, "",
      `vielen Dank für Ihre Registrierung bei Dienstigo. Ihr Zugang für „${name}“ ist eingerichtet. Die kostenlose Testphase läuft bis zum ${end}.`, "",
      `Anmelden: ${site}/login`, `E-Mail: ${email}`, `Vorläufiges Passwort: ${password}`, "",
      "Nach der ersten Anmeldung legen Sie ein eigenes Passwort fest und bestätigen die Nutzungsbedingungen der Testphase.",
      "Bitte geben Sie in der Testphase nur erfundene (fiktive) Daten ein. Mit „Beispiel-Mitarbeiter anlegen“ füllen Sie Ihre Testfirma mit erfundenen Personen.", "",
      "Fragen? Antworten Sie einfach auf diese E-Mail.", "", "Viele Grüße", "Ihr Dienstigo-Team",
    ];
    try {
      await sendMail({ to: email, fromName: "Dienstigo", replyTo: process.env.SMTP_USER, subject: en ? "Your Dienstigo account (14-day free trial)" : "Ihr Zugang zu Dienstigo (14 Tage kostenlos)", text: text.join("\n") });
      mailSent = true;
    } catch (e) { mailError = e && e.message ? String(e.message).slice(0, 200) : "Fehler"; }
  } else mailError = "SMTP nicht eingerichtet";
  return { orgId, name, email, until, mailSent, mailError, password: mailSent ? null : password };
}

// Wer schon einen Zugang hat (Konto mit dieser E-Mail): freundliche Erinnerung statt eines zweiten Zugangs.
export async function sendAlreadyRegistered({ email, lang, site, firstName }) {
  if (!smtpConfigured()) return false;
  const en = lang === "en";
  const text = en ? [
    firstName ? `Dear ${firstName},` : "Hello,", "",
    "We have received your registration with Dienstigo. You already have an account with this email address, so we have not created a second one.", "",
    `Sign in: ${site}/login`, "If you no longer know your password, click “Forgot password?” on the sign-in page.", "",
    "Any questions? Simply reply to this email.", "", "Kind regards,", "The Dienstigo team",
  ] : [
    firstName ? `Guten Tag ${firstName},` : "Guten Tag,", "",
    "wir haben Ihre Registrierung bei Dienstigo erhalten. Mit dieser E-Mail-Adresse haben Sie bereits einen Zugang – deshalb haben wir keinen zweiten angelegt.", "",
    `Anmelden: ${site}/login`, "Passwort vergessen? Auf der Anmeldeseite „Passwort vergessen?“ anklicken.", "",
    "Fragen? Antworten Sie einfach auf diese E-Mail.", "", "Viele Grüße", "Ihr Dienstigo-Team",
  ];
  try {
    await sendMail({ to: email, fromName: "Dienstigo", replyTo: process.env.SMTP_USER, subject: en ? "Your Dienstigo account" : "Ihr Zugang zu Dienstigo", text: text.join("\n") });
    return true;
  } catch (e) { console.error("already-registered mail failed"); return false; }
}
