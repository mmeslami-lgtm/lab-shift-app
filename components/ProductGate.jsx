"use client";

import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { OrgContext } from "../lib/orgContext";
import LoginForm from "./LoginForm";

const PAPER = "#F4F6F9";
const INK = "#1B2433";
const MUTED = "#6B7588";
const PRIMARY = "#243B6B";
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App" };
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", employee: "Mitarbeitende" };

const shell = { background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" };
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };

// Wraps a product page. Nothing is shown until the person is logged in AND their company has this
// product (and, for the planners, they are a boss). Then the page gets an OrgContext.
//   product        'lab_planner' | 'generic_planner' | 'employee_app', or a list (any one of them is enough)
//   supervisorOnly only owner/supervisor roles may open it (the planners)
export default function ProductGate({ product, supervisorOnly = false, label, children }) {
  const wanted = Array.isArray(product) ? product : [product];
  const wantedKey = wanted.join(",");
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setState({ status: "login" }); return; }
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      const mem = await supabase.from("memberships").select("user_id, org_id, role, staff_id, organizations(name)");
      const prod = await supabase.from("org_products").select("org_id, product, enabled");
      if (cancelled) return;
      if (mem.error || prod.error) { setState({ status: "error", message: (mem.error || prod.error).message }); return; }
      const own = mem.data.filter((m) => m.user_id === session.user.id);
      const enabled = (orgId) => prod.data.filter((p) => p.org_id === orgId && p.enabled).map((p) => p.product);
      const ok = own.find((m) => enabled(m.org_id).some((p) => wanted.includes(p)) && (!supervisorOnly || m.role !== "employee"));
      if (!ok) { setState({ status: "denied", own: own.map((m) => ({ name: m.organizations ? m.organizations.name : "Firma", role: m.role, products: enabled(m.org_id) })) }); return; }
      // company settings added by the approval/archive script; fall back to the defaults if it has not been run yet
      let requireApproval = true, retentionYears = 6, shortNoticeDays = 7;
      let settings = await supabase.from("organizations").select("id, require_approval, retention_years, short_notice_days").eq("id", ok.org_id);
      if (settings.error) settings = await supabase.from("organizations").select("id, require_approval, retention_years").eq("id", ok.org_id);
      if (!settings.error && settings.data && settings.data[0]) {
        requireApproval = settings.data[0].require_approval !== false;
        retentionYears = settings.data[0].retention_years || 6;
        if (settings.data[0].short_notice_days !== undefined && settings.data[0].short_notice_days !== null) shortNoticeDays = settings.data[0].short_notice_days;
      }
      if (cancelled) return;
      setState({
        status: "ok",
        ctx: { supabase, session, orgId: ok.org_id, orgName: ok.organizations ? ok.organizations.name : "Firma", role: ok.role, staffId: ok.staff_id, products: enabled(ok.org_id), requireApproval, retentionYears, shortNoticeDays },
      });
    })();
    return () => { cancelled = true; };
  }, [session, wantedKey, supervisorOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const what = label || wanted.map((p) => PRODUCT_LABEL[p] || p).join(" / ");

  if (!supabaseConfigured) {
    return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", ...card, background: "#FFF1D2", color: "#7A4E00" }}>Supabase ist hier nicht eingerichtet (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen).</div></div>;
  }
  if (state.status === "loading") return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", color: MUTED }}>Lädt …</div></div>;
  if (state.status === "login") {
    return (
      <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 14px" }}>{what}</h1>
        <LoginForm title="Anmelden" />
      </div></div>
    );
  }
  if (state.status === "error") {
    return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", ...card, background: "#FCE5EA", color: "#8A2A3E" }}>Fehler beim Laden: {state.message}</div></div>;
  }
  if (state.status === "denied") {
    return (
      <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 12px" }}>Kein Zugriff</h1>
        <div style={card}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>
            Dein Konto <b>{session.user.email}</b> darf <b>{what}</b> nicht öffnen.
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {supervisorOnly ? "Dafür braucht deine Firma das Produkt und du brauchst die Rolle Leitung oder Inhaber." : "Dafür muss deine Firma das Produkt gebucht haben."}
          </div>
          {state.own.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {state.own.map((o, i) => (
                <div key={i} style={{ padding: "6px 0", borderTop: i ? "1px solid #EEF0F4" : "none" }}>
                  <b>{o.name}</b> · {ROLE_LABEL[o.role] || o.role}<br />
                  <span style={{ color: MUTED }}>Produkte: {o.products.length ? o.products.map((p) => PRODUCT_LABEL[p] || p).join(", ") : "keine"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => supabase.auth.signOut()} style={{ border: "1px solid #D9DEE7", borderRadius: 12, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "10px 14px", cursor: "pointer" }}>Abmelden</button>
            <a href="/konto" style={{ border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 14px", textDecoration: "none" }}>Zum Konto</a>
          </div>
        </div>
      </div></div>
    );
  }
  return <OrgContext.Provider value={state.ctx}>{children}</OrgContext.Provider>;
}
