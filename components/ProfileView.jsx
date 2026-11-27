"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";
import LetterheadCard from "./LetterheadCard";
import { tx, loc } from "../lib/i18n";
import { isPhoneEmail, loginName } from "../lib/phoneLogin";

const INK = "#1B2433", PRIMARY = "#243B6B", PAPER = "#E9EEF8", MUTED = "#6B7588", LINE = "#D9DEE7";
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende", office: "Büro" };
// the three modules: Labor / Allgemein / Personnel
const MODULES = [
  { product: "lab_planner", short: "Labor", long: "Dienstplaner Labor", href: "/labor", planningOnly: true },
  { product: "generic_planner", short: "Allgemein", long: "Dienstplaner allgemein", href: "/allgemein", planningOnly: true },
  { product: "employee_app", short: "Personnel", long: "Mitarbeiter-App", href: "/mitarbeiter", planningOnly: false },
  { product: "touren", short: "Touren", long: "Kunden & Aufträge", href: "/touren", roles: ["owner", "supervisor", "office"] },
];
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const fld = { display: "block", width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 76px 12px 12px", fontSize: 16, background: "#fff", color: INK };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 17, fontWeight: 650, padding: "13px 16px", cursor: "pointer", width: "100%" };
const ghost = { border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 15, fontWeight: 600, padding: "9px 12px", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const CSS = `.prof button{transition:transform .08s ease,filter .15s ease,opacity .15s ease}.prof button:not(:disabled):hover{filter:brightness(.95)}.prof button:not(:disabled):active{transform:scale(.97);filter:brightness(.9)}.prof button:disabled{opacity:.55;cursor:not-allowed}.prof a:active{transform:scale(.97)}`;

const fmt = (iso) => { try { return new Date(iso).toLocaleString(loc(), { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; } };
function updateError(msg) {
  const m = String(msg || "").toLowerCase();
  if (m.includes("different from the old")) return tx("Das neue Passwort muss sich vom alten unterscheiden.");
  if (m.includes("weak") || m.includes("least") || m.includes("short")) return tx("Das Passwort ist zu schwach oder zu kurz.");
  if (m.includes("reauth")) return tx("Bitte melde dich neu an und versuche es dann noch einmal.");
  if (m.includes("rate") || m.includes("too many")) return tx("Zu viele Versuche. Bitte kurz warten.");
  return msg || tx("Das Passwort konnte nicht geändert werden.");
}

function PasswordField({ label, value, onChange, shown, onToggle, autoComplete, hint }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: MUTED, marginBottom: 12 }}>{label}
      <span style={{ position: "relative", display: "block", marginTop: 4 }}>
        <input aria-label={label} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={fld} />
        <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={shown ? tx("{0} verbergen", label) : tx("{0} anzeigen", label)}
          style={{ position: "absolute", right: 6, top: 8, border: 0, background: "none", color: PRIMARY, fontSize: 13, fontWeight: 650, padding: "8px 10px", cursor: "pointer" }}>{shown ? tx("Verbergen") : tx("Anzeigen")}</button>
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
  // 27.11.2026: eigene Angaben (Name, Mobil, Personalnummer, Adresse, Registrierung) über /api/profil
  const [me, setMe] = useState(null);
  const [edit, setEdit] = useState(null);       // { first, last, phone }
  const [meMsg, setMeMsg] = useState(null);

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

  async function loadMe(s) {
    try {
      const res = await fetch("/api/profil", { headers: { Authorization: `Bearer ${s.access_token}` } });
      if (res.ok) setMe(await res.json());
    } catch (e) { /* optional */ }
  }
  useEffect(() => { if (session && !forced) loadMe(session); }, [session, forced]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveMe(e) {
    e.preventDefault();
    setMeMsg(null);
    try {
      const res = await fetch("/api/profil", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ first_name: edit.first, last_name: edit.last, phone: edit.phone }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || tx("Konnte nicht gespeichert werden."));
      setEdit(null); setMeMsg({ kind: "ok", text: tx("Gespeichert ✓") }); loadMe(session);
    } catch (err) { setMeMsg({ kind: "error", text: tx(err.message) }); }
  }

  const rules = useMemo(() => [
    { ok: f.next.length >= 12, text: tx("Mindestens 12 Zeichen") },
    { ok: f.next !== "" && f.next !== f.current, text: tx("Anders als das aktuelle Passwort") },
    { ok: f.next !== "" && f.next === f.confirm, text: tx("Beide neuen Passwörter sind gleich") },
  ], [f]);
  const canSubmit = f.current !== "" && rules.every((r) => r.ok) && !busy;

  function homeFor() {
    const firms = (info && info.firms) || [];
    const plans = (p) => firms.some((x) => ["owner", "supervisor", "planner"].includes(x.role) && x.products.includes(p));
    if (plans("lab_planner")) return "/labor";
    if (plans("generic_planner")) return "/allgemein";
    if (firms.some((x) => ["owner", "supervisor", "office"].includes(x.role) && x.products.includes("touren"))) return "/touren";
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
      if (chk.error) throw new Error(/rate|too many/i.test(chk.error.message) ? tx("Zu viele Versuche. Bitte kurz warten.") : tx("Das aktuelle Passwort ist nicht richtig."));
      // 2) set the new password
      const upd = await supabase.auth.updateUser({ password: f.next });
      if (upd.error) throw new Error(updateError(upd.error.message));
      // 3) release the "temporary password" lock (the database checks that the password really changed)
      await supabase.rpc("clear_first_login");
      setF({ current: "", next: "", confirm: "" }); setShow({ current: false, next: false, confirm: false });
      setMsg({ kind: "ok", text: forced ? tx("Passwort geändert. Du wirst gleich weitergeleitet.") : tx("Passwort geändert. Ab jetzt gilt das neue Passwort.") });
      if (!forced) window.dispatchEvent(new Event("password-changed"));
      if (forced) {
        // keep the confirmation visible, then load the right start page (a fresh load re-checks the lock, which is released now)
        const target = await (async () => {
          const mem = await supabase.from("memberships").select("user_id, role"); const prod = await supabase.from("org_products").select("org_id, product, enabled").eq("enabled", true);
          const mine = (mem.data || []).filter((m) => m.user_id === session.user.id);
          const planner = mine.some((m) => ["owner", "supervisor", "planner"].includes(m.role));
          if (planner && (prod.data || []).some((p) => p.product === "lab_planner")) return "/labor";
          if (planner && (prod.data || []).some((p) => p.product === "generic_planner")) return "/allgemein";
          if (mine.some((m) => ["owner", "supervisor", "office"].includes(m.role)) && (prod.data || []).some((p) => p.product === "touren")) return "/touren";
          if ((prod.data || []).some((p) => p.product === "employee_app")) return "/mitarbeiter";
          return "/profil";
        })();
        setTimeout(() => { window.location.href = target; }, 1400);
      }
    } catch (err) {
      setMsg({ kind: "error", text: err && err.message ? err.message : tx("Das Passwort konnte nicht geändert werden.") });
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

  if (!supabaseConfigured) return shell(<div style={{ ...card, background: "#FFF1D2" }}>{tx("Supabase ist nicht eingerichtet.")}</div>);
  if (session === undefined) return shell(<div style={{ color: MUTED }}>{tx("Lädt …")}</div>);
  if (!session) return shell(<><h1 style={{ fontSize: 24, fontWeight: 750, margin: "4px 0 14px" }}>{tx("Profil")}</h1><LoginForm title={tx("Anmelden")} /></>);

  const user = session.user;
  return shell(
    <>
      <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: "4px 0 14px" }}>{forced ? tx("Neues Passwort festlegen") : tx("Profil")}</h1>

      {forced && (
        <div role="alert" style={{ ...card, background: "#FFF1D2", border: "1px solid #F5D78A", fontSize: 14 }}>
          <b>{tx("Bitte lege jetzt dein eigenes Passwort fest.")}</b><br />
          {tx("Das Passwort, das du bekommen hast, war nur vorläufig. Erst danach kannst du das Programm benutzen.")}
        </div>
      )}

      {!forced && (
        <>
          <div style={card}>
            <div style={{ fontSize: 12, color: MUTED }}>{tx("Angemeldet als")}</div>
            <div style={{ fontSize: 17, fontWeight: 700, wordBreak: "break-all" }}>{loginName(user.email)}</div>
            {user.last_sign_in_at && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{tx("Letzte Anmeldung:")} {fmt(user.last_sign_in_at)}</div>}
          </div>

          {/* Mitarbeitende mit Platz im Plan: ihre Angaben stehen unten bei der Firma (gepflegt von der Leitung) */}
          {me && !(me.firms || []).some((x) => x.staff) && (
            <div style={card} data-my-data>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{tx("Meine Angaben")}</div>
                {!edit && <button type="button" style={{ ...ghost, padding: "6px 12px", fontSize: 13 }} onClick={() => { setMeMsg(null); setEdit({ first: me.firstName || "", last: me.lastName || "", phone: me.phone || "" }); }}>{tx("Bearbeiten")}</button>}
              </div>
              {edit ? (
                <form onSubmit={saveMe}>
                  {[["first", tx("Vorname")], ["last", tx("Nachname")], ["phone", tx("Mobil / WhatsApp")]].map(([k, l]) => (
                    <label key={k} style={{ display: "block", fontSize: 13, color: MUTED, marginBottom: 10 }}>{l}
                      <input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} type={k === "phone" ? "tel" : "text"} maxLength={k === "phone" ? 40 : 80} style={{ ...fld, padding: "10px 12px", marginTop: 4 }} />
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={{ ...btn, width: "auto", fontSize: 15, padding: "10px 16px" }}>{tx("Speichern")}</button>
                    <button type="button" style={ghost} onClick={() => setEdit(null)}>{tx("Abbrechen")}</button>
                  </div>
                </form>
              ) : (
                <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0, fontSize: 14 }}>
                  {[[tx("Vorname"), me.firstName], [tx("Nachname"), me.lastName], [tx("Mobil / WhatsApp"), me.phone], [tx("Personalnummer"), me.personnelNo], [isPhoneEmail(me.email) ? tx("Handynummer") : tx("E-Mail"), loginName(me.email)]].filter(([, v]) => v).map(([k, v]) => (
                    <React.Fragment key={k}><dt style={{ color: MUTED }}>{k}</dt><dd style={{ margin: 0, fontWeight: 600, wordBreak: "break-word" }}>{v}</dd></React.Fragment>
                  ))}
                  {!me.firstName && !me.lastName && <><dt style={{ color: MUTED }}>{tx("Name")}</dt><dd style={{ margin: 0, color: MUTED }}>{tx("noch nicht eingetragen")}</dd></>}
                </dl>
              )}
              {meMsg && <div role={meMsg.kind === "error" ? "alert" : "status"} style={{ marginTop: 10, fontSize: 13, color: meMsg.kind === "error" ? "#8A1C1C" : "#1F6347" }}>{meMsg.text}</div>}
            </div>
          )}

          {info === null && <div style={{ color: MUTED, margin: "0 2px 12px" }}>{tx("Lädt …")}</div>}
          {info && info.firms.length === 0 && <div style={{ ...card, color: MUTED, fontSize: 14 }}>{tx("Dieses Konto gehört zu keiner Firma.")} {isAdmin ? tx("Es ist ein Plattform-Konto.") : ""}</div>}
          {info && info.firms.map((firm) => (
            <div key={firm.orgId} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{firm.name}</div>
                <span style={{ fontSize: 11, fontWeight: 650, background: "#E7ECF6", color: PRIMARY, borderRadius: 999, padding: "3px 10px" }}>{tx(ROLE_LABEL[firm.role] || firm.role)}</span>
              </div>
              {(() => {
                const x = me && me.firms ? me.firms.find((y) => y.orgId === firm.orgId) : null;
                if (!x) return null;
                const IND = { cleaning: "Reinigung", care: "Pflege & Betreuung", practice: "Praxis oder Labor", facility: "Hausmeister & Technik", other: "Andere" };
                const COUNTRY = { DE: "Deutschland", AE: "Vereinigte Arabische Emirate", OTHER: "Anderes Land" };
                const rows = [];
                if (x.staff) {
                  rows.push([tx("Name im Plan"), x.staff.name], [tx("Mobil / WhatsApp"), x.staff.phone], [tx("Personalnummer"), x.staff.personnel_no],
                    [tx("Vertragsstunden pro Woche"), x.staff.weekly_hours != null ? String(x.staff.weekly_hours) : null], [tx("Privatwohnung"), x.staff.home_address]);
                  if (x.staff.home_address) rows.push([tx("Einwilligung Fahrdienst"), x.staff.home_consent_on ? tx("unterschrieben am {0}", x.staff.home_consent_on.split("-").reverse().join(".")) : tx("fehlt noch")]);
                  if (x.staff.place) {
                    const PK = { accommodation: "Firmenunterkunft", office: "Büro", depot: "Lager", other: "Ort" };
                    rows.push([tx(PK[x.staff.place.kind] || "Ort"), [x.staff.place.name, x.staff.place.address].filter(Boolean).join(" – ")]);
                  }
                }
                if (x.registration) {
                  rows.push([tx("Firma (Registrierung)"), x.registration.company], [tx("Telefon (Registrierung)"), x.registration.phone],
                    [tx("Land"), x.registration.country ? tx(COUNTRY[x.registration.country] || x.registration.country) : null],
                    [tx("Branche"), x.registration.industry ? tx(IND[x.registration.industry] || x.registration.industry) : null], [tx("Anzahl Mitarbeitende"), x.registration.size]);
                }
                const shown = rows.filter(([, v]) => v);
                if (!shown.length) return null;
                return (
                  <dl data-firm-data style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: "10px 0 0", fontSize: 14 }}>
                    {shown.map(([k, v]) => <React.Fragment key={k}><dt style={{ color: MUTED }}>{k}</dt><dd style={{ margin: 0, fontWeight: 600, wordBreak: "break-word" }}>{v}</dd></React.Fragment>)}
                    {x.staff && <dd style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: MUTED }}>{tx("Diese Angaben pflegt die Leitung unter „Personal“.")}</dd>}
                  </dl>
                );
              })()}
              {["owner", "supervisor", "office"].includes(firm.role) && <LetterheadCard supabase={supabase} orgId={firm.orgId} role={firm.role} />}
              <div style={{ fontSize: 12, color: MUTED, margin: "10px 0 6px" }}>{tx("Module")}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {/* 27.11.2026 (Wunsch): nur gebuchte Module zeigen – nicht gebuchte nicht mehr ausgegraut */}
                {MODULES.filter((mod) => firm.products.includes(mod.product) && (mod.roles ? mod.roles.includes(firm.role) : (!mod.planningOnly || ["owner", "supervisor", "planner"].includes(firm.role)))).map((mod) => {
                  const active = firm.products.includes(mod.product);
                  const canOpen = active && (mod.roles ? mod.roles.includes(firm.role) : (!mod.planningOnly || ["owner", "supervisor", "planner"].includes(firm.role)));
                  return (
                    <div key={mod.product} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: `1px solid ${active ? "#B7E1CB" : LINE}`, background: active ? "#F0FAF5" : "#FAFBFC", borderRadius: 12, padding: "9px 12px" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 650, color: active ? "#1F6347" : MUTED }}>{active ? "✓ " : "– "}{tx(mod.short)}</div>
                        <div style={{ fontSize: 12, color: MUTED }}>{tx(mod.long)} · {active ? tx("aktiv") : tx("nicht gebucht")}</div>
                      </div>
                      {canOpen && <a href={mod.href} style={{ ...ghost, padding: "6px 10px", fontSize: 13 }}>{tx("Öffnen")}</a>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <form onSubmit={submit} style={card} noValidate>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{tx("Passwort ändern")}</div>
        <PasswordField label={tx("Aktuelles Passwort")} value={f.current} onChange={(v) => setF({ ...f, current: v })} shown={show.current} onToggle={() => setShow({ ...show, current: !show.current })} autoComplete="current-password" />
        <PasswordField label={tx("Neues Passwort")} value={f.next} onChange={(v) => setF({ ...f, next: v })} shown={show.next} onToggle={() => setShow({ ...show, next: !show.next })} autoComplete="new-password" />
        <PasswordField label={tx("Neues Passwort bestätigen")} value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} shown={show.confirm} onToggle={() => setShow({ ...show, confirm: !show.confirm })} autoComplete="new-password" />
        {(f.next !== "" || f.confirm !== "") && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: 13 }}>
            {rules.map((r) => <li key={r.text} style={{ color: r.ok ? "#1F6347" : MUTED }}>{r.ok ? "✓" : "○"} {r.text}</li>)}
          </ul>
        )}
        <button type="submit" disabled={!canSubmit} style={btn}>{busy ? tx("Moment …") : tx("Passwort ändern")}</button>
        {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ marginTop: 12, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, background: msg.kind === "ok" ? "#DDF2E8" : "#FCE5EA", color: msg.kind === "ok" ? "#1F6347" : "#8A2A3E" }}>{msg.kind === "ok" ? "✓ " : "✗ "}{tx(msg.text)}</div>}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>{tx("Tipp: Ein langer Satz aus mehreren Wörtern mit Zahl und Zeichen ist sicher und leicht zu merken. Nutze es nirgendwo sonst.")}</div>
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!forced && isAdmin && <a href="/admin" style={ghost}>{tx("Plattform-Verwaltung")}</a>}
        {!forced && <a href={homeFor()} style={ghost}>{tx("Zurück zum Programm")}</a>}
        <button type="button" style={{ ...ghost, marginLeft: "auto" }} onClick={() => supabase.auth.signOut()}>{tx("Abmelden")}</button>
      </div>
    </>
  );
}
