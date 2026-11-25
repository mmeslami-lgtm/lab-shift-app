// Where a signed-in person belongs (25.11.2026: one login for everything).
// myAreas() lists every area this account may open, in fixed order. homeRoute() picks:
//   1. the area used last on this device (localStorage "dg-last-area"), if still allowed,
//   2. otherwise the first allowed area, else the profile.
// /login: an account with several areas is asked EVERY time (25.11.2026, Wunsch); one area = straight in.
// homeRoute() (last area) is only a fallback for places that cannot show the choice.
// prefer (old links ?als=mitarbeiter): "mitarbeiter" goes to the employee app when allowed.

export const AREAS = [
  { href: "/labor", label: "Dienstplan", sub: "Labor", icon: "📅" },
  { href: "/allgemein", label: "Dienstplan", sub: "Schichten planen", icon: "📅" },
  { href: "/touren", label: "Touren", sub: "Kunden & Aufträge", icon: "🚐" },
  { href: "/mitarbeiter", label: "Mitarbeiter-App", sub: "Meine Schichten & Einsätze", icon: "📱" },
  { href: "/admin", label: "Admin", sub: "Plattform-Verwaltung", icon: "⚙️" },
];
const LAST = "dg-last-area";

export function rememberArea(href) {
  if (!AREAS.some((a) => a.href === href)) return;
  try { window.localStorage.setItem(LAST, href); } catch (e) { /* ignore */ }
}
export function lastArea() {
  try { return window.localStorage.getItem(LAST); } catch (e) { return null; }
}

export async function myAreas(supabase, userId) {
  const out = [];
  try {
    const [mem, prod, adm] = await Promise.all([
      supabase.from("memberships").select("user_id, org_id, role, staff_id"),
      supabase.from("org_products").select("org_id, product, enabled"),
      supabase.from("platform_admins").select("user_id").eq("user_id", userId),
    ]);
    const mine = (mem.data || []).filter((m) => m.user_id === userId);
    const has = (m, p) => (prod.data || []).some((x) => x.org_id === m.org_id && x.enabled && x.product === p);
    const planner = (m) => ["owner", "supervisor", "planner"].includes(m.role); // „office“ (Büro) plant nicht
    if (mine.some((m) => planner(m) && has(m, "lab_planner"))) out.push("/labor");
    if (mine.some((m) => planner(m) && has(m, "generic_planner"))) out.push("/allgemein");
    if (mine.some((m) => ["owner", "supervisor", "office"].includes(m.role) && has(m, "touren"))) out.push("/touren");
    if (mine.some((m) => m.staff_id && has(m, "employee_app"))) out.push("/mitarbeiter");
    else if (!out.length && mine.some((m) => has(m, "employee_app"))) out.push("/mitarbeiter");
    if (!adm.error && adm.data && adm.data.length) out.push("/admin");
  } catch (e) { /* fall through */ }
  return out;
}

export async function homeRoute(supabase, userId, prefer) {
  const areas = await myAreas(supabase, userId);
  if (prefer === "mitarbeiter" && areas.includes("/mitarbeiter")) return "/mitarbeiter";
  const last = lastArea();
  if (last && areas.includes(last)) return last;
  return areas[0] || "/profil";
}
