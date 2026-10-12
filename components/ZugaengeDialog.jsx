"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";

// Popup "Zugänge" (Leitung / Inhaber): logins for the company's own employees.
// A temporary password is shown ONCE; at the first login the person chooses an own password.
export default function ZugaengeDialog({ onClose }) {
  const org = useContext(OrgContext);
  const [people, setPeople] = useState(null);
  const [managers, setManagers] = useState([]);
  const [myRole, setMyRole] = useState("");
  const [mgrForm, setMgrForm] = useState(null); // { role, email, staffId }
  const [form, setForm] = useState(null); // { staffId, email }
  const [secret, setSecret] = useState(null); // { name, email, password }
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState("");
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const api = useCallback(async (payload) => {
    const { data } = await org.supabase.auth.getSession();
    const res = await fetch("/api/zugang", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ ...payload, org_id: org.orgId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
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
  const createMgr = () => run("cm", { action: "create", role: mgrForm.role, email: mgrForm.email, staff_id: mgrForm.staffId || undefined }, "", (b) => { setMgrForm(null); setSecret({ name: b.name, email: b.email, password: b.password }); setCopied(false); });
  const create = () => run("create", { action: "create", role: "employee", staff_id: form.staffId, email: form.email }, "", (b) => { setForm(null); setSecret({ name: b.name, email: b.email, password: b.password }); setCopied(false); });
  const reset = (p) => { if (window.confirm(`Neues vorläufiges Passwort für ${p.name} erzeugen? Das alte gilt dann nicht mehr.`)) run("r" + p.userId, { action: "reset", user_id: p.userId }, "", (b) => { setSecret({ name: p.name, email: b.email, password: b.password }); setCopied(false); }); };
  const remove = (p) => { if (window.confirm(`Zugang von ${p.name} entfernen? Die Person kann sich danach nicht mehr anmelden. Pläne und Zeiten bleiben erhalten.`)) run("x" + p.userId, { action: "remove", user_id: p.userId }, `Zugang von ${p.name} entfernt ✓`); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="zg-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="zg-title" className="text-base font-semibold">Zugänge</h2>
            <div className="mt-0.5 text-xs text-slate-500">Das vorläufige Passwort wird nur einmal angezeigt; beim ersten Anmelden wählt die Person ein eigenes.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>

        {secret && (
          <div role="status" className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-900">Zugangsdaten für {secret.name} – nur jetzt sichtbar</div>
            <div className="mt-1 text-sm">E-Mail: <b>{secret.email}</b></div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">Vorläufiges Passwort: <code className="rounded bg-white px-2 py-1 font-mono text-base">{secret.password}</code>
              <button onClick={async () => { try { await navigator.clipboard.writeText(secret.password); setCopied(true); } catch (e) { setCopied(false); } }} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs">{copied ? "Kopiert ✓" : "Kopieren"}</button>
            </div>
            <div className="mt-1 text-xs text-amber-900">Bitte persönlich oder telefonisch weitergeben – nicht per Messenger an eine Gruppe. Anmelden unter <b>{typeof window !== "undefined" ? window.location.origin : ""}/mitarbeiter</b>.</div>
            <button onClick={() => setSecret(null)} className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Erledigt</button>
          </div>
        )}
        {msg.text && <div role={msg.bad ? "alert" : "status"} className={`mt-3 rounded-lg p-2.5 text-xs ${msg.bad ? "bg-rose-50 text-rose-800" : "bg-teal-50 text-teal-900"}`}>{msg.text}</div>}

        {people !== null && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Leitung & Schichtplaner</h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {managers.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span><span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{{ owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner" }[m.role]}</span>{m.email} <span className="text-xs text-slate-400">{m.lastSignIn ? `zuletzt ${new Date(m.lastSignIn).toLocaleDateString("de-DE")}` : "noch nie angemeldet"}</span></span>
                  {m.canManage && (
                    <span className="whitespace-nowrap">
                      <button onClick={() => reset({ userId: m.userId, name: m.email })} disabled={!!busy} className="mr-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Neues Passwort</button>
                      <button onClick={() => remove({ userId: m.userId, name: m.email })} disabled={!!busy} className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Entfernen</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {mgrForm ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                <label className="text-xs text-slate-600">Rolle
                  <select value={mgrForm.role} onChange={(e) => setMgrForm({ ...mgrForm, role: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="planner">Schichtplaner</option>
                    {myRole === "owner" && <option value="supervisor">Leitung</option>}
                  </select>
                </label>
                <label className="text-xs text-slate-600">E-Mail
                  <input autoFocus type="email" value={mgrForm.email} onChange={(e) => setMgrForm({ ...mgrForm, email: e.target.value })} className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-600">Arbeitet selbst im Plan? (optional)
                  <select value={mgrForm.staffId} onChange={(e) => setMgrForm({ ...mgrForm, staffId: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">– nein –</option>
                    {people.filter((p) => !p.userId && p.active).map((p) => <option key={p.staffId} value={p.staffId}>{p.name}</option>)}
                  </select>
                </label>
                <button onClick={createMgr} disabled={busy === "cm"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "cm" ? "Moment …" : "Anlegen"}</button>
                <button onClick={() => setMgrForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                {myRole !== "owner" && <div className="w-full text-[11px] text-slate-500">Eine weitere Leitung kann nur der Inhaber anlegen.</div>}
              </div>
            ) : (
              <button onClick={() => { setMgrForm({ role: "planner", email: "", staffId: "" }); setMsg({ text: "", bad: false }); }} className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Zugang für {myRole === "owner" ? "Leitung / Schichtplaner" : "Schichtplaner"}</button>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Mitarbeitende (App)</h3>
          </>
        )}
        {people === null ? <div className="mt-4 text-xs text-slate-500">Lädt …</div> : (
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-slate-500"><th className="py-1.5 pr-2">Name</th><th className="py-1.5 pr-2">Zugang</th><th /></tr></thead>
              <tbody>
                {people.length === 0 && <tr><td colSpan={3} className="py-2 text-xs text-slate-500">Noch keine Personen gespeichert („Personen speichern“).</td></tr>}
                {people.filter((p) => p.active || p.userId).map((p) => (
                  <tr key={p.staffId} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-2 font-medium">{p.name}</td>
                    <td className="py-2 pr-2">
                      {p.userId ? (<><div>{p.email}</div><div className="text-xs text-slate-400">{p.lastSignIn ? `zuletzt angemeldet ${new Date(p.lastSignIn).toLocaleDateString("de-DE")}` : "noch nie angemeldet"}</div></>)
                        : form && form.staffId === p.staffId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input autoFocus type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder="E-Mail der Person" className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                            <button onClick={create} disabled={busy === "create"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "create" ? "Moment …" : "Anlegen"}</button>
                            <button onClick={() => setForm(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                          </div>
                        ) : <span className="text-xs text-slate-400">kein Zugang</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {p.userId ? (
                        <>
                          <button onClick={() => reset(p)} disabled={!!busy} className="mr-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Neues Passwort</button>
                          <button onClick={() => remove(p)} disabled={!!busy} className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Entfernen</button>
                        </>
                      ) : !(form && form.staffId === p.staffId) && (
                        <button onClick={() => { setForm({ staffId: p.staffId, email: "" }); setMsg({ text: "", bad: false }); }} disabled={!!busy} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Zugang anlegen</button>
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
