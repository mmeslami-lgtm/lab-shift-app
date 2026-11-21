// Touren (D3a): Koordinaten aus einem Kartenlink lesen – ohne Kartendienst, ohne Kosten.
// Funktioniert mit langen Google-Maps-Links, „geo:“-Links und reinen Koordinaten („25.08, 55.14“).
// Kurze Links (maps.app.goo.gl/…, goo.gl/maps/…) leiten erst weiter: die löst /api/maps auf dem Server auf.

const num = (s) => { const n = Number(s); return Number.isFinite(n) ? n : null; };
const ok = (lat, lng) => lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const pair = (a, b) => { const lat = num(a), lng = num(b); return ok(lat, lng) ? { lat, lng } : null; };

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

export function coordsFromText(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  let t = s;
  try { t = decodeURIComponent(s); } catch (e) { /* keep as is */ }
  // 1) genauer Ort der Markierung: …!3d25.08!4d55.14…
  let m = t.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (m) return pair(m[1], m[2]);
  // 2) Suchparameter: ?q=25.08,55.14  &query=…  &ll=…  &destination=…  &center=…
  m = t.match(new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?${NUM}\\s*,\\s*${NUM}`));
  if (m) return pair(m[1], m[2]);
  // 3) Kartenausschnitt: /@25.08,55.14,15z
  m = t.match(new RegExp(`@${NUM},${NUM}`));
  if (m) return pair(m[1], m[2]);
  // 4) geo:25.08,55.14
  m = t.match(new RegExp(`^geo:${NUM},${NUM}`, "i"));
  if (m) return pair(m[1], m[2]);
  // 5) nur Zahlen: „25.08, 55.14“
  m = t.match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  if (m) return pair(m[1], m[2]);
  return null;
}

// kurzer Link, den nur der Server auflösen kann
export function isShortMapsLink(text) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(String(text || "").trim());
}

export function isMapsLink(text) {
  return /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(String(text || "").trim()) || /^geo:/i.test(String(text || "").trim());
}

// Link zum Öffnen in Google Maps (App oder Browser): Koordinaten vor dem Link, der Link vor der Adresse
export function mapsHref({ lat, lng, maps_url, address }) {
  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (maps_url && /^https?:\/\//i.test(maps_url)) return maps_url;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}

// Luftlinie in km (für D3b: Nähe zum letzten Einsatzort)
export function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Telefonnummer vereinheitlichen: nur Ziffern, „00“ → „+“; nationale Nummer („050 …“, „0171 …“) bekommt
// die Landesvorwahl der Firma (für WhatsApp in D4 nötig); leer → null
const CC = { AE: "971", DE: "49" };
export function normPhone(text, country) {
  const s = String(text || "").trim();
  if (!s) return null;
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  d = d.replace(/(?!^)\+/g, "");
  if (/^0[1-9]/.test(d) && CC[country]) d = `+${CC[country]}${d.slice(1)}`;
  return d;
}
