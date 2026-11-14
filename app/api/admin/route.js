import { randomInt } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { FEATURES } from "../../../lib/features";
import { sendMail, smtpConfigured } from "../../../lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Platform administration (the /admin page). SERVER ONLY: it uses the service_role key.
//
// SECURITY RULES
//  * Every request must carry the logged-in person's access token (Authorization: Bearer ...).
//  * The token is verified with Supabase, and the person must be listed in the table platform_admins.
//    Otherwise: 401 (not logged in) or 403 (not an administrator). The key itself never leaves the server.
//  * Passwords are never stored or logged by this route. A generated password is returned ONCE.
//  * Every login created here, and every password reset here, is marked "first login": the person must choose
//    their own password before using the app (table first_login_flags, see the profile page).
//  * Every action is written to admin_log (who, what, which company).

const PRODUCTS = ["lab_planner", "generic_planner", "employee_app", "time_tracking"];
const ROLES = ["supervisor", "planner", "employee"];
 // never "owner" here; owners are created with a company
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// "2026-01-31" + 1 Monat = "2026-02-28" (Monatsende wird gekappt)
function addCycle(iso, cycle) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = cycle === "jaehrlich" ? 12 : 1;
  const ty = y + Math.floor((m - 1 + months) / 12), tm = ((m - 1 + months) % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
const money = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null; };
// Link in der Testzugang-E-Mail: dieselbe Adresse, auf der der Admin gerade arbeitet
// (Produktion → www.dienstigo.de, Test-Branch → die Vercel-Testadresse). Nur bekannte Adressen, sonst dienstigo.de.
function siteOf(request) {
  const fallback = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.dienstigo.de").replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    if (u.protocol === "https:" && (/(^|\.)dienstigo\.de$/.test(u.hostname) || /^lab-shift-app[a-z0-9-]*\.vercel\.app$/.test(u.hostname))) return u.origin;
  } catch (e) { /* fallback */ }
  return fallback;
}
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function newPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ", a = "abcdefghijkmnopqrstuvwxyz", D = "23456789", S = "!#$%&*+-=?";
  const all = A + a + D + S; const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(A), pick(a), pick(D), pick(S)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

async function authorize(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: json({ error: "Nicht angemeldet." }, 401) };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data || !data.user) return { error: json({ error: "Anmeldung ungültig oder abgelaufen." }, 401) };
  const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", data.user.id);
  if (adm.error) return { error: json({ error: "Serverfehler." }, 500) };
  if (!adm.data || adm.data.length === 0) return { error: json({ error: "Kein Zugriff." }, 403) };
  return { user: data.user };
}

async function log(actor, action, orgId, target, detail) {
  await supabaseAdmin.from("admin_log").insert({ actor: actor.id, actor_email: actor.email, action, org_id: orgId || null, target: target || null, detail: detail || null });
}

// The person must choose their own password at the next login. Never blocks the action if this fails
// (for example while the database script is not applied yet); the failure is only written to the server log.
async function markFirstLogin(userId) {
  try {
    const r = await supabaseAdmin.rpc("flag_first_login", { p_user: userId });
    if (r.error) console.error("flag_first_login:", r.error.message);
  } catch (e) { console.error("flag_first_login failed"); }
}

