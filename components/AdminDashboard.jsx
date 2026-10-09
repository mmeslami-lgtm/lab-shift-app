"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";

const INK = "#1B2433", PRIMARY = "#243B6B", PAPER = "#E9EEF8", MUTED = "#6B7588", LINE = "#D9DEE7";
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App" };
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const btn = { border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 14, fontWeight: 650, padding: "10px 14px", cursor: "pointer" };
const ghost = { border: `1px solid ${LINE}`, borderRadius: 10, background: "#fff", color: INK, fontSize: 13, fontWeight: 600, padding: "7px 10px", cursor: "pointer" };
const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 15, background: "#fff", color: INK };
const errBox = { marginTop: 10, background: "#FCE5EA", color: "#8A2A3E", borderRadius: 10, padding: "8px 10px", fontSize: 14 };
const fmt = (iso) => { try { return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } };

// Every button gives feedback: it shrinks while pressed, shows "Moment …" while it works, and a short message
// (toast) confirms the result wherever the page is scrolled to.
const CSS = `
.adm button{transition:transform .08s ease,filter .15s ease,opacity .15s ease}
.adm button:not(:disabled):hover{filter:brightness(.95)}
.adm button:not(:disabled):active{transform:scale(.96);filter:brightness(.88)}
.adm button:disabled{opacity:.55;cursor:not-allowed}
.adm button:focus-visible,.adm input:focus-visible,.adm select:focus-visible{outline:2px solid ${PRIMARY};outline-offset:2px}
@keyframes admToast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
`;

