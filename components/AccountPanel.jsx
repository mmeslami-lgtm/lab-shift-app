"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const PAPER = "#F4F6F9";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";

const PRODUCT_LABEL = {
  lab_planner: "Dienstplaner Labor",
  generic_planner: "Dienstplaner allgemein",
  employee_app: "Mitarbeiter-App",
};
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };

const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "13px 16px", cursor: "pointer" };
const btnGhost = { border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "10px 12px", cursor: "pointer" };

export default function AccountPanel() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (uid) => {
    setLoadError(""); setData(null); setChecks(null);
    // A boss may also read the other accounts of the company, so keep MY memberships apart from all visible ones.
    const mem = await supabase.from("memberships").select("user_id, org_id, role, staff_id, organizations(name)");
    if (mem.error) { setLoadError(mem.error.message); return; }
    const mine = mem.data.filter((m) => m.user_id === uid);
    const orgIds = mine.map((m) => m.org_id);
    const prod = await supabase.from("org_products").select("org_id, product, enabled");
    const staff = await supabase.from("staff").select("id, org_id, name");
    if (prod.error || staff.error) { setLoadError((prod.error || staff.error).message); return; }
    setData({ memberships: mine, allMemberships: mem.data, orgIds, products: prod.data, staff: staff.data });
  }, []);

  useEffect(() => { if (session) load(session.user.id); else { setData(null); setChecks(null); } }, [session, load]);

  async function signOut() { await supabase.auth.signOut(); }

  // Two checks that prove the company separation works for THIS login.
  async function runChecks() {
    setChecks("running");
    const result = [];
    // 1) Read check: ask for ALL staff rows with no filter. Only rows of my own companies may come back.
    const all = await supabase.from("staff").select("id, org_id");
    if (all.error) result.push({ ok: false, text: "Lesetest", detail: all.error.message });
    else {
      const foreign = all.data.filter((r) => !data.orgIds.includes(r.org_id)).length;
      result.push({ ok: foreign === 0, text: "Lesetest: Zeilen fremder Firmen sichtbar", detail: `${foreign} von ${all.data.length}` });
    }
    // 2) Write check: try to create a person inside a company that is not mine. Must be refused.
    const fakeOrg = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000000";
    const ins = await supabase.from("staff").insert({ org_id: fakeOrg, name: "Sicherheitstest" }).select("id");
    if (ins.error) result.push({ ok: true, text: "Schreibtest: Eintrag in fremde Firma", detail: "abgelehnt (richtig)" });
    else {
      result.push({ ok: false, text: "Schreibtest: Eintrag in fremde Firma", detail: "WURDE ANGENOMMEN – bitte melden" });
      if (ins.data && ins.data[0]) await supabase.from("staff").delete().eq("id", ins.data[0].id);
    }
    setChecks(result);
  }

  return (
    <div dir="ltr" style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 14px" }}>Konto</h1>

        {!supabaseConfigured && (
          <div style={{ ...card, background: "#FFF1D2", color: "#7A4E00" }}>
            Supabase ist hier nicht eingerichtet. Prüfe die Umgebungsvariablen <b>NEXT_PUBLIC_SUPABASE_URL</b> und <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> in Vercel.
          </div>
        )}

        {supabaseConfigured && session === undefined && <div style={{ color: MUTED }}>Lädt …</div>}

        {supabaseConfigured && session === null && <LoginForm title="Anmelden" />}

        {supabaseConfigured && session && (
          <>
            <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: MUTED }}>Angemeldet als</div>
                <div style={{ fontSize: 15, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis" }}>{session.user.email}</div>
              </div>
              <button onClick={signOut} style={btnGhost}>Abmelden</button>
            </div>

            {loadError && <div role="alert" style={{ ...card, background: "#FCE5EA", color: "#8A2A3E", fontSize: 13 }}>Fehler beim Laden: {loadError}</div>}
            {!data && !loadError && <div style={{ color: MUTED }}>Lädt …</div>}

            {data && data.memberships.length === 0 && (
              <div style={{ ...card, color: MUTED }}>Dieses Konto gehört noch zu keiner Firma. Die Leitung muss es einer Firma zuordnen.</div>
            )}

            {data && data.memberships.map((m) => {
              const prods = data.products.filter((p) => p.org_id === m.org_id && p.enabled);
              const people = data.staff.filter((s) => s.org_id === m.org_id);
              const accounts = data.allMemberships.filter((x) => x.org_id === m.org_id).length;
              const isBoss = m.role === "owner" || m.role === "supervisor";
              return (
                <div key={m.org_id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{m.organizations ? m.organizations.name : "Firma"}</div>
                    <span style={{ fontSize: 11, fontWeight: 650, background: "#E7ECF6", color: PRIMARY, borderRadius: 999, padding: "3px 9px" }}>{ROLE_LABEL[m.role] || m.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, margin: "10px 0 4px" }}>Gebuchte Produkte</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {prods.length === 0 && <span style={{ fontSize: 13, color: MUTED }}>keine</span>}
                    {prods.map((p) => <span key={p.product} style={{ fontSize: 12, background: "#DDF2E8", color: "#1F6347", borderRadius: 999, padding: "3px 10px" }}>{PRODUCT_LABEL[p.product] || p.product}</span>)}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, margin: "12px 0 4px" }}>Personen, die du in dieser Firma sehen darfst ({people.length})</div>
                  {people.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>niemand</div>}
                  {people.map((s) => <div key={s.id} style={{ fontSize: 14, padding: "2px 0" }}>{s.name}{s.id === m.staff_id ? " (du)" : ""}</div>)}
                  {isBoss && <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Zugänge (Logins) in dieser Firma: {accounts}</div>}
                </div>
              );
            })}

            {data && (
              <div style={card}>
                <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 4 }}>Sicherheits-Check</div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>Prüft für diese Anmeldung, dass Daten anderer Firmen weder lesbar noch beschreibbar sind.</div>
                <button onClick={runChecks} disabled={checks === "running"} style={btn}>{checks === "running" ? "Prüfe …" : "Check starten"}</button>
                {Array.isArray(checks) && checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: c.ok ? "#1F6347" : "#B3263E" }}>{c.ok ? "✓" : "✗"}</span>
                    <span><b>{c.text}</b><br /><span style={{ color: MUTED }}>{c.detail}</span></span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
