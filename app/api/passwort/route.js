import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendMail, smtpConfigured } from "../../../lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Passwort vergessen?" on the login page (decision of the user, 9 Nov 2026: temporary password, not a link).
//   POST /api/passwort  { email }
//   * Always the same answer ("Falls … bekannt ist …") – nobody can find out which addresses have a login.
//   * At most 3 requests per address per hour (table password_reset_log, script 42), max 20 per hour overall.
//   * The temporary password is e-mailed FIRST; only if the mail went out, it becomes the password (else the old
//     one stays). The login is marked "first login" (flag_first_login): after signing in the person must choose a
//     new own password (PasswordGate) before using the app.
//   * The Leitung / Inhaber of the person's companies get a short e-mail (without the password).
//   * Platform admins are not reset here.
// Note: whoever knows an address can make its old password stop working – limited by the rate limit, and the
// owner of the address always gets the e-mail.

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (t) => createHash("sha256").update(String(t)).digest("hex");
const SAME_ANSWER = "Falls diese E-Mail-Adresse bei uns bekannt ist, kommt gleich eine E-Mail mit einem vorläufigen Passwort. Bitte auch im Spam-Ordner nachsehen.";
function tempPassword() { // 12 characters, no look-alikes – easy to type from the e-mail
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => abc[b % abc.length]).join("");
}
async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 200) return json({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, 400);
    if (!smtpConfigured()) return json({ error: "Der E-Mail-Versand ist gerade nicht eingerichtet. Bitte die Leitung fragen." }, 503);

    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const h = sha256(email);
    const mine = await supabaseAdmin.from("password_reset_log").select("id").eq("email_hash", h).gte("created_at", hourAgo);
    const all = await supabaseAdmin.from("password_reset_log").select("id").gte("created_at", hourAgo);
    if ((mine.data || []).length >= 3 || (all.data || []).length >= 20) return json({ error: "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen oder die Leitung fragen." }, 429);
    await supabaseAdmin.from("password_reset_log").insert({ email_hash: h });

    const user = await findUserByEmail(email);
    if (!user) return json({ ok: true, message: SAME_ANSWER });
    const adm = await supabaseAdmin.from("platform_admins").select("user_id").eq("user_id", user.id);
    if (adm.data && adm.data.length) return json({ ok: true, message: SAME_ANSWER });

    const password = tempPassword();
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.dienstigo.de").replace(/\/$/, "");
    await sendMail({
      to: email,
      fromName: "Dienstigo",
      subject: "Dienstigo – vorläufiges Passwort",
      text: [
        "Hallo,",
        "",
        "für Ihr Dienstigo-Konto wurde ein neues Passwort angefordert.",
        "",
        `Vorläufiges Passwort:  ${password}`,
        "",
        `Bitte jetzt anmelden: ${site}/login`,
        "Nach der Anmeldung legen Sie sofort ein eigenes, neues Passwort fest. Das alte Passwort gilt nicht mehr.",
        "",
        "Sie haben das nicht angefordert? Dann bitte Ihre Leitung informieren.",
        "",
        "Dienstigo",
      ].join("\n"),
    });
    // only now: the mail is out -> it becomes the password; own password at the next sign-in
    const up = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
    if (up.error) throw up.error;
    try { await supabaseAdmin.rpc("flag_first_login", { p_user: user.id }); } catch (e) { /* never block */ }

    // tell the Leitung / Inhaber of the person's companies (no password in it)
    try {
      const ms = await supabaseAdmin.from("memberships").select("org_id, staff_id").eq("user_id", user.id);
      const orgIds = [...new Set((ms.data || []).map((m) => m.org_id))];
      const staffIds = (ms.data || []).map((m) => m.staff_id).filter(Boolean);
      const st = staffIds.length ? await supabaseAdmin.from("staff").select("name").in("id", staffIds) : { data: [] };
      const who = ((st.data || [])[0] || {}).name || email;
      if (orgIds.length) {
        const lead = await supabaseAdmin.from("memberships").select("user_id").in("org_id", orgIds).in("role", ["owner", "supervisor"]);
        const ids = [...new Set((lead.data || []).map((x) => x.user_id).filter((id) => id !== user.id))];
        for (const id of ids.slice(0, 10)) {
          const u = await supabaseAdmin.auth.admin.getUserById(id);
          const to = u.data && u.data.user && u.data.user.email;
          if (to) await sendMail({ to, fromName: "Dienstigo", subject: `Dienstigo – ${who} hat ein vorläufiges Passwort angefordert`,
            text: `Hallo,\n\n${who} (${email}) hat über „Passwort vergessen?“ ein vorläufiges Passwort angefordert und muss bei der nächsten Anmeldung ein neues festlegen.\n\nWar das nicht die Person selbst, melden Sie sich bitte bei ihr.\n\nDienstigo` }).catch(() => {});
        }
      }
    } catch (e) { /* the reset itself worked */ }
    return json({ ok: true, message: SAME_ANSWER });
  } catch (e) {
    console.error("passwort:", e && e.message);
    return json({ error: "Das hat nicht geklappt. Bitte später noch einmal versuchen oder die Leitung fragen." }, 500);
  }
}
