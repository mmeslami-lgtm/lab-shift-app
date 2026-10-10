// /sitemap.xml for search engines (public pages only)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lab-shift-app.vercel.app";
export default function sitemap() {
  const now = new Date();
  return ["", "/demo", "/impressum", "/datenschutz"].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "monthly", priority: p === "" ? 1 : 0.4 }));
}
