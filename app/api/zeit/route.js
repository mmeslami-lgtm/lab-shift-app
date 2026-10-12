import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeiterfassung, Stufe 1:  POST /api/zeit   { action, … }
//
// Terminal (tablet/laptop at the entrance), identified by its own serial + secret (only a hash is stored):
//   token      → new QR token (valid 60 s) for the direction chosen on the terminal { direction }
//   staff      → names of the people who have a stamp PIN (for the PIN keypad)
//   pin        → stamp with name + PIN               { staff_id, pin, direction }
//   card       → chip card: 1st call { code } → who + suggestion (+ needPin); 2nd call { code, direction, pin? } → stamp
// Logged-in people (Authorization: Bearer <login token>):
//   pair-create → Leitung/Inhaber create a one-time setup code     { org_id, name }  (valid 24 h, once)
// Tablet without anybody logged in:
//   pair       → turn this device into a terminal with the code    { code }
//   qr         → employee stamps after scanning the QR code       { token } (direction comes from the QR)
//
// Rules: the company always comes from the terminal / the token, never from the caller; the time is
// ALWAYS the server time (the database enforces it as well); stamps can never be changed or deleted.

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const sha256 = (t) => createHash("sha256").update(String(t)).digest("hex");
const TOKEN_SECONDS = 60;
const PIN_TRIES = 5, PIN_LOCK_MIN = 15;

async function hasProduct(orgId) {
  const r = await supabaseAdmin.from("org_products").select("product, enabled").eq("org_id", orgId).eq("product", "time_tracking");
  return !r.error && r.data && r.data.some((p) => p.enabled !== false);
}

async function deviceFrom(body, request) {
  const serial = request.headers.get("x-device-serial") || body.device_serial;
  const key = request.headers.get("x-device-key") || body.device_key;
  if (!serial || !key) return null;
  const r = await supabaseAdmin.from("devices").select("id, org_id, serial, name, secret_hash, active").eq("serial", String(serial));
  const d = r.data && r.data[0];
  if (!d || d.active === false || d.secret_hash !== sha256(key)) return null;
  return d;
}

async function userFrom(request) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(m[1].trim());
  return error || !data || !data.user ? null : data.user;
}

async function stamp({ orgId, staffId, direction, device, method }) {
  // double tap protection: same person, same direction within 60 s
  const last = await supabaseAdmin.from("attendance_events").select("direction, scanned_at").eq("staff_id", staffId).order("scanned_at", { ascending: false }).limit(1);
  const prev = last.data && last.data[0];
  if (prev && prev.direction === direction && Date.now() - new Date(prev.scanned_at).getTime() < 60000) {
    return { error: direction === "in" ? "Du bist schon eingestempelt." : "Du bist schon ausgestempelt.", status: 409 };
  }
  const ins = await supabaseAdmin.from("attendance_events")
    .insert({ org_id: orgId, staff_id: staffId, direction, badge_code: method, device_id: device ? device.serial : "app", raw_payload: { method } })
    .select("id, scanned_at").single();
  if (ins.error) return { error: "Speichern fehlgeschlagen: " + ins.error.message, status: 500 };
  return { ok: true, time: ins.data.scanned_at };
}

export async function GET() {
  return json({ status: "ok", serverTime: new Date().toISOString() });
}

