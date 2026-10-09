"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";

const INK = "#1B2433", PRIMARY = "#243B6B", PAPER = "#E9EEF8", MUTED = "#6B7588", LINE = "#D9DEE7";
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };
// the three modules: Labor / Allgemein / Personnel
const MODULES = [
  { product: "lab_planner", short: "Labor", long: "Dienstplaner Labor", href: "/", planningOnly: true },
  { product: "generic_planner", short: "Allgemein", long: "Dienstplaner allgemein", href: "/allgemein", planningOnly: true },
  { product: "employee_app", short: "Personnel", long: "Mitarbeiter-App", href: "/mitarbeiter", planningOnly: false },
];
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const fld = { display: "block", width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 76px 12px 12px", fontSize: 16, background: "#fff", color: INK };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 17, fontWeight: 650, padding: "13px 16px", cursor: "pointer", width: "100%" };
const ghost = { border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 15, fontWeight: 600, padding: "9px 12px", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const CSS = `.prof button{transition:transform .08s ease,filter .15s ease,opacity .15s ease}.prof button:not(:disabled):hover{filter:brightness(.95)}.prof button:not(:disabled):active{transform:scale(.97);filter:brightness(.9)}.prof button:disabled{opacity:.55;cursor:not-allowed}.prof a:active{transform:scale(.97)}`;

const fmt = (iso) => { try { return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; } };
function updateError(msg) {
  const m = String(msg || "").toLowerCase();
  if (m.includes("different from the old")) return "Das neue Passwort muss sich vom alten unterscheiden.";
  if (m.includes("weak") || m.includes("least") || m.includes("short")) return "Das Passwort ist zu schwach oder zu kurz.";
  if (m.includes("reauth")) return "Bitte melde dich neu an und versuche es dann noch einmal.";
  if (m.includes("rate") || m.includes("too many")) return "Zu viele Versuche. Bitte kurz warten.";
  return msg || "Das Passwort konnte nicht geändert werden.";
}

function PasswordField({ label, value, onChange, shown, onToggle, autoComplete, hint }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: MUTED, marginBottom: 12 }}>{label}
      <span style={{ position: "relative", display: "block", marginTop: 4 }}>
        <input aria-label={label} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={fld} />
        <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={shown ? `${label} verbergen` : `${label} anzeigen`}
          style={{ position: "absolute", right: 6, top: 8, border: 0, background: "none", color: PRIMARY, fontSize: 13, fontWeight: 650, padding: "8px 10px", cursor: "pointer" }}>{shown ? "Verbergen" : "Anzeigen"}</button>
      </span>
      {hint}
    </label>
  );
}

