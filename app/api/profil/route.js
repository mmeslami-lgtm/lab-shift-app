import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// /api/profil (27.11.2026, Wunsch: „im Profil müssen Vorname, Nachname, Adresse und alles, was eingegeben wurde,
// auch die Telefonnummer, stehen“). Nur die EIGENEN Angaben der angemeldeten Person:
//  * Konto-Angaben (user_metadata): Vorname, Nachname, Mobil, Personalnummer – Leitung / Büro / Inhaber
//  * Inhaber: zusätzlich die Angaben aus der Registrierung (Firma, Telefon, Land …), falls vorhanden
//  * Mitarbeitende mit Platz im Plan: Name, Mobil, Personalnummer, Wochenstunden, Startpunkt: Unterkunft/Ort der Firma oder Wohnadresse
// POST: eigene Konto-Angaben ändern (Vorname, Nachname, Mobil). Personal-Daten ändert nur die Leitung.
export const dynamic = "force-dynamic";
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

async function userOf(request) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(m[1].trim());
  return error || !data ? null : data.user;
}

export async function GET(request) {
  const user = await userOf(request);
  if (!user) return json({ error: "Bitte anmelden." }, 401);
  const md = user.user_metadata || {};
  const ms = await supabaseAdmin.from("memberships").select("org_id, role, staff_id").eq("user_id", user.id);
  const firms = [];
  for (const m of ms.data || []) {
    const f = { orgId: m.org_id, role: m.role, staff: null, registration: null };
    if (m.staff_id) {
      const s = await supabaseAdmin.from("staff").select("name, phone, personnel_no, weekly_hours, employment_type").eq("id", m.staff_id).eq("org_id", m.org_id).maybeSingle();
      // Startpunkt (Touren): Unterkunft / Büro der Firma ODER eigene Wohnadresse
      const t = await supabaseAdmin.from("staff_touren").select("start_kind, place_id, home_address, home_consent_on").eq("staff_id", m.staff_id).eq("org_id", m.org_id).maybeSingle();
      let place = null;
      if (t.data && t.data.start_kind === "place" && t.data.place_id) {
        const pl = await supabaseAdmin.from("touren_places").select("name, kind, address").eq("id", t.data.place_id).eq("org_id", m.org_id).maybeSingle();
        if (pl.data) place = pl.data;
      }
      if (s.data) f.staff = { ...s.data, home_address: t.data && t.data.start_kind === "home" ? t.data.home_address || null : null, home_consent_on: t.data && t.data.start_kind === "home" ? t.data.home_consent_on || null : null, place };
    }
    if (m.role === "owner") {
      const r = await supabaseAdmin.from("demo_requests").select("company, phone, details, lang").eq("org_id", m.org_id).eq("kind", "registration").order("created_at", { ascending: false }).limit(1);
      if (r.data && r.data[0]) {
        const d = r.data[0].details || {};
        f.registration = { company: r.data[0].company, phone: r.data[0].phone || null, firstName: d.firstName || null, lastName: d.lastName || null, country: d.country || null, industry: d.industry || null, size: d.size || null };
      }
    }
    firms.push(f);
  }
  // Vor-/Nachname: Konto-Angaben, sonst aus der Registrierung
  const reg = (firms.find((x) => x.registration) || {}).registration || {};
  return json({
    email: user.email,
    firstName: md.first_name || reg.firstName || null,
    lastName: md.last_name || reg.lastName || null,
    phone: md.phone || reg.phone || null,
    personnelNo: md.personnel_no || null,
    firms,
  });
}

export async function POST(request) {
  const user = await userOf(request);
  if (!user) return json({ error: "Bitte anmelden." }, 401);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage" }, 400); }
  const first = clip(body.first_name, 80), last = clip(body.last_name, 80), phone = clip(body.phone, 40);
  if (!first || !last) return json({ error: "Bitte Vor- und Nachnamen eintragen." }, 400);
  if (phone && !/^[0-9+()/.\- ]+$/.test(phone)) return json({ error: "Bitte nur Ziffern und + ( ) / - in der Telefonnummer." }, 400);
  const md = user.user_metadata || {};
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { user_metadata: { ...md, first_name: first, last_name: last, full_name: `${first} ${last}`, phone: phone || null } });
  if (error) return json({ error: "Konnte nicht gespeichert werden." }, 500);
  return json({ ok: true });
}