async function findUserByEmail(email) {
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

async function createLogin(email, password) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(/already|registered|exists/i.test(error.message) ? "Diese E-Mail hat schon ein Konto." : error.message);
  return data.user;
}

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  // light check used by the profile page ("is this person a platform admin?")
  if (new URL(request.url).searchParams.get("check")) return json({ ok: true, me: auth.user.email });
  try {
    const feats = await supabaseAdmin.from("org_features").select("org_id, feature, enabled"); // script 19; missing table = none
    const [orgs, prods, mems, staff] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, name, active, created_at, require_approval, retention_years, short_notice_days").order("created_at"),
      supabaseAdmin.from("org_products").select("org_id, product, enabled"),
      supabaseAdmin.from("memberships").select("user_id, org_id, role, staff_id"),
      supabaseAdmin.from("staff").select("id, org_id, name, active"),
    ]);
    for (const r of [orgs, prods, mems, staff]) if (r.error) throw r.error;
    const users = {};
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      data.users.forEach((u) => { users[u.id] = { email: u.email, lastSignIn: u.last_sign_in_at }; });
      if (data.users.length < 200) break;
    }
    const staffName = {}; staff.data.forEach((s) => { staffName[s.id] = s.name; });
    // Testphase + Zustimmungen (script 34). Missing column/table = no test phase, never breaks the page.
    const tr = await supabaseAdmin.from("organizations").select("id, trial_until");
    const la = await supabaseAdmin.from("legal_acceptances").select("org_id, doc, version, accepted_at, user_email").order("accepted_at");
    // Abrechnung von Hand (script 35). Missing tables = keine Angaben.
    const bl = await supabaseAdmin.from("org_billing").select("org_id, amount, cycle, next_due, note");
    const py = await supabaseAdmin.from("org_payments").select("id, org_id, amount, paid_on, for_due, note, created_at").order("created_at", { ascending: false }).limit(2000);
    const trialOf = {}; if (!tr.error) (tr.data || []).forEach((t) => { trialOf[t.id] = t.trial_until; });
    const firms = orgs.data.map((o) => ({
      ...o,
      products: Object.fromEntries(PRODUCTS.map((p) => [p, !!prods.data.find((x) => x.org_id === o.id && x.product === p && x.enabled)])),
      features: Object.fromEntries(Object.keys(FEATURES).map((k) => [k, !feats.error && !!(feats.data || []).find((x) => x.org_id === o.id && x.feature === k && x.enabled)])),
      members: mems.data.filter((m) => m.org_id === o.id).map((m) => ({ userId: m.user_id, email: (users[m.user_id] || {}).email || "?", lastSignIn: (users[m.user_id] || {}).lastSignIn || null, role: m.role, staffId: m.staff_id, staffName: m.staff_id ? staffName[m.staff_id] || null : null })),
      staff: staff.data.filter((s) => s.org_id === o.id && s.active).map((s) => ({ id: s.id, name: s.name, hasLogin: mems.data.some((m) => m.staff_id === s.id) })),
      trialUntil: trialOf[o.id] || null,
      billing: bl.error ? null : ((bl.data || []).find((b) => b.org_id === o.id) || null),
      payments: py.error ? [] : (py.data || []).filter((p) => p.org_id === o.id).slice(0, 6),
      acceptances: la.error ? [] : (la.data || []).filter((a) => a.org_id === o.id).map((a) => ({ doc: a.doc, version: a.version, at: a.accepted_at, email: a.user_email })),
    }));
    // Demo-Anfragen (script 33). Missing columns or table = empty list, never breaks the page.
    let dr = await supabaseAdmin.from("demo_requests").select("id, created_at, company, email, phone, message, status, mail_sent, mail_error, done_at, org_id").order("created_at", { ascending: false }).limit(300);
    if (dr.error) dr = await supabaseAdmin.from("demo_requests").select("id, created_at, company, email, phone, message, status, mail_sent, mail_error, done_at").order("created_at", { ascending: false }).limit(300); // script 44 missing
    return json({ me: auth.user.email, firms, demoRequests: dr.error ? [] : dr.data });
  } catch (e) {
    return json({ error: "Laden fehlgeschlagen." }, 500);
  }
}

