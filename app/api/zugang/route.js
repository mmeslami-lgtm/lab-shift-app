import { randomBytes } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Zugänge": Leitung / Inhaber create logins for THEIR OWN company, like the platform admin does:
//   Inhaber → Leitung, Schichtplaner, Mitarbeitende;   Leitung → Schichtplaner, Mitarbeitende
//   (a Leitung cannot create another Leitung, so nobody gets more rights without the owner).
//   POST /api/zugang  { action, org_id, … }   Authorization: Bearer <login token>
//   list    → people of the company and whether they have a login
//   create  { role, staff_id?, email } → new login, temporary password shown ONCE, own password at first login
//   reset   { user_id } → new temporary password (only for employee logins of this company)
//   remove  { user_id } → login no longer belongs to this company (stamps, plans etc. stay)
// Never: other companies, Leitung/Inhaber logins, platform admins. Everything is written to admin_log.

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function newPassword() { // 16 characters, no look-alikes
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-=?";
  return Array.from(randomBytes(16), (b) => abc[b % abc.length]).join("");
}

const ROLE_LABEL = { supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };
// which roles the caller may create / reset / remove
const allowed = (callerRole, role) => role === "employee" || role === "planner" || (role === "supervisor" && callerRole === "owner");

async function leaderOf(request, orgId) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(m[1].trim());
  if (error || !data || !data.user) return null;
  const ms = await supabaseAdmin.from("memberships").select("role").eq("user_id", data.user.id).eq("org_id", orgId);
  if (!ms.data || !ms.data[0] || !["owner", "supervisor"].includes(ms.data[0].role)) return null;
  return { ...data.user, orgRole: ms.data[0].role };
}
async function manageableLogin(orgId, userId, callerRole) { // a login of this company the caller may manage
  const m = await supabaseAdmin.from("memberships").select("role, staff_id").eq("user_id", userId).eq("org_id", orgId);
  const row = m.data && m.data[0];
  if (!row || row.role === "owner" || !allowed(callerRole, row.role)) return null;
  const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", userId);
  if (adm.data && adm.data.length) return null;
  return row;
}
async function log(actor, action, orgId, target, detail) {
  try { await supabaseAdmin.from("admin_log").insert({ actor: actor.id, actor_email: actor.email, action: "leitung_" + action, org_id: orgId, target: target || null, detail: detail || null }); } catch (e) { /* never block */ }
}
async function flagFirstLogin(userId) {
  try { await supabaseAdmin.rpc("flag_first_login", { p_user: userId }); } catch (e) { /* never block */ }
}

export async function POST(request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Server nicht eingerichtet" }, 500);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage" }, 400); }
  const orgId = String(body.org_id || "");
  const me = await leaderOf(request, orgId);
  if (!me) return json({ error: "Nur Leitung oder Inhaber dieser Firma." }, 403);
  try {
    switch (body.action) {
      case "list": {
        const st = await supabaseAdmin.from("staff").select("id, name, active").eq("org_id", orgId).order("name");
        const all = await supabaseAdmin.from("memberships").select("user_id, staff_id, role").eq("org_id", orgId);
        const ms = { data: (all.data || []).filter((x) => x.role === "employee") };
        const people = [];
        const staffMgr = [];
        for (const x of (all.data || []).filter((y) => y.role !== "employee")) { // Inhaber / Leitung / Schichtplaner
          const u = await supabaseAdmin.auth.admin.getUserById(x.user_id);
          staffMgr.push({ userId: x.user_id, role: x.role, email: u.data && u.data.user ? u.data.user.email : "?", lastSignIn: u.data && u.data.user ? u.data.user.last_sign_in_at || null : null, canManage: x.role !== "owner" && allowed(me.orgRole, x.role) && x.user_id !== me.id });
        }
        for (const s of st.data || []) {
          const m = (ms.data || []).find((x) => x.staff_id === s.id);
          let email = null, lastSignIn = null;
          if (m) { const u = await supabaseAdmin.auth.admin.getUserById(m.user_id); if (u.data && u.data.user) { email = u.data.user.email; lastSignIn = u.data.user.last_sign_in_at || null; } }
          people.push({ staffId: s.id, name: s.name, active: s.active !== false, userId: m ? m.user_id : null, email, lastSignIn });
        }
        return json({ people, managers: staffMgr, myRole: me.orgRole });
      }
      case "create": {
        const role = ["employee", "planner", "supervisor"].includes(body.role) ? body.role : "employee";
        if (!allowed(me.orgRole, role)) return json({ error: "Eine Leitung kann nur der Inhaber anlegen." }, 403);
        const email = String(body.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
        let person = null;
        if (body.staff_id || role === "employee") {
          const st = await supabaseAdmin.from("staff").select("id, name").eq("id", String(body.staff_id || "")).eq("org_id", orgId);
          if (!st.data || !st.data[0]) return json({ error: role === "employee" ? "Bitte die Person wählen (sie muss zu Ihrer Firma gehören)." : "Diese Person gehört nicht zu Ihrer Firma." }, 400);
          const taken = await supabaseAdmin.from("memberships").select("user_id").eq("staff_id", st.data[0].id);
          if (taken.data && taken.data.length) return json({ error: "Diese Person hat schon einen Zugang." }, 409);
          person = st.data[0];
        }
        if (role === "employee") {
          const prod = await supabaseAdmin.from("org_products").select("enabled").eq("org_id", orgId).eq("product", "employee_app");
          if (!prod.data || !prod.data.some((p) => p.enabled !== false)) return json({ error: "Die Mitarbeiter-App ist für Ihre Firma nicht freigeschaltet." }, 403);
        }
        const password = newPassword();
        const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Diese E-Mail hat schon ein Konto. Bitte eine andere verwenden oder die Plattform-Verwaltung fragen." : error.message }, 400);
        const ins = await supabaseAdmin.from("memberships").insert({ user_id: data.user.id, org_id: orgId, role, staff_id: person ? person.id : null });
        if (ins.error) { await supabaseAdmin.auth.admin.deleteUser(data.user.id); return json({ error: "Zugang konnte nicht zugeordnet werden." }, 500); }
        await flagFirstLogin(data.user.id);
        await log(me, "create_login", orgId, email, { role, staffId: person ? person.id : null });
        return json({ ok: true, email, password, name: person ? person.name : `${ROLE_LABEL[role]} (${email})` });
      }
      case "reset": {
        const userId = String(body.user_id || "");
        if (userId === me.id || !(await manageableLogin(orgId, userId, me.orgRole))) return json({ error: "Diesen Zugang dürfen Sie nicht ändern." }, 403);
        const password = newPassword();
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
        await flagFirstLogin(userId);
        await log(me, "reset_password", orgId, data && data.user ? data.user.email : userId, null);
        return json({ ok: true, email: data && data.user ? data.user.email : "", password });
      }
      case "remove": {
        const userId = String(body.user_id || "");
        if (userId === me.id || !(await manageableLogin(orgId, userId, me.orgRole))) return json({ error: "Diesen Zugang dürfen Sie nicht ändern." }, 403);
        const r = await supabaseAdmin.from("memberships").delete().eq("user_id", userId).eq("org_id", orgId);
        if (r.error) throw r.error;
        await log(me, "remove_login", orgId, userId, null);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unbekannte Aktion" }, 400);
    }
  } catch (e) {
    return json({ error: "Serverfehler: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
