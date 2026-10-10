// /robots.txt – only the public pages may be indexed; the app itself (behind the login) not.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lab-shift-app.vercel.app";
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/impressum", "/datenschutz", "/demo"], disallow: ["/admin", "/konto", "/profil", "/profile", "/freigaben", "/mitarbeiter", "/allgemein", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
