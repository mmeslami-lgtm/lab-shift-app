import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { coordsFromText, isShortMapsLink } from "../../../lib/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Touren (D3a): kurze Google-Maps-Links (maps.app.goo.gl/…) auflösen und die Koordinaten zurückgeben.
//   POST /api/maps { url }   Authorization: Bearer <login token>
// Nur für angemeldete Personen; nur Google-Kurzlinks; höchstens 5 Weiterleitungen; der Inhalt der Seite wird nicht gelesen.
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(goo\.gl|google\.[a-z.]+|g\.co|app\.goo\.gl)(\/|$)/i;

export async function POST(request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Server nicht eingerichtet" }, 500);
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return json({ error: "Nicht angemeldet" }, 401);
  const { data, error } = await supabaseAdmin.auth.getUser(m[1].trim());
  if (error || !data || !data.user) return json({ error: "Nicht angemeldet" }, 401);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "Ungültige Anfrage" }, 400); }
  let url = String(body.url || "").trim();
  if (!isShortMapsLink(url)) return json({ error: "Kein Google-Maps-Kurzlink" }, 400);
  try {
    for (let i = 0; i < 5; i++) {
      if (!ALLOWED.test(url)) break;
      const direct = coordsFromText(url);
      if (direct) return json({ ...direct, url });
      const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Dienstigo link check)" } });
      const next = r.headers.get("location");
      if (!next) break;
      url = new URL(next, url).toString();
    }
    const c = coordsFromText(url);
    return c ? json({ ...c, url }) : json({ error: "Im Link stehen keine Koordinaten", url }, 422);
  } catch (e) {
    return json({ error: "Link konnte nicht geprüft werden" }, 502);
  }
}
