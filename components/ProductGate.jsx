"use client";

import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { OrgContext } from "../lib/orgContext";
import LoginForm from "./LoginForm";
import LegalConsent from "./LegalConsent";
import TrialBanner from "./TrialBanner";
import { legalComplete } from "../lib/legal";
import { setCountryHolidays } from "../lib/timesheet";
import { loadCountry } from "../lib/country";
import { tx, setLang, getLang } from "../lib/i18n";
import { loginName } from "../lib/phoneLogin";

const PAPER = "#E9EEF8";
const INK = "#1B2433";
const MUTED = "#6B7588";
const PRIMARY = "#243B6B";
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App", time_tracking: "Zeiterfassung", touren: "Touren" };
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende", office: "Büro" };
// Planer-Seiten (supervisorOnly): nur diese Rollen. „office“ (Büro, Touren D3a) gehört bewusst NICHT dazu.
const PLANNER_ROLES = ["owner", "supervisor", "planner"];

const shell = { background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" };
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };

// Wraps a product page. Nothing is shown until the person is logged in AND their company has this
// product (and, for the planners, they are a boss). Then the page gets an OrgContext.
//   product        'lab_planner' | 'generic_planner' | 'employee_app', or a list (any one of them is enough)
//   supervisorOnly only owner/supervisor/planner roles may open it (the planners)
//   roles          optional list of roles that may open it (e.g. Touren: owner, supervisor, office)
export default function ProductGate({ product, supervisorOnly = false, roles = null, label, children }) {
  const wanted = Array.isArray(product) ? product : [product];
  const wantedKey = wanted.join(",");
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    // Supabase renews the login token by itself (e.g. when the computer wakes up from sleep). That
    // must NOT reload the page content, otherwise an unsaved plan on the screen would be lost:
    // only a different person or a logout counts as a change.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession((prev) => (prev && s && prev.user && s.user && prev.user.id === s.user.id ? prev : (s || null))));
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
      const ok = own.find((m) => enabled(m.org_id).some((p) => wanted.includes(p)) && (!supervisorOnly || PLANNER_ROLES.includes(m.role)) && (!roles || roles.includes(m.role)));
      if (!ok) { setState({ status: "denied", own: own.map((m) => ({ name: m.organizations ? m.organizations.name : "Firma", role: m.role, products: enabled(m.org_id) })) }); return; }
      // Land & Sprache (Skript 45, Paket D1/D2). Fehlt die Spalte: Deutschland wie bisher.
      // Sprache der Firma gilt ab jetzt (und wird auf diesem Gerät für die Anmeldeseite gemerkt).
      const land = await loadCountry(supabase, ok.org_id);
      if (cancelled) return;
      setLang(land.language, true);
      setCountryHolidays(land.country, land.holidays);
      // Testphase (Skript 34): planner pages stay closed until the owner has accepted the current texts.
      // Only the planner pages (supervisorOnly); the employee app is not touched. Missing column = no test phase.
      let trialUntil = null;
      if (supervisorOnly || roles) {
        const tr = await supabase.from("organizations").select("trial_until").eq("id", ok.org_id);
        if (!tr.error && tr.data && tr.data[0] && tr.data[0].trial_until) {
          trialUntil = tr.data[0].trial_until;
          const la = await supabase.from("legal_acceptances").select("doc, version").eq("org_id", ok.org_id);
          if (cancelled) return;
          // UAE (Entscheidung Nutzer 20.11.2026): vorerst keine Zustimmungsseite (deutsche AVV gilt dort nicht);
          // Wiedervorlage 20.12.2026 – englische Texte nach Prüfung durch einen Anwalt.
          if (land.country === "DE" && (la.error || !legalComplete(la.data))) {
            setState({ status: "consent", orgId: ok.org_id, orgName: ok.organizations ? ok.organizations.name : "Firma", isOwner: ok.role === "owner" });
            return;
          }
        }
        if (cancelled) return;
      }
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
      // Funktionen pro Firma (org_features, Skript 19); fehlt die Tabelle, gibt es einfach keine
      const fr = await supabase.from("org_features").select("feature, enabled").eq("org_id", ok.org_id);
      const features = fr.error ? [] : (fr.data || []).filter((f) => f.enabled).map((f) => f.feature);
      setState({
        status: "ok",
        ctx: { supabase, session, orgId: ok.org_id, orgName: ok.organizations ? ok.organizations.name : "Firma", role: ok.role, staffId: ok.staff_id, products: enabled(ok.org_id), features, requireApproval, retentionYears, shortNoticeDays, trialUntil, trialOver: !!trialUntil && new Date(trialUntil).getTime() < Date.now(), country: land.country, language: land.language, timezone: land.timezone, currency: land.currency },
      });
    })();
    return () => { cancelled = true; };
  }, [session, wantedKey, supervisorOnly, roles ? roles.join(",") : "", reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const what = tx(label) || wanted.map((p) => tx(PRODUCT_LABEL[p] || p)).join(" / ");

  if (!supabaseConfigured) {
    return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", ...card, background: "#FFF1D2", color: "#7A4E00" }}>{tx("Supabase ist hier nicht eingerichtet (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen).")}</div></div>;
  }
  if (state.status === "loading") return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", color: MUTED }}>{tx("Lädt …")}</div></div>;
  if (state.status === "login") {
    return (
      <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 14px" }}>{what}</h1>
        <LoginForm title={tx("Anmelden")} phone={wanted.includes("employee_app")} />
      </div></div>
    );
  }
  if (state.status === "consent") {
    return <LegalConsent supabase={supabase} orgId={state.orgId} orgName={state.orgName} isOwner={state.isOwner} email={session.user.email} onDone={() => setReload((n) => n + 1)} />;
  }
  if (state.status === "error") {
    return <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto", ...card, background: "#FCE5EA", color: "#8A2A3E" }}>{tx("Fehler beim Laden:")} {tx(state.message)}</div></div>;
  }
  if (state.status === "denied") {
    return (
      <div style={shell}><div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 12px" }}>{tx("Kein Zugriff")}</h1>
        <div style={card}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>
            {getLang() === "en" ? <>Your account <b>{loginName(session.user.email)}</b> may not open <b>{what}</b>.</> : <>Dein Konto <b>{loginName(session.user.email)}</b> darf <b>{what}</b> nicht öffnen.</>}
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {supervisorOnly ? tx("Dafür braucht deine Firma das Produkt und du brauchst die Rolle Schichtplaner, Leitung oder Inhaber.") : roles ? tx("Dafür braucht deine Firma das Produkt und du brauchst die Rolle Büro, Leitung oder Inhaber.") : tx("Dafür muss deine Firma das Produkt gebucht haben.")}
          </div>
          {state.own.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {state.own.map((o, i) => (
                <div key={i} style={{ padding: "6px 0", borderTop: i ? "1px solid #EEF0F4" : "none" }}>
                  <b>{o.name}</b> · {tx(ROLE_LABEL[o.role] || o.role)}<br />
                  <span style={{ color: MUTED }}>{tx("Produkte:")} {o.products.length ? o.products.map((p) => tx(PRODUCT_LABEL[p] || p)).join(", ") : tx("keine")}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => supabase.auth.signOut()} style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 15, fontWeight: 600, padding: "10px 14px", cursor: "pointer" }}>{tx("Abmelden")}</button>
            <a href="/konto" style={{ border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 14px", textDecoration: "none" }}>{tx("Zum Konto")}</a>
          </div>
        </div>
      </div></div>
    );
  }
  return (
    <OrgContext.Provider value={state.ctx}>
      {(supervisorOnly || roles) && state.ctx.trialUntil && <TrialBanner supabase={supabase} orgId={state.ctx.orgId} role={state.ctx.role} trialUntil={state.ctx.trialUntil} timezone={state.ctx.timezone} />}
      {children}
    </OrgContext.Provider>
  );
}
