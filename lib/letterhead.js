// Firmendaten & Logo (SQL 65, 27.11.2026) – Briefkopf und Fußzeile für Einwilligung, Einsatzplan und Transport.
// Alles freiwillig: ohne Logo/Angaben steht nur der Firmenname da.

export const LH_SELECT = "name, logo_data, company_address, company_phone, company_email, company_website";

export const lhFrom = (row) => (row ? {
  name: row.name || "", logo: row.logo_data || "", address: row.company_address || "", phone: row.company_phone || "",
  email: row.company_email || "", website: row.company_website || "",
} : null);

export async function loadLetterhead(sb, orgId) {
  try {
    const r = await sb.from("organizations").select(LH_SELECT).eq("id", orgId).maybeSingle();
    return r.error ? null : lhFrom(r.data);
  } catch (e) { return null; }
}

// Fußzeile: Name · Adresse · Telefon · E-Mail · Web (leere Teile fallen weg)
export const footerParts = (lh, fallbackName) => [lh && lh.name ? lh.name : fallbackName || "", lh && lh.address, lh && lh.phone ? `☎ ${lh.phone}` : "", lh && lh.email, lh && lh.website].filter(Boolean);

// Logo im Browser verkleinern (höchstens 600 × 240 px). PNG behält Transparenz; ist es zu groß, JPEG auf Weiß.
export function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) { reject(new Error("type")); return; }
    if (file.size > 10 * 1024 * 1024) { reject(new Error("size")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || 600, h0 = img.naturalHeight || 240;
        const k = Math.min(1, 600 / w0, 240 / h0);
        const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0, w, h);
        let out = c.toDataURL("image/png");
        if (out.length > 300000) { g.globalCompositeOperation = "destination-over"; g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); out = c.toDataURL("image/jpeg", 0.85); }
        URL.revokeObjectURL(url);
        if (out.length > 390000) reject(new Error("size")); else resolve(out);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("type")); };
    img.src = url;
  });
}
