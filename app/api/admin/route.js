import { randomInt } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Platform administration (the /admin page). SERVER ONLY: it uses the service_role key.
//
// SECURITY RULES
//  * Every request must carry the logged-in person's access token (Authorization: Bearer ...).
//  * The token is verified with Supabase, and the person must be listed in the table platform_admins.
//    Otherwise: 401 (not logged in) or 403 (not an administrator). The key itself never leaves the server.
//  * Passwords are never stored or logged by this route. A generated password is returned ONCE.
//  * Every action is written to admin_log (who, what, which company).

const PRODUCTS = ["lab_planner", "generic_planner", "employee_app"];
const ROLES = ["supervisor", "planner", "employee"]; // never "owner" here; owners are created with a company
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
  try {
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
    const firms = orgs.data.map((o) => ({
      ...o,
      products: Object.fromEntries(PRODUCTS.map((p) => [p, !!prods.data.find((x) => x.org_id === o.id && x.product === p && x.enabled)])),
      members: mems.data.filter((m) => m.org_id === o.id).map((m) => ({ userId: m.user_id, email: (users[m.user_id] || {}).email || "?", lastSignIn: (users[m.user_id] || {}).lastSignIn || null, role: m.role, staffId: m.staff_id, staffName: m.staff_id ? staffName[m.staff_id] || null : null })),
      staff: staff.data.filter((s) => s.org_id === o.id && s.active).map((s) => ({ id: s.id, name: s.name, hasLogin: mems.data.some((m) => m.staff_id === s.id) })),
    }));
    return json({ me: auth.user.email, firms });
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
        if (body.role === "employee") {
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
        await log(me, "reset_password", null, email, null);
        return json({ ok: true, email, password: given ? null : password });
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
