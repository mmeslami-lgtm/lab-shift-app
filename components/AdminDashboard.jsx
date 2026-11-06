"use client";

import { FEATURES } from "../lib/features";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";
import { LEGAL_DOCS } from "../lib/legal";

const LEGAL_LABEL = { testphase: "Nutzungsbedingungen", avv: "AVV", fiktive_daten: "nur fiktive Daten" };
const LEGAL_HREF = Object.fromEntries(LEGAL_DOCS.filter((d) => d.href).map((d) => [d.key, d.href]));

const INK = "#1B2433", PRIMARY = "#243B6B", PAPER = "#E9EEF8", MUTED = "#6B7588", LINE = "#D9DEE7";
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App", time_tracking: "Zeiterfassung" };
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };
const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const btn = { border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 15, fontWeight: 650, padding: "10px 14px", cursor: "pointer" };
const ghost = { border: "1.5px solid #9AAED0", borderRadius: 10, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "7px 10px", cursor: "pointer" };
const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 15, background: "#fff", color: INK };
// dunkelblaue Wechsel-Knöpfe zwischen /admin und /admin/finanzen
const navBtn = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 15, fontWeight: 650, padding: "9px 14px", textDecoration: "none", whiteSpace: "nowrap" };
// Abmelden: rot, damit er sich klar von den anderen Knöpfen unterscheidet
const logoutBtn = { border: 0, borderRadius: 12, background: "#C0262D", color: "#fff", fontSize: 15, fontWeight: 650, padding: "9px 14px", cursor: "pointer", whiteSpace: "nowrap" };
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
.adm .dg-row::-webkit-details-marker{display:none}
@keyframes admToast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
`;

// Platform administration for the operator: all companies, products, accounts. The page only shows what the
// server route allows (it checks platform_admins itself). Nothing secret lives here.
export default function AdminDashboard({ view = "admin" }) {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: "loading" });
  const [secret, setSecret] = useState(null);   // { title, email, password } shown once
  const [busyKey, setBusyKey] = useState("");   // which button is working right now ("" = none)
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);     // { text, kind } short confirmation, visible wherever you are
  const [copied, setCopied] = useState("");     // "ok" | "fail" | ""
  const [nf, setNf] = useState({ name: "", ownerEmail: "", password: "", products: { generic_planner: true, employee_app: true } });
  const [open, setOpen] = useState(null);
  const [showDone, setShowDone] = useState(false);
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
    if (r.status === 200) setState({ status: "ok", me: r.me, firms: r.firms, demo: r.demoRequests || [] });
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
  if (state.status === "forbidden") return shell(<><h1 style={{ fontSize: 22, fontWeight: 750 }}>Kein Zugriff</h1><div style={card}>Dieses Konto ist kein Plattform-Administrator.<div style={{ marginTop: 12 }}><button style={logoutBtn} onClick={() => supabase.auth.signOut()}>Abmelden</button></div></div></>);
  if (state.status === "error") return shell(<div style={{ ...card, background: "#FCE5EA", color: "#8A2A3E" }}>Fehler: {state.message}</div>);

  const { firms, me, demo = [] } = state;
  const demoOpen = demo.filter((d) => d.status !== "erledigt").length;
  const demoShown = showDone ? demo : demo.filter((d) => d.status !== "erledigt");
  const toggleProducts = (key) => setNf((f) => ({ ...f, products: { ...f.products, [key]: !f.products[key] } }));

  // Finanzen = eigene Seite /admin/finanzen (gleiche Anmeldung, gleiche Daten, nur Abrechnung).
  if (view === "finanzen") {
    const sorted = [...firms].sort((a, b) => {
      const rank = (f) => { const k = (dueState(f.billing) || {}).kind; return k === "over" ? 0 : k === "soon" ? 1 : f.billing ? 2 : 3; };
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "de");
    });
    return shell(
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div><div style={{ fontSize: 13, color: MUTED }}>Angemeldet als {me}</div><h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: 0 }}>Finanzen</h1></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="/admin" data-nav-admin style={navBtn}>← Plattform-Verwaltung</a>
            <button style={logoutBtn} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </div>
        </div>
        {err && <div role="alert" style={{ ...errBox, marginBottom: 12 }}>{err}</div>}
        <BillingSummary firms={firms} always />
        <div style={{ fontSize: 13, color: MUTED, margin: "2px 2px 8px" }}>Von Hand: Preis und Fälligkeit je Firma eintragen, eingegangene Zahlungen bestätigen. Überfällige stehen oben.</div>
        {sorted.map((f) => (
          <div key={f.id} data-fin-firm={f.id} style={{ ...card, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <b style={{ fontSize: 16 }}>{f.name}</b>
              {!f.active && <span style={{ fontSize: 12, color: "#8A2A3E" }}>deaktiviert</span>}
              <TrialInfo f={f} compact />
            </div>
            <BillingBox f={f} act={act} busy={busy} label={label} />
          </div>
        ))}
      </>
    );
  }

  return shell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div><div style={{ fontSize: 13, color: MUTED }}>Angemeldet als {me}</div><h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: 0 }}>Plattform-Verwaltung</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FinanzenLink firms={firms} />
          <button style={logoutBtn} onClick={() => supabase.auth.signOut()}>Abmelden</button>
        </div>
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

      <details style={card} data-demo-list open={demoOpen > 0 ? true : undefined}>
        <summary style={{ cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: demoOpen > 0 ? "#C0262D" : INK }}>Demo-Anfragen</span>
          {demoOpen > 0 && <span data-demo-count style={{ marginLeft: 8, display: "inline-block", minWidth: 22, textAlign: "center", borderRadius: 999, background: "#C0262D", color: "#fff", fontSize: 13, fontWeight: 750, padding: "2px 7px" }}>{demoOpen}</span>}
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: MUTED }}>{demo.length === 0 ? "noch keine" : `${demo.length} insgesamt`}</span>
        </summary>
        {demo.length > 0 && (
          <>
            {demo.length > demoOpen && (
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: MUTED, margin: "8px 0 0", cursor: "pointer" }}>
                <input type="checkbox" data-demo-showdone checked={showDone} onChange={() => setShowDone((v) => !v)} />
                Erledigte anzeigen ({demo.length - demoOpen})
              </label>
            )}
            <div data-demo-scroll style={{ marginTop: 8, maxHeight: 380, overflowY: "auto", border: `1px solid ${LINE}`, borderRadius: 12 }}>
              {demoShown.length === 0 && <div style={{ padding: "10px 12px", fontSize: 14, color: MUTED }}>Keine offenen Anfragen.</div>}
              {demoShown.map((d, i) => {
                const done = d.status === "erledigt";
                return (
                  <details key={d.id} data-demo-row={d.id} style={{ borderTop: i ? `1px solid ${LINE}` : "none", background: done ? "#F7F8FB" : "#fff" }}>
                    <summary className="dg-row" style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", fontSize: 14, listStyle: "none" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: done ? "#AEB8CB" : "#C0262D", flex: "0 0 auto" }} />
                      <span style={{ fontWeight: 650, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: done ? MUTED : INK }}>{d.company}</span>
                      <span style={{ fontSize: 12, color: MUTED, flex: "0 0 auto" }}>{fmt(d.created_at)}</span>
                      <span style={{ fontSize: 11, fontWeight: 650, borderRadius: 999, padding: "2px 8px", flex: "0 0 auto", background: done ? "#EEF0F4" : "#FCE5EA", color: done ? MUTED : "#8A2A3E" }}>{done ? "erledigt" : "offen"}</span>
                    </summary>
                    <div style={{ padding: "0 12px 10px 30px" }}>
                      <div style={{ fontSize: 14 }}>
                        <a href={`mailto:${d.email}?subject=${encodeURIComponent("Ihre Demo-Anfrage bei Dienstigo")}`} style={{ color: PRIMARY, fontWeight: 600 }}>{d.email}</a>
                        {d.phone && <> · <a href={`tel:${d.phone.replace(/[^0-9+]/g, "")}`} style={{ color: PRIMARY }}>{d.phone}</a></>}
                      </div>
                      {d.message && <div style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{d.message}</div>}
                      <div style={{ fontSize: 12, marginTop: 6, color: d.mail_sent ? "#1F6347" : "#8A2A3E" }}>{d.mail_sent ? "✉ E-Mail an info@ gesendet" : `✉ E-Mail nicht gesendet${d.mail_error ? ` (${d.mail_error})` : ""}`}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <button style={{ ...ghost, background: done ? "#fff" : "#DDF2E8", color: done ? INK : "#1F6347", borderColor: done ? LINE : "#B7E1CB" }} disabled={busy}
                          onClick={() => act({ action: "demo_status", id: d.id, done: !done }, { key: "dm" + d.id, okText: done ? `„${d.company}“ wieder offen.` : `„${d.company}“ erledigt.` })}>
                          {label("dm" + d.id, done ? "Wieder öffnen" : "Erledigt ✓")}
                        </button>
                        <button style={{ ...ghost, color: "#B3263E" }} disabled={busy}
                          onClick={() => { if (window.confirm(`Anfrage von „${d.company}“ endgültig löschen?`)) act({ action: "demo_delete", id: d.id }, { key: "dd" + d.id, okText: "Anfrage gelöscht." }); }}>
                          {label("dd" + d.id, "Löschen")}
                        </button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}
      </details>

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
              <button style={{ ...ghost, marginLeft: 8, padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => {
                const name = window.prompt(`Neuer Name für „${f.name}“:`, f.name);
                if (name === null || name.trim() === f.name) return;
                act({ action: "rename_org", orgId: f.id, name: name.trim() }, { key: "rn" + f.id, okText: `Firma heißt jetzt „${name.trim()}“.` });
              }}>{label("rn" + f.id, "Umbenennen")}</button>
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 650, borderRadius: 999, padding: "2px 9px", background: f.active ? "#DDF2E8" : "#FCE5EA", color: f.active ? "#1F6347" : "#8A2A3E" }}>{f.active ? "aktiv" : "deaktiviert"}</span>
              <div style={{ fontSize: 12, color: MUTED }}>seit {fmt(f.created_at)} · {f.staff.length} Personen · {f.members.length} Konten</div>
              <TrialInfo f={f} />
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
          <div data-trial-actions={f.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 10px" }}>
            <button style={ghost} disabled={busy} onClick={() => act({ action: "set_trial", orgId: f.id, mode: "start" }, { key: "ts" + f.id, okText: `Testphase für „${f.name}“: 14 Tage ab heute.` })}>
              {label("ts" + f.id, f.trialUntil ? "Testphase neu: 14 Tage ab heute" : "Testphase 14 Tage starten")}
            </button>
            {f.trialUntil && (
              <button style={{ ...ghost, background: "#DDF2E8", color: "#1F6347", borderColor: "#B7E1CB" }} disabled={busy} onClick={() => { if (window.confirm(`„${f.name}“ dauerhaft freischalten (keine Testphase mehr)?`)) act({ action: "set_trial", orgId: f.id, mode: "off" }, { key: "to" + f.id, okText: `„${f.name}“ ist dauerhaft freigeschaltet.` }); }}>
                {label("to" + f.id, "Dauerhaft freischalten")}
              </button>
            )}
          </div>
          {Object.keys(FEATURES).length > 0 && (
            <details style={{ margin: "0 0 10px" }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: MUTED }}>Funktionen nur für diese Firma ({Object.keys(FEATURES).filter((k) => f.features && f.features[k]).length} an)</summary>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {Object.keys(FEATURES).map((k) => {
                  const on = !!(f.features && f.features[k]);
                  return (
                    <button key={k} disabled={busy} onClick={() => act({ action: "set_feature", orgId: f.id, feature: k, enabled: !on }, { key: "f" + f.id + k, okText: `„${FEATURES[k]}“ für „${f.name}“ ${on ? "ausgeschaltet" : "eingeschaltet"}.` })}
                      style={{ ...ghost, background: on ? "#DDF2E8" : "#fff", color: on ? "#1F6347" : MUTED, borderColor: on ? "#B7E1CB" : LINE }}>
                      {busyKey === "f" + f.id + k ? "Moment …" : (on ? "✓ " : "+ ") + FEATURES[k]}
                    </button>
                  );
                })}
              </div>
            </details>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", minWidth: 520 }}>
              <thead><tr style={{ textAlign: "left", color: MUTED }}><th style={{ padding: "4px 6px" }}>Konto</th><th style={{ padding: "4px 6px" }}>Rolle</th><th style={{ padding: "4px 6px" }}>Person</th><th style={{ padding: "4px 6px" }}>zuletzt angemeldet</th><th /></tr></thead>
              <tbody>
                {f.members.map((m) => (
                  <tr key={m.userId} style={{ borderTop: "1px solid #EEF0F4" }}>
                    <td style={{ padding: "6px", fontWeight: 600 }}>{m.email}</td>
                    <td style={{ padding: "6px" }}>{ROLE_LABEL[m.role] || m.role}</td>
                    <td style={{ padding: "6px", color: MUTED }}>
                      {m.role === "employee" ? (m.staffName || "–") : (
                        <select aria-label={`Person für ${m.email}`} value={m.staffId || ""} disabled={busy} style={{ ...fld, marginTop: 0, padding: "4px 6px", fontSize: 12, width: "auto" }}
                          onChange={(e) => act({ action: "link_staff", orgId: f.id, userId: m.userId, staffId: e.target.value || null }, { key: "ls" + m.userId, okText: e.target.value ? "Person verknüpft – dieses Konto kann jetzt stempeln und „Meine Zeiten“ sehen." : "Verknüpfung entfernt." })}>
                          <option value="">– arbeitet nicht im Plan –</option>
                          {f.staff.filter((s) => !s.hasLogin || s.id === m.staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: "6px", color: MUTED }}>{m.lastSignIn ? fmt(m.lastSignIn) : "noch nie"}</td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap", textAlign: "right" }}>
                      <button style={{ ...ghost, marginRight: 6 }} disabled={busy} onClick={() => {
                        const email = window.prompt(`Neue E-Mail-Adresse für ${m.email}:\n\nDie Person meldet sich danach mit der neuen Adresse an. Das Passwort bleibt gleich.`, m.email);
                        if (email === null || email.trim().toLowerCase() === m.email.toLowerCase()) return;
                        act({ action: "change_email", userId: m.userId, email: email.trim() }, { key: "em" + m.userId, okText: `E-Mail geändert: ${email.trim().toLowerCase()}` });
                      }}>{label("em" + m.userId, "E-Mail ändern")}</button>
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
                {(
                  <label style={{ fontSize: 12, color: MUTED }}>{mf.role === "employee" ? "Person" : "Person (optional, wenn im Plan)"}
                    <select value={mf.staffId} onChange={(e) => setMf({ ...mf, staffId: e.target.value })} style={fld}>
                      <option value="">{mf.role === "employee" ? "– wählen –" : "– arbeitet nicht im Plan –"}</option>
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

// Testphase und Zustimmungen einer Firma (Skript 34): Restlaufzeit + wer wann welche Fassung angenommen hat.
function TrialInfo({ f, compact = false }) {
  const acc = f.acceptances || [];
  const day = (iso) => { try { return new Date(iso).toLocaleDateString("de-DE"); } catch (e) { return ""; } };
  let badge = null;
  if (f.trialUntil) {
    const left = Math.ceil((new Date(f.trialUntil).getTime() - Date.now()) / 86400000);
    const over = left <= 0;
    badge = (
      <div data-trial={f.id} style={{ fontSize: 12, marginTop: 4 }}>
        <span style={{ fontWeight: 650, borderRadius: 999, padding: "2px 9px", background: over ? "#FCE5EA" : "#FFF1D2", color: over ? "#8A2A3E" : "#7A4E00" }}>
          {over ? `Testphase abgelaufen am ${day(f.trialUntil)}` : `Testphase bis ${day(f.trialUntil)} · noch ${left} ${left === 1 ? "Tag" : "Tage"}`}
        </span>
      </div>
    );
  }
  if (compact) return badge;
  if (!badge && acc.length === 0) return null;
  return (
    <>
      {badge}
      <div data-acceptances={f.id} style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
        {acc.length === 0 ? "Zustimmungen: noch keine" : <>Zustimmungen: {acc.map((a, i) => (
          <span key={i}>{i ? " · " : ""}{LEGAL_HREF[a.doc] ? <a href={LEGAL_HREF[a.doc]} target="_blank" rel="noopener" style={{ color: PRIMARY }}>{LEGAL_LABEL[a.doc]}</a> : (LEGAL_LABEL[a.doc] || a.doc)} {a.version} am {fmt(a.at)} von {a.email || "?"}</span>
        ))}</>}
      </div>
    </>
  );
}

// ---------- Abrechnung von Hand (Skript 35) ----------
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const eur = (n) => Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dayDE = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
const daysUntil = (iso) => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(todayISO() + "T00:00:00Z")) / 86400000);

function dueState(b) {
  if (!b || !b.next_due) return null;
  const n = daysUntil(b.next_due);
  if (n < 0) return { kind: "over", text: `überfällig seit ${-n} ${n === -1 ? "Tag" : "Tagen"} (fällig ${dayDE(b.next_due)})`, bg: "#FCE5EA", fg: "#8A2A3E" };
  if (n <= 7) return { kind: "soon", text: n === 0 ? "heute fällig" : `fällig am ${dayDE(b.next_due)} (in ${n} ${n === 1 ? "Tag" : "Tagen"})`, bg: "#FFF1D2", fg: "#7A4E00" };
  return { kind: "ok", text: `bezahlt · nächste Zahlung am ${dayDE(b.next_due)}`, bg: "#DDF2E8", fg: "#1F6347" };
}

function BillingSummary({ firms, always = false }) {
  const billed = firms.filter((f) => f.billing && Number(f.billing.amount) > 0);
  if (billed.length === 0) return always ? <div style={{ ...card, fontSize: 14, color: MUTED }}>Noch keine zahlende Firma eingerichtet.</div> : null;
  const monthly = billed.reduce((s, f) => s + (f.billing.cycle === "jaehrlich" ? Number(f.billing.amount) / 12 : Number(f.billing.amount)), 0);
  const over = billed.filter((f) => (dueState(f.billing) || {}).kind === "over");
  return (
    <div data-billing-summary style={{ ...card, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
      <b>Abrechnung</b>
      <span>{billed.length} zahlende {billed.length === 1 ? "Firma" : "Firmen"}</span>
      <span>monatlich gesamt: <b>{eur(monthly)}</b> <span style={{ color: MUTED }}>netto, zzgl. MwSt.</span></span>
      <span style={{ fontWeight: 700, color: over.length ? "#C0262D" : "#1F6347" }}>{over.length ? `${over.length} überfällig: ${over.map((f) => f.name).join(", ")}` : "nichts überfällig ✓"}</span>
    </div>
  );
}

function BillingBox({ f, act, busy, label }) {
  const b = f.billing;
  const [mode, setMode] = useState(""); // "" | "edit" | "pay"
  const [ed, setEd] = useState({ amount: "", cycle: "monatlich", nextDue: "", note: "" });
  const [pay, setPay] = useState({ amount: "", paidOn: "" });
  const [err, setErr] = useState("");
  const st = dueState(b);
  const pays = f.payments || [];
  const small = { ...ghost, padding: "5px 9px", fontSize: 13, whiteSpace: "nowrap" };
  const inp = { ...fld, marginTop: 2, padding: "7px 9px", fontSize: 14 };

  const openEdit = () => { setEd({ amount: b ? String(b.amount).replace(".", ",") : "", cycle: b ? b.cycle : "monatlich", nextDue: b && b.next_due ? b.next_due : "", note: b && b.note ? b.note : "" }); setErr(""); setMode("edit"); };
  const openPay = () => { setPay({ amount: b ? String(b.amount).replace(".", ",") : "", paidOn: todayISO() }); setErr(""); setMode("pay"); };

  return (
    <div data-billing={f.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "8px 10px", margin: "0 0 10px", fontSize: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b>Abrechnung:</b>
        {!b ? <span style={{ color: MUTED }}>noch nicht eingerichtet</span> : (
          <span>{eur(b.amount)} / {b.cycle === "jaehrlich" ? "Jahr" : "Monat"} <span style={{ color: MUTED }}>zzgl. MwSt.</span></span>
        )}
        {st && <span data-billing-state={st.kind} style={{ fontSize: 12, fontWeight: 650, borderRadius: 999, padding: "2px 9px", background: st.bg, color: st.fg }}>{st.text}</span>}
        {b && b.note && <span style={{ fontSize: 12, color: MUTED }}>· {b.note}</span>}
        <span style={{ flex: "1 1 auto" }} />
        {b && b.next_due && <button style={{ ...small, background: "#DDF2E8", color: "#1F6347", borderColor: "#B7E1CB" }} disabled={busy} onClick={openPay}>Zahlung erhalten</button>}
        <button style={small} disabled={busy} onClick={openEdit}>{b ? "Bearbeiten" : "Einrichten"}</button>
      </div>

      {mode === "edit" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12, color: MUTED }}>Vereinbarter Preis netto (€)<input inputMode="decimal" value={ed.amount} onChange={(e) => setEd({ ...ed, amount: e.target.value })} style={inp} placeholder="z. B. 49,00" /></label>
          <label style={{ fontSize: 12, color: MUTED }}>Zahlweise<select value={ed.cycle} onChange={(e) => setEd({ ...ed, cycle: e.target.value })} style={inp}><option value="monatlich">monatlich</option><option value="jaehrlich">jährlich</option></select></label>
          <label style={{ fontSize: 12, color: MUTED }}>Nächste Zahlung fällig am<input type="date" value={ed.nextDue} onChange={(e) => setEd({ ...ed, nextDue: e.target.value })} style={inp} /></label>
          <label style={{ fontSize: 12, color: MUTED }}>Notiz (z. B. Rechnung per E-Mail)<input value={ed.note} maxLength={300} onChange={(e) => setEd({ ...ed, note: e.target.value })} style={inp} /></label>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", gridColumn: "1 / -1" }}>
            <button style={{ ...small, background: PRIMARY, color: "#fff", borderColor: PRIMARY, padding: "8px 16px", fontSize: 14 }} disabled={busy} onClick={async () => {
              const ok = await act({ action: "billing_save", orgId: f.id, amount: ed.amount, cycle: ed.cycle, nextDue: ed.nextDue || null, note: ed.note }, { key: "bs" + f.id, okText: `Abrechnung für „${f.name}“ gespeichert.`, onError: setErr });
              if (ok) setMode("");
            }}>{label("bs" + f.id, "Speichern")}</button>
            <button style={small} onClick={() => setMode("")}>Abbrechen</button>
          </div>
        </div>
      )}

      {mode === "pay" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12, color: MUTED }}>Tatsächlich erhalten (€)<input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} style={inp} /></label>
          <label style={{ fontSize: 12, color: MUTED }}>Eingegangen am<input type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} style={inp} /></label>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", gridColumn: "1 / -1" }}>
            <button style={{ ...small, background: "#1F6347", color: "#fff", borderColor: "#1F6347", padding: "8px 16px", fontSize: 14 }} disabled={busy} onClick={async () => {
              const ok = await act({ action: "billing_paid", orgId: f.id, amount: pay.amount, paidOn: pay.paidOn }, { key: "bp" + f.id, okText: `Zahlung von „${f.name}“ erfasst.`, onError: setErr });
              if (ok) setMode("");
            }}>{label("bp" + f.id, "Als bezahlt speichern")}</button>
            <button style={small} onClick={() => setMode("")}>Abbrechen</button>
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: MUTED }}>Bezahlt wird die Fälligkeit vom {dayDE(b.next_due)}; danach rückt die nächste Fälligkeit um einen {b.cycle === "jaehrlich" ? "Jahr" : "Monat"} weiter.</div>
        </div>
      )}

      {err && <div role="alert" style={{ ...errBox, marginTop: 8 }}>{err}</div>}

      {pays.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: MUTED }}>Letzte Zahlungen ({pays.length})</summary>
          {pays.map((p, i) => (
            <div key={p.id} data-payment={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0" }}>
              <span>{dayDE(p.paid_on)} · <b>{eur(p.amount)}</b>{p.for_due ? <span style={{ color: MUTED }}> · für Fälligkeit {dayDE(p.for_due)}</span> : null}</span>
              {i === 0 && <button style={{ ...small, padding: "2px 8px", fontSize: 12, color: "#B3263E" }} disabled={busy} onClick={() => { if (window.confirm(`Zahlung vom ${dayDE(p.paid_on)} über ${eur(p.amount)} löschen? Die Fälligkeit wird wieder offen.`)) act({ action: "billing_payment_delete", id: p.id }, { key: "pd" + p.id, okText: "Zahlung gelöscht." }); }}>{label("pd" + p.id, "Rückgängig")}</button>}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

// Dunkelblauer Knopf in /admin: Weg zur Seite Finanzen + rote Zahl bei überfälligen Zahlungen.
function FinanzenLink({ firms }) {
  const over = firms.filter((f) => (dueState(f.billing) || {}).kind === "over");
  return (
    <a href="/admin/finanzen" data-finanzen-link style={navBtn}>
      Finanzen →
      {over.length > 0 && <span style={{ fontSize: 12, fontWeight: 750, color: "#fff", background: "#C0262D", borderRadius: 999, padding: "1px 8px" }}>{over.length} überfällig</span>}
    </a>
  );
}
