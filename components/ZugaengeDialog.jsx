"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";
import { tx, loc, monthName, wdLong, wdShort, dm, dmy, isoDmy, dec } from "../lib/i18n";
import { cleanPhone, isPhoneEmail, loginName } from "../lib/phoneLogin";

// Popup "Zugänge" (Leitung / Inhaber): logins for the company's own employees.
// A temporary password is shown ONCE; at the first login the person chooses an own password.
export default function ZugaengeDialog({ onClose }) {
  const org = useContext(OrgContext);
  const [people, setPeople] = useState(null);
  const [managers, setManagers] = useState([]);
  const [myRole, setMyRole] = useState("");
  const [mgrForm, setMgrForm] = useState(null); // { role, email, staffId, first, last, phone, pno }
  const [editP, setEditP] = useState(null); // 27.11.2026: Name/Mobil/Personalnummer eines Leitungs-/Büro-Kontos ändern
  // Schichtplaner nur anbieten, wenn die Firma einen Dienstplan hat (sonst nutzlos, z. B. nur Touren)
  const hasPlanner = Array.isArray(org.products) && (org.products.includes("lab_planner") || org.products.includes("generic_planner"));
  const [form, setForm] = useState(null); // { staffId, email, phone, kind: "email" | "phone" }
  // Anmeldung mit Handynummer (23.11.2026): nur Firmen mit Touren – sonst bleibt alles wie vorher (nur E-Mail)
  const touren = Array.isArray(org.products) && org.products.includes("touren");
  const [secret, setSecret] = useState(null); // { name, email, password }
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState("");
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const api = useCallback(async (payload) => {
    const { data } = await org.supabase.auth.getSession();
    const res = await fetch("/api/zugang", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ ...payload, org_id: org.orgId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || tx("Fehler ({0})", res.status));
    return body;
  }, [org]);
  const load = useCallback(async () => {
    try { const b = await api({ action: "list" }); setPeople(b.people || []); setManagers(b.managers || []); setMyRole(b.myRole || ""); } catch (e) { setPeople([]); setMsg({ text: e.message, bad: true }); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") closeRef.current(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  async function run(key, payload, okText, after) {
    setBusy(key); setMsg({ text: "", bad: false });
    try { const b = await api(payload); if (after) after(b); if (okText) setMsg({ text: okText, bad: false }); await load(); }
    catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy("");
  }
  const createMgr = () => {
    if (!mgrForm.staffId && (!mgrForm.first.trim() || !mgrForm.last.trim())) { setMsg({ text: tx("Bitte Vor- und Nachnamen eintragen."), bad: true }); return; }
    run("cm", { action: "create", role: mgrForm.role, email: mgrForm.email, staff_id: mgrForm.staffId || undefined, first_name: mgrForm.first, last_name: mgrForm.last, phone_number: mgrForm.phone, personnel_no: mgrForm.pno }, "", (b) => { setMgrForm(null); setSecret({ name: b.name, email: b.email, password: b.password }); setCopied(false); });
  };
  const saveProfile = () => {
    if (!editP.first.trim() || !editP.last.trim()) { setMsg({ text: tx("Bitte Vor- und Nachnamen eintragen."), bad: true }); return; }
    run("p" + editP.userId, { action: "update_profile", user_id: editP.userId, first_name: editP.first, last_name: editP.last, phone_number: editP.phone, personnel_no: editP.pno }, tx("Gespeichert ✓"), () => setEditP(null));
  };
  const create = () => {
    let who = { email: form.email };
    if (touren && form.kind === "phone") {
      const n = cleanPhone(form.phone, org.country);
      if (!n) { setMsg({ text: tx("Bitte die Handynummer prüfen."), bad: true }); return; }
      who = { phone: n };
    }
    run("create", { action: "create", role: "employee", staff_id: form.staffId, ...who }, "", (b) => { setForm(null); setSecret({ name: b.name, email: b.email, password: b.password }); setCopied(false); });
  };
  const reset = (p) => { if (window.confirm(tx("Neues vorläufiges Passwort für {0} erzeugen? Das alte gilt dann nicht mehr.", p.name))) run("r" + p.userId, { action: "reset", user_id: p.userId }, "", (b) => { setSecret({ name: p.name, email: b.email, password: b.password }); setCopied(false); }); };
  const remove = (p) => { if (window.confirm(tx("Zugang von {0} entfernen? Die Person kann sich danach nicht mehr anmelden. Pläne und Zeiten bleiben erhalten.", p.name))) run("x" + p.userId, { action: "remove", user_id: p.userId }, tx("Zugang von {0} entfernt ✓", p.name)); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="zg-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="zg-title" className="text-base font-semibold">{tx("Zugänge")}</h2>
            <div className="mt-0.5 text-xs text-slate-500">{tx("Das vorläufige Passwort wird nur einmal angezeigt; beim ersten Anmelden wählt die Person ein eigenes.")}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">{tx("Schließen")}</button>
        </div>

        {secret && (
          <div role="status" className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-900">{tx("Zugangsdaten für ")}{secret.name}{tx(" – nur jetzt sichtbar")}</div>
            <div className="mt-1 text-sm">{isPhoneEmail(secret.email) ? tx("Handynummer: ") : tx("E-Mail: ")}<b>{loginName(secret.email)}</b></div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">{tx("Vorläufiges Passwort: ")}<code className="rounded bg-white px-2 py-1 font-mono text-base">{secret.password}</code>
              <button onClick={async () => { try { await navigator.clipboard.writeText(secret.password); setCopied(true); } catch (e) { setCopied(false); } }} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs">{copied ? tx("Kopiert ✓") : tx("Kopieren")}</button>
            </div>
            <div className="mt-1 text-xs text-amber-900">{tx("Bitte persönlich oder telefonisch weitergeben – nicht per Messenger an eine Gruppe. Anmelden unter ")}<b>{typeof window !== "undefined" ? window.location.origin : ""}{tx("/mitarbeiter")}</b>{isPhoneEmail(secret.email) ? tx(" → „Mit Handynummer anmelden“") : ""}.</div>
            <button onClick={() => setSecret(null)} className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">{tx("Erledigt")}</button>
          </div>
        )}
        {msg.text && <div role={msg.bad ? "alert" : "status"} className={`mt-3 rounded-lg p-2.5 text-xs ${msg.bad ? "bg-rose-50 text-rose-800" : "bg-teal-50 text-teal-900"}`}>{tx(msg.text)}</div>}

        {people !== null && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{hasPlanner ? tx("Leitung & Schichtplaner") : tx("Leitung & Büro")}</h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {managers.map((m) => (
                <li key={m.userId} className="py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                  <span data-mgr-row><span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{{ owner: tx("Inhaber"), supervisor: tx("Leitung"), planner: tx("Schichtplaner"), office: tx("Büro") }[m.role]}</span>
                    {m.name ? <><b className="font-semibold">{m.name}</b> <span className="text-xs text-slate-500">{loginName(m.email)}</span></> : loginName(m.email)}
                    {(m.phone || m.personnelNo) && <span className="ml-1 text-xs text-slate-500">· {[m.phone, m.personnelNo && tx("Pers.-Nr. {0}", m.personnelNo)].filter(Boolean).join(" · ")}</span>}
                    {" "}<span className="text-xs text-slate-400">{m.lastSignIn ? tx("zuletzt {0}", new Date(m.lastSignIn).toLocaleDateString(loc())) : tx("noch nie angemeldet")}</span></span>
                  <span className="whitespace-nowrap">
                  {m.canEdit && !m.staffLinked && (!editP || editP.userId !== m.userId) && <button onClick={() => { setEditP({ userId: m.userId, first: m.firstName || (m.name || "").split(" ")[0] || "", last: m.lastName || (m.name || "").split(" ").slice(1).join(" ") || "", phone: m.phone || "", pno: m.personnelNo || "" }); setMsg({ text: "", bad: false }); }} disabled={!!busy} className="mr-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">{tx("Bearbeiten")}</button>}
                  {m.canManage && (
                    <span className="whitespace-nowrap">
                      <button onClick={() => reset({ userId: m.userId, name: m.email })} disabled={!!busy} className="mr-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">{tx("Neues Passwort")}</button>
                      <button onClick={() => remove({ userId: m.userId, name: m.name || m.email })} disabled={!!busy} className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">{tx("Entfernen")}</button>
                    </span>
                  )}
                  </span>
                  </div>
                  {editP && editP.userId === m.userId && (
                    <div data-mgr-edit className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                      <PersonFields v={editP} set={setEditP} />
                      <button onClick={saveProfile} disabled={busy === "p" + m.userId} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "p" + m.userId ? tx("Moment …") : tx("Speichern")}</button>
                      <button onClick={() => setEditP(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">{tx("Abbrechen")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {mgrForm ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                <label className="text-xs text-slate-600">{tx("Rolle")}<select value={mgrForm.role} onChange={(e) => setMgrForm({ ...mgrForm, role: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    {hasPlanner && <option value="planner">{tx("Schichtplaner")}</option>}
                    {myRole === "owner" && <option value="supervisor">{tx("Leitung")}</option>}
                    {(org.products || []).includes("touren") && <option value="office">{tx("Büro (Kunden & Aufträge)")}</option>}
                  </select>
                </label>
                <label className="text-xs text-slate-600">{tx("E-Mail")}<input autoFocus type="email" value={mgrForm.email} onChange={(e) => setMgrForm({ ...mgrForm, email: e.target.value })} className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-600">{tx("Arbeitet selbst im Plan? (optional)")}<select value={mgrForm.staffId} onChange={(e) => setMgrForm({ ...mgrForm, staffId: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">{tx("– nein –")}</option>
                    {people.filter((p) => !p.userId && p.active).map((p) => <option key={p.staffId} value={p.staffId}>{p.name}</option>)}
                  </select>
                </label>
                {!mgrForm.staffId && <PersonFields v={mgrForm} set={setMgrForm} />}
                <button onClick={createMgr} disabled={busy === "cm"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "cm" ? tx("Moment …") : tx("Anlegen")}</button>
                <button onClick={() => setMgrForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">{tx("Abbrechen")}</button>
                {myRole !== "owner" && <div className="w-full text-[11px] text-slate-500">{tx("Eine weitere Leitung kann nur der Inhaber anlegen.")}</div>}
              </div>
            ) : (
              <button onClick={() => { setMgrForm({ role: hasPlanner || !touren ? "planner" : "office", email: "", staffId: "", first: "", last: "", phone: "", pno: "" }); setMsg({ text: "", bad: false }); }} className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">{tx("+ Zugang für ")}{myRole === "owner" ? (hasPlanner ? tx("Leitung / Schichtplaner") : tx("Leitung / Büro")) : (hasPlanner ? tx("Schichtplaner") : tx("Büro"))}</button>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{tx("Mitarbeitende (App)")}</h3>
          </>
        )}
        {people === null ? <div className="mt-4 text-xs text-slate-500">{tx("Lädt …")}</div> : (
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-slate-500"><th className="py-1.5 pr-2">{tx("Name")}</th><th className="py-1.5 pr-2">{tx("Zugang")}</th><th /></tr></thead>
              <tbody>
                {people.length === 0 && <tr><td colSpan={3} className="py-2 text-xs text-slate-500">{tx("Noch keine Personen gespeichert („Personen speichern“).")}</td></tr>}
                {people.filter((p) => p.active || p.userId).map((p) => (
                  <tr key={p.staffId} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-2 font-medium">{p.name}</td>
                    <td className="py-2 pr-2">
                      {p.userId ? (<><div>{loginName(p.email)}</div><div className="text-xs text-slate-400">{p.lastSignIn ? tx("zuletzt angemeldet {0}", new Date(p.lastSignIn).toLocaleDateString(loc())) : tx("noch nie angemeldet")}</div></>)
                        : form && form.staffId === p.staffId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {touren && (
                              <span className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs" role="radiogroup" aria-label={tx("Anmelden mit")}>
                                {[["phone", tx("Handynummer")], ["email", tx("E-Mail")]].map(([k, t]) => (
                                  <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k })} className={`px-2.5 py-1.5 ${form.kind === k ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`}>{t}</button>
                                ))}
                              </span>
                            )}
                            {touren && form.kind === "phone"
                              ? <input autoFocus type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder={tx("z. B. +971 50 123 4567")} className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                              : <input autoFocus type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder={tx("E-Mail der Person")} className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />}
                            <button onClick={create} disabled={busy === "create"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "create" ? tx("Moment …") : tx("Anlegen")}</button>
                            <button onClick={() => setForm(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">{tx("Abbrechen")}</button>
                          </div>
                        ) : <span className="text-xs text-slate-400">{tx("kein Zugang")}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {p.userId ? (
                        <>
                          <button onClick={() => reset(p)} disabled={!!busy} className="mr-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">{tx("Neues Passwort")}</button>
                          <button onClick={() => remove(p)} disabled={!!busy} className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">{tx("Entfernen")}</button>
                        </>
                      ) : !(form && form.staffId === p.staffId) && (
                        <button onClick={() => { setForm({ staffId: p.staffId, email: "", phone: p.phone || "", kind: touren ? "phone" : "email" }); setMsg({ text: "", bad: false }); }} disabled={!!busy} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">{tx("+ Zugang anlegen")}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// 27.11.2026: Vorname, Nachname, Mobil, Personalnummer für Leitung / Büro / Schichtplaner (ohne Platz im Plan)
function PersonFields({ v, set }) {
  const f = (k, label, w, extra = {}) => (
    <label className="text-xs text-slate-600">{label}<input value={v[k]} onChange={(e) => set({ ...v, [k]: e.target.value })} maxLength={k === "phone" || k === "pno" ? 40 : 80} className={`mt-1 block ${w} rounded-md border border-slate-300 px-2 py-1.5 text-sm`} {...extra} /></label>
  );
  return (
    <>
      {f("first", tx("Vorname") + " *", "w-36", { autoComplete: "off" })}
      {f("last", tx("Nachname") + " *", "w-36", { autoComplete: "off" })}
      {f("phone", tx("Mobil (optional)"), "w-36", { type: "tel" })}
      {f("pno", tx("Personalnummer (optional)"), "w-32")}
    </>
  );
}