// Profile page + password change. With forced = true (temporary password from an administrator) it is the ONLY
// thing a person can see until a new password was chosen.
export default function ProfileView({ forced = false }) {
  const [session, setSession] = useState(undefined);
  const [info, setInfo] = useState(null);       // { firms: [...] }
  const [isAdmin, setIsAdmin] = useState(false);
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);         // { kind: "ok" | "error", text }

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // companies, roles and active modules of this person (Row Level Security only returns what they may see)
  useEffect(() => {
    if (!session || forced) return;
    let alive = true;
    (async () => {
      const mem = await supabase.from("memberships").select("user_id, org_id, role, organizations(name)");
      const prod = await supabase.from("org_products").select("org_id, product, enabled");
      if (!alive || mem.error || prod.error) return;
      const own = mem.data.filter((m) => m.user_id === session.user.id);
      setInfo({ firms: own.map((m) => ({ orgId: m.org_id, name: m.organizations ? m.organizations.name : "Firma", role: m.role, products: prod.data.filter((p) => p.org_id === m.org_id && p.enabled).map((p) => p.product) })) });
      try {
        const res = await fetch("/api/admin?check=1", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (alive) setIsAdmin(res.status === 200);
      } catch (e) { /* no admin link */ }
    })();
    return () => { alive = false; };
  }, [session, forced]);

  const rules = useMemo(() => [
    { ok: f.next.length >= 12, text: "Mindestens 12 Zeichen" },
    { ok: f.next !== "" && f.next !== f.current, text: "Anders als das aktuelle Passwort" },
    { ok: f.next !== "" && f.next === f.confirm, text: "Beide neuen Passwörter sind gleich" },
  ], [f]);
  const canSubmit = f.current !== "" && rules.every((r) => r.ok) && !busy;

  function homeFor() {
    const firms = (info && info.firms) || [];
    const plans = (p) => firms.some((x) => x.role !== "employee" && x.products.includes(p));
    if (plans("lab_planner")) return "/";
    if (plans("generic_planner")) return "/allgemein";
    if (firms.some((x) => x.products.includes("employee_app"))) return "/mitarbeiter";
    return "/profil";
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setMsg(null);
    let verifier = null;
    try {
      // 1) check the CURRENT password with a separate, throw-away client (it does not touch this session)
      verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "pw-check" } });
      const chk = await verifier.auth.signInWithPassword({ email: session.user.email, password: f.current });
      if (chk.error) throw new Error(/rate|too many/i.test(chk.error.message) ? "Zu viele Versuche. Bitte kurz warten." : "Das aktuelle Passwort ist nicht richtig.");
      // 2) set the new password
      const upd = await supabase.auth.updateUser({ password: f.next });
      if (upd.error) throw new Error(updateError(upd.error.message));
      // 3) release the "temporary password" lock (the database checks that the password really changed)
      await supabase.rpc("clear_first_login");
      setF({ current: "", next: "", confirm: "" }); setShow({ current: false, next: false, confirm: false });
      setMsg({ kind: "ok", text: forced ? "Passwort geändert. Du wirst gleich weitergeleitet." : "Passwort geändert. Ab jetzt gilt das neue Passwort." });
      if (!forced) window.dispatchEvent(new Event("password-changed"));
      if (forced) {
        // keep the confirmation visible, then load the right start page (a fresh load re-checks the lock, which is released now)
        const target = await (async () => {
          const mem = await supabase.from("memberships").select("user_id, role"); const prod = await supabase.from("org_products").select("org_id, product, enabled").eq("enabled", true);
          const mine = (mem.data || []).filter((m) => m.user_id === session.user.id);
          if (mine.some((m) => m.role !== "employee") && (prod.data || []).some((p) => p.product === "lab_planner")) return "/";
          if (mine.some((m) => m.role !== "employee") && (prod.data || []).some((p) => p.product === "generic_planner")) return "/allgemein";
          if ((prod.data || []).some((p) => p.product === "employee_app")) return "/mitarbeiter";
          return "/profil";
        })();
        setTimeout(() => { window.location.href = target; }, 1400);
      }
    } catch (err) {
      setMsg({ kind: "error", text: err && err.message ? err.message : "Das Passwort konnte nicht geändert werden." });
    } finally {
      if (verifier) { try { await verifier.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ } }
      setBusy(false);
    }
  }

  const shell = (children) => (
    <div dir="ltr" className="prof" style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>{children}</div>
    </div>
  );

  if (!supabaseConfigured) return shell(<div style={{ ...card, background: "#FFF1D2" }}>Supabase ist nicht eingerichtet.</div>);
  if (session === undefined) return shell(<div style={{ color: MUTED }}>Lädt …</div>);
  if (!session) return shell(<><h1 style={{ fontSize: 24, fontWeight: 750, margin: "4px 0 14px" }}>Profil</h1><LoginForm title="Anmelden" /></>);

  const user = session.user;
  return shell(
    <>
      <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 14px" }}>{forced ? "Neues Passwort festlegen" : "Profil"}</h1>

      {forced && (
        <div role="alert" style={{ ...card, background: "#FFF1D2", border: "1px solid #F5D78A", fontSize: 14 }}>
          <b>Bitte lege jetzt dein eigenes Passwort fest.</b><br />
          Das Passwort, das du bekommen hast, war nur vorläufig. Erst danach kannst du das Programm benutzen.
        </div>
      )}

      {!forced && (
        <>
          <div style={card}>
            <div style={{ fontSize: 12, color: MUTED }}>Angemeldet als</div>
            <div style={{ fontSize: 17, fontWeight: 700, wordBreak: "break-all" }}>{user.email}</div>
            {user.last_sign_in_at && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Letzte Anmeldung: {fmt(user.last_sign_in_at)}</div>}
          </div>

          {info === null && <div style={{ color: MUTED, margin: "0 2px 12px" }}>Lädt …</div>}
          {info && info.firms.length === 0 && <div style={{ ...card, color: MUTED, fontSize: 14 }}>Dieses Konto gehört zu keiner Firma. {isAdmin ? "Es ist ein Plattform-Konto." : ""}</div>}
          {info && info.firms.map((firm) => (
            <div key={firm.orgId} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{firm.name}</div>
                <span style={{ fontSize: 11, fontWeight: 650, background: "#E7ECF6", color: PRIMARY, borderRadius: 999, padding: "3px 10px" }}>{ROLE_LABEL[firm.role] || firm.role}</span>
              </div>
              <div style={{ fontSize: 12, color: MUTED, margin: "10px 0 6px" }}>Module</div>
              <div style={{ display: "grid", gap: 8 }}>
                {MODULES.map((mod) => {
                  const active = firm.products.includes(mod.product);
                  const canOpen = active && (!mod.planningOnly || firm.role !== "employee");
                  return (
                    <div key={mod.product} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: `1px solid ${active ? "#B7E1CB" : LINE}`, background: active ? "#F0FAF5" : "#FAFBFC", borderRadius: 12, padding: "9px 12px" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 650, color: active ? "#1F6347" : MUTED }}>{active ? "✓ " : "– "}{mod.short}</div>
                        <div style={{ fontSize: 12, color: MUTED }}>{mod.long} · {active ? "aktiv" : "nicht gebucht"}</div>
                      </div>
                      {canOpen && <a href={mod.href} style={{ ...ghost, padding: "6px 10px", fontSize: 13 }}>Öffnen</a>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <form onSubmit={submit} style={card} noValidate>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Passwort ändern</div>
        <PasswordField label="Aktuelles Passwort" value={f.current} onChange={(v) => setF({ ...f, current: v })} shown={show.current} onToggle={() => setShow({ ...show, current: !show.current })} autoComplete="current-password" />
        <PasswordField label="Neues Passwort" value={f.next} onChange={(v) => setF({ ...f, next: v })} shown={show.next} onToggle={() => setShow({ ...show, next: !show.next })} autoComplete="new-password" />
        <PasswordField label="Neues Passwort bestätigen" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} shown={show.confirm} onToggle={() => setShow({ ...show, confirm: !show.confirm })} autoComplete="new-password" />
        {(f.next !== "" || f.confirm !== "") && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: 13 }}>
            {rules.map((r) => <li key={r.text} style={{ color: r.ok ? "#1F6347" : MUTED }}>{r.ok ? "✓" : "○"} {r.text}</li>)}
          </ul>
        )}
        <button type="submit" disabled={!canSubmit} style={btn}>{busy ? "Moment …" : "Passwort ändern"}</button>
        {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ marginTop: 12, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, background: msg.kind === "ok" ? "#DDF2E8" : "#FCE5EA", color: msg.kind === "ok" ? "#1F6347" : "#8A2A3E" }}>{msg.kind === "ok" ? "✓ " : "✗ "}{msg.text}</div>}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Tipp: Ein langer Satz aus mehreren Wörtern mit Zahl und Zeichen ist sicher und leicht zu merken. Nutze es nirgendwo sonst.</div>
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!forced && isAdmin && <a href="/admin" style={ghost}>Plattform-Verwaltung</a>}
        {!forced && <a href={homeFor()} style={ghost}>Zurück zum Programm</a>}
        <button type="button" style={{ ...ghost, marginLeft: "auto" }} onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div>
    </>
  );
}
