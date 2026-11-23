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
  if (body.address !== undefined) return geocode(String(body.address || ""), String(body.country || ""), String(body.lang || ""));
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

// Adresse → Koordinaten über OpenStreetMap (Nominatim). Kostenlos; Regeln: höchstens 1 Anfrage pro Sekunde,
// App-Name im User-Agent, Ergebnisse zwischenspeichern. Zuerst im Land der Firma suchen, sonst weltweit.
const CACHE = new Map();
let lastCall = 0;
async function nominatim(q, cc, lang) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2"); u.searchParams.set("limit", "1"); u.searchParams.set("q", q);
  if (cc) u.searchParams.set("countrycodes", cc);
  const r = await fetch(u, { headers: { "user-agent": "Dienstigo/1.0 (info@dienstigo.de)", "accept-language": lang === "en" ? "en" : "de" } });
  if (!r.ok) throw new Error("geo " + r.status);
  const arr = await r.json();
  return Array.isArray(arr) && arr[0] ? { lat: Math.round(Number(arr[0].lat) * 1e6) / 1e6, lng: Math.round(Number(arr[0].lon) * 1e6) / 1e6, label: String(arr[0].display_name || "").slice(0, 200) } : null;
}
async function geocode(address, country, lang) {
  const q = address.trim().replace(/\s+/g, " ");
  if (q.length < 4 || q.length > 300) return json({ error: "Adresse zu kurz" }, 400);
  const cc = /^(AE|DE)$/i.test(country) ? country.toLowerCase() : "";
  const key = cc + "|" + q.toLowerCase();
  if (CACHE.has(key)) { const c = CACHE.get(key); return c ? json(c) : json({ error: "Adresse nicht gefunden" }, 404); }
  try {
    let hit = await nominatim(q, cc, lang);
    if (!hit && cc) hit = await nominatim(q, "", lang);
    if (CACHE.size > 2000) CACHE.clear();
    CACHE.set(key, hit);
    return hit ? json(hit) : json({ error: "Adresse nicht gefunden" }, 404);
  } catch (e) {
    return json({ error: "Kartendienst nicht erreichbar" }, 502);
  }
}