export async function POST(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  let body; try { body = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage." }, 400); }
  const me = auth.user;
  try {
    switch (body.action) {
      case "demo_status": {
        const id = String(body.id || ""), done = !!body.done;
        const r = await supabaseAdmin.from("demo_requests").update(done ? { status: "erledigt", done_at: new Date().toISOString(), done_by: me.id } : { status: "neu", done_at: null, done_by: null }).eq("id", id).select("id, company");
        if (r.error) throw r.error;
        if (!r.data || r.data.length === 0) return json({ error: "Anfrage nicht gefunden." }, 404);
        await log(me, done ? "demo_done" : "demo_reopen", null, id, { company: r.data[0].company });
        return json({ ok: true });
      }
      case "demo_delete": {
        const id = String(body.id || "");
        const r = await supabaseAdmin.from("demo_requests").delete().eq("id", id).select("id, company");
        if (r.error) throw r.error;
        if (!r.data || r.data.length === 0) return json({ error: "Anfrage nicht gefunden." }, 404);
        await log(me, "demo_delete", null, id, { company: r.data[0].company });
        return json({ ok: true });
      }
      case "set_trial": {
        // start: test phase of 14 days from now; extend: +14 days (from the end, or from today if already over);
        // off: no test phase any more ("dauerhaft")
        const orgId = String(body.orgId || ""), mode = body.mode;
        if (!["start", "extend", "off"].includes(mode)) return json({ error: "Ungültige Anfrage." }, 400);
        let until = null;
        if (mode === "start") until = new Date(Date.now() + 14 * 86400000).toISOString();
        if (mode === "extend") {
          const cur = await supabaseAdmin.from("organizations").select("trial_until").eq("id", orgId);
          const old = cur.data && cur.data[0] && cur.data[0].trial_until ? new Date(cur.data[0].trial_until).getTime() : null;
          if (!old) return json({ error: "Diese Firma ist nicht in der Testphase." }, 400);
          until = new Date(Math.max(old, Date.now()) + 14 * 86400000).toISOString();
        }
        let r = await supabaseAdmin.from("organizations").update({ trial_until: until, trial_reminder_sent_at: null }).eq("id", orgId).select("id, name");
        if (r.error && /trial_reminder_sent_at/.test(r.error.message)) r = await supabaseAdmin.from("organizations").update({ trial_until: until }).eq("id", orgId).select("id, name"); // script 44 missing
        if (r.error) return json({ error: /trial_until/.test(r.error.message) ? "Bitte zuerst Datenbank-Skript 34 ausführen." : "Speichern fehlgeschlagen." }, 500);
        if (!r.data || r.data.length === 0) return json({ error: "Firma nicht gefunden." }, 404);
        await log(me, mode === "start" ? "trial_start" : mode === "extend" ? "trial_extend" : "trial_off", orgId, null, { until });
        return json({ ok: true });
      }
      case "billing_save": {
        const orgId = String(body.orgId || "");
        const amount = money(body.amount);
        const cycle = body.cycle === "jaehrlich" ? "jaehrlich" : "monatlich";
        const nextDue = body.nextDue ? String(body.nextDue) : null;
        const note = String(body.note || "").trim().slice(0, 300) || null;
        if (amount === null) return json({ error: "Bitte einen gültigen Betrag angeben (0 bis 100000)." }, 400);
        if (nextDue && !DATE.test(nextDue)) return json({ error: "Ungültiges Datum." }, 400);
        const r = await supabaseAdmin.from("org_billing").upsert({ org_id: orgId, amount, cycle, next_due: nextDue, note, updated_at: new Date().toISOString(), updated_by: me.id }).select("org_id");
        if (r.error) return json({ error: /org_billing/.test(r.error.message) ? "Bitte zuerst Datenbank-Skript 35 ausführen." : "Speichern fehlgeschlagen." }, 500);
        await log(me, "billing_save", orgId, null, { amount, cycle, nextDue });
        return json({ ok: true });
      }
      case "billing_paid": {
        // records a payment; if it pays the current due date, the next due date moves on by one cycle
        const orgId = String(body.orgId || "");
        const amount = money(body.amount);
        const paidOn = String(body.paidOn || "");
        if (amount === null) return json({ error: "Bitte einen gültigen Betrag angeben." }, 400);
        if (!DATE.test(paidOn)) return json({ error: "Ungültiges Zahlungsdatum." }, 400);
        const b = await supabaseAdmin.from("org_billing").select("cycle, next_due").eq("org_id", orgId);
        if (b.error) return json({ error: "Bitte zuerst Datenbank-Skript 35 ausführen." }, 500);
        const bill = b.data && b.data[0];
        const forDue = bill && bill.next_due ? bill.next_due : null;
        const ins = await supabaseAdmin.from("org_payments").insert({ org_id: orgId, amount, paid_on: paidOn, for_due: forDue, note: String(body.note || "").trim().slice(0, 300) || null, created_by: me.id }).select("id");
        if (ins.error) return json({ error: "Speichern fehlgeschlagen." }, 500);
        if (forDue) {
          const up = await supabaseAdmin.from("org_billing").update({ next_due: addCycle(forDue, bill.cycle), updated_at: new Date().toISOString(), updated_by: me.id }).eq("org_id", orgId);
          if (up.error) return json({ error: "Zahlung gespeichert, aber nächste Fälligkeit nicht verschoben." }, 500);
        }
        await log(me, "billing_paid", orgId, ins.data[0].id, { amount, paidOn, forDue });
        return json({ ok: true });
      }
      case "billing_payment_delete": {
        // undo a wrong entry; the due date it paid becomes the next due date again
        const id = String(body.id || "");
        const one = await supabaseAdmin.from("org_payments").select("org_id").eq("id", id);
        if (one.error || !one.data || one.data.length === 0) return json({ error: "Zahlung nicht gefunden." }, 404);
        const last = await supabaseAdmin.from("org_payments").select("id").eq("org_id", one.data[0].org_id).order("created_at", { ascending: false }).limit(1);
        if (last.error || !last.data[0] || last.data[0].id !== id) return json({ error: "Nur die zuletzt erfasste Zahlung kann gelöscht werden." }, 400);
        const r = await supabaseAdmin.from("org_payments").delete().eq("id", id).select("id, org_id, amount, for_due");
        if (r.error) return json({ error: "Löschen fehlgeschlagen." }, 500);
        if (!r.data || r.data.length === 0) return json({ error: "Zahlung nicht gefunden." }, 404);
        const p = r.data[0];
        if (p.for_due) await supabaseAdmin.from("org_billing").update({ next_due: p.for_due, updated_at: new Date().toISOString(), updated_by: me.id }).eq("org_id", p.org_id);
        await log(me, "billing_payment_delete", p.org_id, id, { amount: p.amount, forDue: p.for_due });
        return json({ ok: true });
      }
      case "testzugang": {
        // Demo-Anfrage -> Testfirma (14 Tage) + Inhaber-Konto; E-Mail mit vorläufigem Passwort an den Kunden
        const id = String(body.id || "");
        const planner = body.planner === "lab_planner" ? "lab_planner" : "generic_planner";
        const dq = await supabaseAdmin.from("demo_requests").select("id, company, email, org_id").eq("id", id);
        if (dq.error) return json({ error: /org_id/.test(dq.error.message) ? "Bitte zuerst Datenbank-Skript 44 ausführen." : "Anfrage konnte nicht geladen werden." }, 500);
        const d = dq.data && dq.data[0];
        if (!d) return json({ error: "Anfrage nicht gefunden." }, 404);
        if (d.org_id) return json({ error: "Für diese Anfrage gibt es schon einen Testzugang." }, 409);
        const email = String(d.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: "Die E-Mail in der Anfrage ist ungültig." }, 400);
        const base = String(d.company || "").trim().slice(0, 110) || "Testfirma";
        const all = await supabaseAdmin.from("organizations").select("name");
        const taken = new Set((all.data || []).map((o) => String(o.name).trim().toLowerCase()));
        let name = base, k = 1;
        while (taken.has(name.toLowerCase())) { k += 1; name = `${base} (Test ${k})`; }
        const password = newPassword();
        const user = await createLogin(email, password);
        const rpc = await supabaseAdmin.rpc("create_organization", { p_name: name, p_owner: user.id, p_products: [planner, "employee_app", "time_tracking"] });
        if (rpc.error) { await supabaseAdmin.auth.admin.deleteUser(user.id); throw new Error("Firma konnte nicht angelegt werden: " + rpc.error.message); }
        const orgId = rpc.data;
        const until = new Date(Date.now() + 14 * 86400000).toISOString();
        await supabaseAdmin.from("organizations").update({ trial_until: until }).eq("id", orgId);
        await supabaseAdmin.from("demo_requests").update({ org_id: orgId, status: "erledigt", done_at: new Date().toISOString(), done_by: me.id }).eq("id", id);
        await markFirstLogin(user.id);
        let mailSent = false, mailError = null;
        if (smtpConfigured()) {
          const site = siteOf(request);
          const end = new Date(until).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
          try {
            await sendMail({ to: email, fromName: "Dienstigo", replyTo: process.env.SMTP_USER, subject: "Ihr Testzugang zu Dienstigo (14 Tage)", text: [
              "Guten Tag,",
              "",
              `vielen Dank für Ihr Interesse an Dienstigo. Ihr Testzugang für „${name}“ ist eingerichtet und gilt bis zum ${end}.`,
              "",
              `Anmelden: ${site}/login?als=inhaber`,
              `E-Mail: ${email}`,
              `Vorläufiges Passwort: ${password}`,
              "",
              "Nach der ersten Anmeldung legen Sie ein eigenes Passwort fest und bestätigen die Nutzungsbedingungen der Testphase.",
              "Bitte geben Sie in der Testphase nur erfundene (fiktive) Daten ein. Mit „Beispiel-Mitarbeiter anlegen“ füllen Sie Ihre Testfirma mit erfundenen Personen.",
              "",
              "Fragen? Antworten Sie einfach auf diese E-Mail.",
              "",
              "Viele Grüße",
              "Ihr Dienstigo-Team",
            ].join("\n") });
            mailSent = true;
          } catch (e) { mailError = e && e.message ? String(e.message).slice(0, 200) : "Fehler"; }
        } else mailError = "SMTP nicht eingerichtet";
        await log(me, "testzugang", orgId, email, { name, planner, until, demo: id, mailSent });
        // only if the mail did not go out: show the password ONCE so the admin can pass it on
        return json({ ok: true, orgId, name, email, mailSent, mailError, password: mailSent ? null : password });
      }
      case "trial_delete": {
        // Testfirma komplett löschen (nur Firmen mit Testphase). Logins, die zu keiner anderen Firma gehören, werden auch gelöscht.
        const orgId = String(body.orgId || "");
        const o = await supabaseAdmin.from("organizations").select("id, name, trial_until").eq("id", orgId);
        const org = o.data && o.data[0];
        if (!org) return json({ error: "Firma nicht gefunden." }, 404);
        if (!org.trial_until) return json({ error: "Nur Testfirmen können gelöscht werden." }, 400);
        const mem = await supabaseAdmin.from("memberships").select("user_id").eq("org_id", orgId);
        const users = [...new Set((mem.data || []).map((m) => m.user_id))];
        const del = await supabaseAdmin.rpc("delete_trial_org", { p_org: orgId });
        if (del.error) return json({ error: /delete_trial_org/.test(del.error.message) ? "Bitte zuerst Datenbank-Skript 44 ausführen." : "Löschen fehlgeschlagen: " + del.error.message }, 500);
        let removed = 0;
        for (const u of users) {
          if (u === me.id) continue;
          const other = await supabaseAdmin.from("memberships").select("org_id").eq("user_id", u);
          const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", u);
          if ((other.data || []).length === 0 && !(adm.data || []).length) { const r = await supabaseAdmin.auth.admin.deleteUser(u); if (!r.error) removed += 1; }
        }
        await log(me, "trial_delete", null, orgId, { name: org.name, logins: removed });
        return json({ ok: true, removed });
      }
      case "create_org": {
        const name = String(body.name || "").trim(), email = String(body.ownerEmail || "").trim().toLowerCase();
        const products = Array.isArray(body.products) ? body.products.filter((p) => PRODUCTS.includes(p)) : [];
        if (name.length < 2 || name.length > 120) return json({ error: "Bitte einen Firmennamen angeben (2 bis 120 Zeichen)." }, 400);
        if (!EMAIL.test(email)) return json({ error: "Bitte eine gültige E-Mail des Inhabers angeben." }, 400);
        if (products.length === 0) return json({ error: "Bitte mindestens ein Produkt wählen." }, 400);
        const given = String(body.password || ""); if (given && given.length < 12) return json({ error: "Das Passwort braucht mindestens 12 Zeichen." }, 400);
        const all = await supabaseAdmin.from("organizations").select("name");
        if (all.data && all.data.some((o) => String(o.name).trim().toLowerCase() === name.toLowerCase())) return json({ error: "Eine Firma mit diesem Namen gibt es schon." }, 409);
        const password = given || newPassword();
        const user = await createLogin(email, password);
        const rpc = await supabaseAdmin.rpc("create_organization", { p_name: name, p_owner: user.id, p_products: products });
        if (rpc.error) { await supabaseAdmin.auth.admin.deleteUser(user.id); throw new Error("Firma konnte nicht angelegt werden: " + rpc.error.message); } // undo the login
        await markFirstLogin(user.id);
        await log(me, "create_org", rpc.data, email, { name, products });
        return json({ ok: true, orgId: rpc.data, email, password: given ? null : password });
      }
      case "add_member": {
        const email = String(body.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: "Bitte eine gültige E-Mail angeben." }, 400);
        if (!ROLES.includes(body.role)) return json({ error: "Ungültige Rolle." }, 400);
        const org = await supabaseAdmin.from("organizations").select("id, name").eq("id", body.orgId);
        if (!org.data || !org.data[0]) return json({ error: "Firma nicht gefunden." }, 404);
        let staffId = null;
        // employees must belong to a person; Leitung/Inhaber may (optional), so they can stamp and see "Meine Zeiten"
        if (body.role === "employee" || body.staffId) {
          if (!body.staffId) return json({ error: "Bitte die Person wählen, zu der dieses Konto gehört." }, 400);
          const st = await supabaseAdmin.from("staff").select("id").eq("id", body.staffId).eq("org_id", body.orgId);
          if (!st.data || !st.data[0]) return json({ error: "Diese Person gehört nicht zu dieser Firma." }, 400);
          const taken = await supabaseAdmin.from("memberships").select("user_id").eq("staff_id", body.staffId);
          if (taken.data && taken.data.length) return json({ error: "Diese Person hat schon ein Konto." }, 409);
          staffId = body.staffId;
        }
        const given = String(body.password || ""); if (given && given.length < 12) return json({ error: "Das Passwort braucht mindestens 12 Zeichen." }, 400);
        const password = given || newPassword();
        const user = await createLogin(email, password);
        const ins = await supabaseAdmin.from("memberships").insert({ user_id: user.id, org_id: body.orgId, role: body.role, staff_id: staffId });
        if (ins.error) { await supabaseAdmin.auth.admin.deleteUser(user.id); throw new Error("Konto konnte nicht zugeordnet werden."); }
        await markFirstLogin(user.id);
        await log(me, "add_member", body.orgId, email, { role: body.role, staffId });
        return json({ ok: true, email, password: given ? null : password });
      }
      case "reset_password": {
        const email = String(body.email || "").trim().toLowerCase();
        const u = await findUserByEmail(email); if (!u) return json({ error: "Konto nicht gefunden." }, 404);
        const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", u.id);
        if (adm.data && adm.data.length && u.id !== me.id) return json({ error: "Das Passwort eines anderen Plattform-Admins kann hier nicht geändert werden." }, 403);
        const given = String(body.password || ""); if (given && given.length < 12) return json({ error: "Das Passwort braucht mindestens 12 Zeichen." }, 400);
        const password = given || newPassword();
        const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, { password });
        if (error) throw error;
        await markFirstLogin(u.id);
        await log(me, "reset_password", null, email, null);
        return json({ ok: true, email, password: given ? null : password });
      }
      case "set_feature": {
        const feature = String(body.feature || "");
        if (!Object.prototype.hasOwnProperty.call(FEATURES, feature)) return json({ error: "Unbekannte Funktion." }, 400);
        const on = !!body.enabled;
        const r = await supabaseAdmin.from("org_features").upsert({ org_id: body.orgId, feature, enabled: on, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "org_id,feature" });
        if (r.error) throw r.error;
        await log(me, "set_feature", body.orgId, feature, { enabled: on });
        return json({ ok: true });
      }
      case "rename_org": {
        const name = String(body.name || "").trim();
        if (name.length < 2 || name.length > 120) return json({ error: "Bitte einen Firmennamen angeben (2 bis 120 Zeichen)." }, 400);
        const all = await supabaseAdmin.from("organizations").select("id, name");
        if (all.error) throw all.error;
        const old = all.data.find((o) => o.id === body.orgId);
        if (!old) return json({ error: "Firma nicht gefunden." }, 404);
        if (all.data.some((o) => o.id !== body.orgId && String(o.name).trim().toLowerCase() === name.toLowerCase())) return json({ error: "Eine Firma mit diesem Namen gibt es schon." }, 409);
        const r = await supabaseAdmin.from("organizations").update({ name }).eq("id", body.orgId);
        if (r.error) throw r.error;
        await log(me, "rename_org", body.orgId, null, { from: old.name, to: name });
        return json({ ok: true });
      }
      case "change_email": {
        const email = String(body.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
        const { data: got, error: gErr } = await supabaseAdmin.auth.admin.getUserById(String(body.userId || ""));
        if (gErr || !got || !got.user) return json({ error: "Konto nicht gefunden." }, 404);
        const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", got.user.id);
        if (adm.data && adm.data.length && got.user.id !== me.id) return json({ error: "Die E-Mail eines anderen Plattform-Admins kann hier nicht geändert werden." }, 403);
        if ((got.user.email || "").toLowerCase() === email) return json({ ok: true, email });
        const { error } = await supabaseAdmin.auth.admin.updateUserById(got.user.id, { email, email_confirm: true }); // no confirmation mail; the admin is responsible
        if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Diese E-Mail hat schon ein Konto." : error.message }, 400);
        await log(me, "change_email", null, email, { from: got.user.email });
        return json({ ok: true, email });
      }
      case "set_product": {
        if (!PRODUCTS.includes(body.product)) return json({ error: "Unbekanntes Produkt." }, 400);
        const r = await supabaseAdmin.from("org_products").upsert({ org_id: body.orgId, product: body.product, enabled: !!body.enabled }, { onConflict: "org_id,product" });
        if (r.error) throw r.error;
        await log(me, "set_product", body.orgId, body.product, { enabled: !!body.enabled });
        return json({ ok: true });
      }
      case "set_org_active": {
        const r = await supabaseAdmin.from("organizations").update({ active: !!body.active }).eq("id", body.orgId);
        if (r.error) throw r.error;
        await log(me, "set_org_active", body.orgId, null, { active: !!body.active });
        return json({ ok: true });
      }
      case "link_staff": {
        // link (or unlink) an existing account to a person of the plan – e.g. a Leitung who also works shifts
        const mem = await supabaseAdmin.from("memberships").select("user_id, role, staff_id").eq("org_id", body.orgId).eq("user_id", body.userId);
        if (!mem.data || !mem.data[0]) return json({ error: "Konto nicht gefunden." }, 404);
        if (!body.staffId) {
          if (mem.data[0].role === "employee") return json({ error: "Mitarbeitende brauchen immer eine Person." }, 400);
        } else {
          const st = await supabaseAdmin.from("staff").select("id").eq("id", body.staffId).eq("org_id", body.orgId);
          if (!st.data || !st.data[0]) return json({ error: "Diese Person gehört nicht zu dieser Firma." }, 400);
          const taken = await supabaseAdmin.from("memberships").select("user_id").eq("staff_id", body.staffId);
          if (taken.data && taken.data.some((t) => t.user_id !== body.userId)) return json({ error: "Diese Person hat schon ein anderes Konto." }, 409);
        }
        const up = await supabaseAdmin.from("memberships").update({ staff_id: body.staffId || null }).eq("org_id", body.orgId).eq("user_id", body.userId);
        if (up.error) throw new Error(up.error.message);
        await log(me, "link_staff", body.orgId, body.userId, { staffId: body.staffId || null });
        return json({ ok: true });
      }
      case "remove_member": {
        if (body.userId === me.id) return json({ error: "Das eigene Konto kann hier nicht entfernt werden." }, 400);
        const m = await supabaseAdmin.from("memberships").select("role").eq("user_id", body.userId).eq("org_id", body.orgId);
        if (!m.data || !m.data[0]) return json({ error: "Zuordnung nicht gefunden." }, 404);
        if (m.data[0].role === "owner") return json({ error: "Der Inhaber kann hier nicht entfernt werden. Bitte die Firma deaktivieren." }, 400);
        const r = await supabaseAdmin.from("memberships").delete().eq("user_id", body.userId).eq("org_id", body.orgId);
        if (r.error) throw r.error;
        await log(me, "remove_member", body.orgId, body.userId, null);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unbekannte Aktion." }, 400);
    }
  } catch (e) {
    return json({ error: e && e.message ? e.message : "Serverfehler." }, 500);
  }
}