export async function POST(request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Server nicht eingerichtet" }, 500);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage" }, 400); }
  const action = String(body.action || "");
  try {
    // ---------------- terminal ----------------
    if (action === "token" || action === "staff" || action === "pin" || action === "card") {
      const device = await deviceFrom(body, request);
      if (!device) return json({ error: "Terminal nicht eingerichtet oder gesperrt" }, 401);
      if (!(await hasProduct(device.org_id))) return json({ error: "Zeiterfassung ist für diese Firma nicht freigeschaltet" }, 403);

      if (action === "token") {
        await supabaseAdmin.from("terminal_tokens").delete().lt("expires_at", new Date().toISOString());
        const token = randomBytes(18).toString("base64url");
        const expires = new Date(Date.now() + TOKEN_SECONDS * 1000).toISOString();
        const tdir = body.direction === "out" ? "out" : body.direction === "in" ? "in" : null;
        const r = await supabaseAdmin.from("terminal_tokens").insert({ token, device_id: device.id, org_id: device.org_id, expires_at: expires, direction: tdir });
        if (r.error) throw r.error;
        const o = await supabaseAdmin.from("organizations").select("name").eq("id", device.org_id);
        return json({ token, expiresAt: expires, serverTime: new Date().toISOString(), terminal: device.name || device.serial, orgName: (o.data && o.data[0] && o.data[0].name) || "" });
      }

      if (action === "staff") {
        const st = await supabaseAdmin.from("staff").select("id, name").eq("org_id", device.org_id).eq("active", true).order("name");
        const pins = await supabaseAdmin.from("staff_pins").select("staff_id").eq("org_id", device.org_id);
        const withPin = new Set((pins.data || []).map((p) => p.staff_id));
        return json({ staff: (st.data || []).filter((s) => withPin.has(s.id)).map((s) => ({ id: s.id, name: s.name })) });
      }

      if (action === "card") {
        const code = String(body.code || "").trim();
        if (code.length < 4 || code.length > 64) return json({ error: "Karte nicht lesbar – bitte noch einmal" }, 400);
        const bq = await supabaseAdmin.from("badges").select("staff_id, revoked_at").eq("org_id", device.org_id).eq("badge_code", code);
        const badge = (bq.data || []).find((x) => !x.revoked_at);
        if (!badge) return json({ error: "Diese Karte ist nicht bekannt. Bitte bei der Leitung melden." }, 404);
        const st = await supabaseAdmin.from("staff").select("id, name, active").eq("id", badge.staff_id).eq("org_id", device.org_id);
        const person = st.data && st.data[0];
        if (!person || person.active === false) return json({ error: "Diese Karte ist nicht aktiv." }, 403);
        const org = await supabaseAdmin.from("organizations").select("card_requires_pin").eq("id", device.org_id);
        const needPin = !!(org.data && org.data[0] && org.data[0].card_requires_pin);
        const dir = body.direction === "out" ? "out" : body.direction === "in" ? "in" : null;
        if (!dir) { // first step: who is it, which button is likely
          const last = await supabaseAdmin.from("attendance_events").select("direction, scanned_at").eq("staff_id", person.id).order("scanned_at", { ascending: false }).limit(1);
          const l = last.data && last.data[0];
          const suggest = l && l.direction === "in" && Date.now() - new Date(l.scanned_at).getTime() < 20 * 3600000 ? "out" : "in";
          return json({ name: person.name, suggest, needPin });
        }
        if (needPin) {
          const since = new Date(Date.now() - PIN_LOCK_MIN * 60000).toISOString();
          const fails = await supabaseAdmin.from("pin_failures").select("id").eq("staff_id", person.id).gte("at", since);
          if ((fails.data || []).length >= PIN_TRIES) return json({ error: `Zu viele falsche PINs. Bitte in ${PIN_LOCK_MIN} Minuten erneut versuchen.` }, 429);
          const chk = await supabaseAdmin.rpc("check_staff_pin", { p_staff: person.id, p_pin: String(body.pin || "") });
          if (chk.error) throw chk.error;
          if (chk.data !== true) { await supabaseAdmin.from("pin_failures").insert({ staff_id: person.id }); return json({ error: "PIN falsch." }, 401); }
        }
        const r = await stamp({ orgId: device.org_id, staffId: person.id, direction: dir, device, method: "card" });
        if (r.error) return json({ error: r.error }, r.status);
        return json({ ok: true, name: person.name, direction: dir, time: r.time });
      }

      // pin
      const direction = body.direction === "out" ? "out" : body.direction === "in" ? "in" : null;
      if (!direction) return json({ error: "Kommen oder Gehen?" }, 400);
      const st = await supabaseAdmin.from("staff").select("id, name, org_id, active").eq("id", String(body.staff_id || "")).eq("org_id", device.org_id);
      const person = st.data && st.data[0];
      if (!person || person.active === false) return json({ error: "Person nicht gefunden" }, 404);
      const since = new Date(Date.now() - PIN_LOCK_MIN * 60000).toISOString();
      const fails = await supabaseAdmin.from("pin_failures").select("id").eq("staff_id", person.id).gte("at", since);
      if ((fails.data || []).length >= PIN_TRIES) return json({ error: `Zu viele falsche PINs. Bitte in ${PIN_LOCK_MIN} Minuten erneut versuchen oder die Leitung fragen.` }, 429);
      const chk = await supabaseAdmin.rpc("check_staff_pin", { p_staff: person.id, p_pin: String(body.pin || "") });
      if (chk.error) throw chk.error;
      if (chk.data !== true) {
        await supabaseAdmin.from("pin_failures").insert({ staff_id: person.id });
        const left = PIN_TRIES - (fails.data || []).length - 1;
        return json({ error: left > 0 ? `PIN falsch. Noch ${left} Versuch(e).` : `PIN falsch. Für ${PIN_LOCK_MIN} Minuten gesperrt.` }, 401);
      }
      const r = await stamp({ orgId: device.org_id, staffId: person.id, direction, device, method: "pin" });
      if (r.error) return json({ error: r.error }, r.status);
      return json({ ok: true, name: person.name, direction, time: r.time });
    }

    // ---------------- tablet with a one-time code (nobody logged in) ----------------
    if (action === "pair") {
      const raw = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (raw.length !== 8) return json({ error: "Bitte den 8-stelligen Code eingeben" }, 400);
      const q = await supabaseAdmin.from("terminal_pair_codes").select("id, org_id, name, expires_at, used_at").eq("code_hash", sha256(raw));
      const pc = q.data && q.data[0];
      if (!pc || pc.used_at || new Date(pc.expires_at).getTime() < Date.now()) return json({ error: "Dieser Code ist ungültig, schon benutzt oder abgelaufen. Bitte bei der Leitung einen neuen holen." }, 400);
      if (!(await hasProduct(pc.org_id))) return json({ error: "Zeiterfassung ist für diese Firma nicht freigeschaltet" }, 403);
      const serial = "T-" + randomBytes(5).toString("hex").toUpperCase();
      const key = randomBytes(24).toString("base64url");
      const ins = await supabaseAdmin.from("devices").insert({ org_id: pc.org_id, serial, name: pc.name, secret_hash: sha256(key), active: true }).select("id").single();
      if (ins.error) throw ins.error;
      await supabaseAdmin.from("terminal_pair_codes").update({ used_at: new Date().toISOString(), device_id: ins.data.id }).eq("id", pc.id);
      return json({ serial, key, name: pc.name });
    }

    // ---------------- logged-in people ----------------
    const user = await userFrom(request);
    if (!user) return json({ error: "Bitte anmelden" }, 401);

    if (action === "pair-create") {
      const orgId = String(body.org_id || "");
      const m = await supabaseAdmin.from("memberships").select("role").eq("user_id", user.id).eq("org_id", orgId);
      if (!m.data || !m.data[0] || !["owner", "supervisor"].includes(m.data[0].role)) return json({ error: "Nur Leitung oder Inhaber können ein Terminal einrichten" }, 403);
      if (!(await hasProduct(orgId))) return json({ error: "Zeiterfassung ist für diese Firma nicht freigeschaltet (Plattform-Verwaltung)" }, 403);
      const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
      const raw = Array.from(randomBytes(8), (x) => ABC[x % ABC.length]).join("");
      const code = raw.slice(0, 4) + "-" + raw.slice(4);
      const name = String(body.name || "Terminal").trim().slice(0, 60) || "Terminal";
      const expires = new Date(Date.now() + 24 * 3600000).toISOString();
      const r = await supabaseAdmin.from("terminal_pair_codes").insert({ org_id: orgId, code_hash: sha256(raw), name, expires_at: expires, created_by: user.id });
      if (r.error) throw r.error;
      return json({ code, name, expiresAt: expires });
    }

    if (action === "qr") {
      const t = await supabaseAdmin.from("terminal_tokens").select("token, device_id, org_id, expires_at, direction").eq("token", String(body.token || ""));
      const tok = t.data && t.data[0];
      if (!tok || new Date(tok.expires_at).getTime() < Date.now()) return json({ error: "Der Code ist abgelaufen. Bitte am Terminal noch einmal Kommen oder Gehen drücken und neu scannen." }, 410);
      const direction = tok.direction || (body.direction === "out" ? "out" : body.direction === "in" ? "in" : null);
      if (!direction) return json({ error: "Kommen oder Gehen?", needDirection: true }, 400);
      const m = await supabaseAdmin.from("memberships").select("staff_id").eq("user_id", user.id).eq("org_id", tok.org_id);
      const staffId = m.data && m.data[0] && m.data[0].staff_id;
      if (!staffId) return json({ error: "Dieses Terminal gehört nicht zu deiner Firma." }, 403);
      if (!(await hasProduct(tok.org_id))) return json({ error: "Zeiterfassung ist nicht freigeschaltet" }, 403);
      const dev = await supabaseAdmin.from("devices").select("serial, active").eq("id", tok.device_id);
      if (!dev.data || !dev.data[0] || dev.data[0].active === false) return json({ error: "Terminal gesperrt" }, 403);
      const r = await stamp({ orgId: tok.org_id, staffId, direction, device: dev.data[0], method: "qr" });
      if (r.error) return json({ error: r.error }, r.status);
      return json({ ok: true, direction, time: r.time });
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    return json({ error: "Serverfehler: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