// Platform administration for the operator: all companies, products, accounts. The page only shows what the
// server route allows (it checks platform_admins itself). Nothing secret lives here.
export default function AdminDashboard() {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: "loading" });
  const [secret, setSecret] = useState(null);   // { title, email, password } shown once
  const [busyKey, setBusyKey] = useState("");   // which button is working right now ("" = none)
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);     // { text, kind } short confirmation, visible wherever you are
  const [copied, setCopied] = useState("");     // "ok" | "fail" | ""
  const [nf, setNf] = useState({ name: "", ownerEmail: "", password: "", products: { generic_planner: true, employee_app: true } });
  const [open, setOpen] = useState(null);
  const [mf, setMf] = useState({ email: "", role: "supervisor", staffId: "", password: "" });
  const [mErr, setMErr] = useState("");
  const [nErr, setNErr] = useState("");
  const toastTimer = useRef(null);
  const copyTimer = useRef(null);
  const pwRef = useRef(null);
  const busy = busyKey !== "";

  const say = useCallback((text, kind = "ok") => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const api = useCallback(async (method, body) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session ? data.session.access_token : "";
    const res = await fetch("/api/admin", { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    let out = {}; try { out = await res.json(); } catch (e) { /* ignore */ }
    return { status: res.status, ...out };
  }, []);

  const load = useCallback(async () => {
    const r = await api("GET");
    if (r.status === 200) setState({ status: "ok", me: r.me, firms: r.firms });
    else if (r.status === 403) setState({ status: "forbidden" });
    else if (r.status === 401) setState({ status: "login" });
    else setState({ status: "error", message: r.error || "Fehler" });
  }, [api]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setState({ status: "login" }); return; }
    setState({ status: "loading" }); load();
  }, [session, load]);

  // key: which button is pressed (it shows "Moment …"); okText: confirmation shown as a toast;
  // onError: optional callback so a form can show its own message right below its button.
  async function act(body, { title, key, okText, onError } = {}) {
    setBusyKey(key || "x"); setErr(""); if (onError) onError("");
    const r = await api("POST", body);
    setBusyKey("");
    if (!r.ok) {
      const msg = r.error || "Aktion fehlgeschlagen.";
      if (onError) onError(msg); else { setErr(msg); window.scrollTo({ top: 0, behavior: "smooth" }); }
      say(msg, "error");
      return false;
    }
    if (r.password) { setSecret({ title: title || "Zugangsdaten", email: r.email, password: r.password }); setCopied(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
    say(okText || "Erledigt.");
    await load(); return true;
  }
  const label = (key, text) => (busyKey === key ? "Moment …" : text);

  async function copyPassword() {
    if (!secret) return;
    let ok = false;
    try { await navigator.clipboard.writeText(secret.password); ok = true; } catch (e) { ok = false; }
    if (!ok && pwRef.current) { // fallback: select the password so Ctrl+C works
      const sel = window.getSelection(); const range = document.createRange(); range.selectNodeContents(pwRef.current); sel.removeAllRanges(); sel.addRange(range);
    }
    setCopied(ok ? "ok" : "fail");
    say(ok ? "Passwort kopiert. Jetzt mit Strg+V einfügen." : "Kopieren nicht möglich. Das Passwort ist markiert, bitte Strg+C drücken.", ok ? "ok" : "error");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 2500);
  }

  const shell = (children) => (
    <div dir="ltr" className="adm" style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>{children}</div>
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 50, maxWidth: "92vw", animation: "admToast .2s ease", background: toast.kind === "error" ? "#8A2A3E" : "#1F6347", color: "#fff", padding: "11px 16px", borderRadius: 14, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
          {toast.kind === "error" ? "✗ " : "✓ "}{toast.text}
        </div>
      )}
    </div>
  );

  if (!supabaseConfigured) return shell(<div style={{ ...card, background: "#FFF1D2" }}>Supabase ist nicht eingerichtet.</div>);
  if (state.status === "loading") return shell(<div style={{ color: MUTED }}>Lädt …</div>);
  if (state.status === "login") return shell(<><h1 style={{ fontSize: 24, fontWeight: 750, margin: "4px 0 14px" }}>Plattform-Verwaltung</h1><div style={{ maxWidth: 520 }}><LoginForm title="Anmelden" /></div></>);
  if (state.status === "forbidden") return shell(<><h1 style={{ fontSize: 22, fontWeight: 750 }}>Kein Zugriff</h1><div style={card}>Dieses Konto ist kein Plattform-Administrator.<div style={{ marginTop: 12 }}><button style={ghost} onClick={() => supabase.auth.signOut()}>Abmelden</button></div></div></>);
  if (state.status === "error") return shell(<div style={{ ...card, background: "#FCE5EA", color: "#8A2A3E" }}>Fehler: {state.message}</div>);

  const { firms, me } = state;
  const toggleProducts = (key) => setNf((f) => ({ ...f, products: { ...f.products, [key]: !f.products[key] } }));

  return shell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, color: MUTED }}>Angemeldet als {me}</div><h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: 0 }}>Plattform-Verwaltung</h1></div>
        <button style={ghost} onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div>

      {err && <div role="alert" style={{ ...card, background: "#FCE5EA", color: "#8A2A3E", fontSize: 14 }}>{err}</div>}
      {secret && (
        <div style={{ ...card, background: "#FFF1D2", border: "1px solid #F5D78A" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{secret.title}: nur jetzt sichtbar!</div>
          <div style={{ fontSize: 14 }}>E-Mail: <b>{secret.email}</b></div>
          <div style={{ fontSize: 14, margin: "4px 0 8px" }}>Passwort: <code ref={pwRef} title="Ein Klick markiert das ganze Passwort" style={{ background: "#fff", padding: "3px 8px", borderRadius: 8, fontSize: 15, userSelect: "all", cursor: "text" }}>{secret.password}</code></div>
          <div style={{ fontSize: 12, color: "#7A4E00", marginBottom: 10 }}>Das Passwort wird nirgends gespeichert und kann nicht erneut angezeigt werden. Schicke E-Mail und Passwort in zwei getrennten Nachrichten.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...ghost, background: copied === "ok" ? "#DDF2E8" : copied === "fail" ? "#FCE5EA" : "#fff", color: copied === "ok" ? "#1F6347" : copied === "fail" ? "#8A2A3E" : INK }} onClick={copyPassword}>
              {copied === "ok" ? "✓ Kopiert" : copied === "fail" ? "Markiert, bitte Strg+C" : "Passwort kopieren"}
            </button>
            <button style={ghost} onClick={() => { setSecret(null); say("Zugangsdaten geschlossen."); }}>Erledigt, schließen</button>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Neue Firma</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={{ fontSize: 12, color: MUTED }}>Firmenname<input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} style={fld} placeholder="z. B. Labor Müller GmbH" /></label>
          <label style={{ fontSize: 12, color: MUTED }}>E-Mail des Inhabers<input type="email" value={nf.ownerEmail} onChange={(e) => setNf({ ...nf, ownerEmail: e.target.value })} style={fld} /></label>
          <label style={{ fontSize: 12, color: MUTED }}>Passwort (leer = wird erzeugt)<input type="text" autoComplete="off" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} style={fld} /></label>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0" }}>
          {Object.keys(PRODUCT_LABEL).map((k) => <label key={k} style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!nf.products[k]} onChange={() => toggleProducts(k)} />{PRODUCT_LABEL[k]}</label>)}
        </div>
        <button style={btn} disabled={busy} onClick={async () => {
          const ok = await act({ action: "create_org", name: nf.name, ownerEmail: nf.ownerEmail, password: nf.password, products: Object.keys(nf.products).filter((k) => nf.products[k]) }, { title: "Zugang des Inhabers", key: "newfirm", okText: `Firma „${nf.name.trim()}“ angelegt.`, onError: setNErr });
          if (ok) setNf({ name: "", ownerEmail: "", password: "", products: nf.products });
        }}>{label("newfirm", "Firma anlegen")}</button>
        {nErr && <div role="alert" style={errBox}>{nErr}</div>}
      </div>

      <div style={{ fontSize: 14, color: MUTED, margin: "6px 2px 8px" }}>{firms.length} Firmen</div>
      {firms.map((f) => (
        <div key={f.id} style={{ ...card, opacity: f.active ? 1 : 0.75 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{f.name}</span>
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 650, borderRadius: 999, padding: "2px 9px", background: f.active ? "#DDF2E8" : "#FCE5EA", color: f.active ? "#1F6347" : "#8A2A3E" }}>{f.active ? "aktiv" : "deaktiviert"}</span>
              <div style={{ fontSize: 12, color: MUTED }}>seit {fmt(f.created_at)} · {f.staff.length} Personen · {f.members.length} Konten</div>
            </div>
            <button style={ghost} disabled={busy} onClick={() => { if (f.active && !window.confirm(`„${f.name}“ deaktivieren? Niemand aus dieser Firma kann sich dann noch anmelden. Daten bleiben erhalten.`)) return; act({ action: "set_org_active", orgId: f.id, active: !f.active }, { key: "act" + f.id, okText: f.active ? `„${f.name}“ deaktiviert.` : `„${f.name}“ aktiviert.` }); }}>{label("act" + f.id, f.active ? "Deaktivieren" : "Aktivieren")}</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
            {Object.keys(PRODUCT_LABEL).map((k) => (
              <button key={k} disabled={busy} onClick={() => act({ action: "set_product", orgId: f.id, product: k, enabled: !f.products[k] }, { key: "p" + f.id + k, okText: `${PRODUCT_LABEL[k]} für „${f.name}“ ${f.products[k] ? "ausgeschaltet" : "eingeschaltet"}.` })}
                style={{ ...ghost, background: f.products[k] ? "#DDF2E8" : "#fff", color: f.products[k] ? "#1F6347" : MUTED, borderColor: f.products[k] ? "#B7E1CB" : LINE }}>
                {busyKey === "p" + f.id + k ? "Moment …" : (f.products[k] ? "✓ " : "+ ") + PRODUCT_LABEL[k]}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", minWidth: 520 }}>
              <thead><tr style={{ textAlign: "left", color: MUTED }}><th style={{ padding: "4px 6px" }}>Konto</th><th style={{ padding: "4px 6px" }}>Rolle</th><th style={{ padding: "4px 6px" }}>Person</th><th style={{ padding: "4px 6px" }}>zuletzt angemeldet</th><th /></tr></thead>
              <tbody>
                {f.members.map((m) => (
                  <tr key={m.userId} style={{ borderTop: "1px solid #EEF0F4" }}>
                    <td style={{ padding: "6px", fontWeight: 600 }}>{m.email}</td>
                    <td style={{ padding: "6px" }}>{ROLE_LABEL[m.role] || m.role}</td>
                    <td style={{ padding: "6px", color: MUTED }}>{m.staffName || "–"}</td>
                    <td style={{ padding: "6px", color: MUTED }}>{m.lastSignIn ? fmt(m.lastSignIn) : "noch nie"}</td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap", textAlign: "right" }}>
                      <button style={ghost} disabled={busy} onClick={() => { if (window.confirm(`Neues Passwort für ${m.email} erzeugen? Das alte Passwort gilt dann nicht mehr.`)) act({ action: "reset_password", email: m.email }, { title: "Neues Passwort", key: "pw" + m.userId, okText: `Neues Passwort für ${m.email} erzeugt. Es steht oben auf der Seite.` }); }}>{label("pw" + m.userId, "Neues Passwort")}</button>
                      {m.role !== "owner" && <button style={{ ...ghost, marginLeft: 6, color: "#B3263E" }} disabled={busy} onClick={() => { if (window.confirm(`${m.email} aus „${f.name}“ entfernen?`)) act({ action: "remove_member", orgId: f.id, userId: m.userId }, { key: "rm" + m.userId, okText: `${m.email} entfernt.` }); }}>{label("rm" + m.userId, "Entfernen")}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}>
            <button style={ghost} onClick={() => { setOpen(open === f.id ? null : f.id); setMErr(""); setMf({ email: "", role: "supervisor", staffId: "", password: "" }); }}>{open === f.id ? "Abbrechen" : "+ Konto hinzufügen"}</button>
          </div>
          {open === f.id && (
            <div style={{ marginTop: 10, background: PAPER, borderRadius: 14, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <label style={{ fontSize: 12, color: MUTED }}>E-Mail<input type="email" value={mf.email} onChange={(e) => setMf({ ...mf, email: e.target.value })} style={fld} /></label>
                <label style={{ fontSize: 12, color: MUTED }}>Rolle
                  <select value={mf.role} onChange={(e) => setMf({ ...mf, role: e.target.value, staffId: "" })} style={fld}>
                    <option value="supervisor">Leitung</option><option value="employee">Mitarbeitende</option><option value="planner">Schichtplaner</option>
                  </select>
                </label>
                {mf.role === "employee" && (
                  <label style={{ fontSize: 12, color: MUTED }}>Person
                    <select value={mf.staffId} onChange={(e) => setMf({ ...mf, staffId: e.target.value })} style={fld}>
                      <option value="">– wählen –</option>
                      {f.staff.filter((s) => !s.hasLogin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                <label style={{ fontSize: 12, color: MUTED }}>Passwort (leer = wird erzeugt)<input type="text" autoComplete="off" value={mf.password} onChange={(e) => setMf({ ...mf, password: e.target.value })} style={fld} /></label>
              </div>
              {mf.role === "employee" && f.staff.filter((s) => !s.hasLogin).length === 0 && <div style={{ fontSize: 12, color: "#7A4E00", marginTop: 8 }}>Alle Personen dieser Firma haben schon ein Konto. Neue Personen legt die Leitung im Dienstplaner an („Personen in Datenbank speichern“).</div>}
              <button style={{ ...btn, marginTop: 10 }} disabled={busy} onClick={async () => { const ok = await act({ action: "add_member", orgId: f.id, ...mf }, { title: "Zugang des neuen Kontos", key: "add" + f.id, okText: `Konto ${mf.email.trim()} angelegt.`, onError: setMErr }); if (ok) setOpen(null); }}>{label("add" + f.id, "Konto anlegen")}</button>
              {mErr && <div role="alert" style={errBox}>{mErr}</div>}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
