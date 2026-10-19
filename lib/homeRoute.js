// Where a signed-in person belongs: the planner of their company, else the employee app, else the profile.
// Used by the start page (signed-in visitors skip the product page) and by /login after signing in.
export async function homeRoute(supabase, userId) {
  try {
    const [mem, prod] = await Promise.all([
      supabase.from("memberships").select("user_id, org_id, role"),
      supabase.from("org_products").select("org_id, product, enabled"),
    ]);
    const mine = (mem.data || []).filter((m) => m.user_id === userId);
    const has = (m, p) => (prod.data || []).some((x) => x.org_id === m.org_id && x.enabled && x.product === p);
    if (mine.some((m) => m.role !== "employee" && has(m, "lab_planner"))) return "/labor";
    if (mine.some((m) => m.role !== "employee" && has(m, "generic_planner"))) return "/allgemein";
    if (mine.some((m) => has(m, "employee_app"))) return "/mitarbeiter";
    if (!mine.length) {
      // the operator has no company of their own
      const adm = await supabase.from("platform_admins").select("user_id").eq("user_id", userId);
      if (!adm.error && adm.data && adm.data.length) return "/admin";
    }
  } catch (e) { /* fall through */ }
  return "/profil";
}
