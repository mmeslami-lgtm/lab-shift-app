"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const pad = (n) => String(n).padStart(2, "0");
const de = (iso) => { const [y, m, d] = String(iso).split("-"); return `${d}.${m}.${y}`; };
const STATUS = { open: ["offen", "bg-amber-50 text-amber-800 border-amber-200"], approved: ["genehmigt", "bg-emerald-50 text-emerald-800 border-emerald-200"], denied: ["abgelehnt", "bg-rose-50 text-rose-800 border-rose-200"] };

// Popup "Anträge" (Leitung / Inhaber decide, Schichtplaner only reads): Urlaub, Fortbildung,
// Krankmeldung from the employee app. "In den Plan übernehmen" puts the approved ones of the month
// on screen into the plan's Urlaub / Krank lists – only "Neu generieren" uses them, nothing automatic.
export default function RequestsDialog({ year, monthIdx, onImport, onChanged, onClose }) {
  const org = useContext(OrgContext);
  const isLeader = org.role === "owner" || org.role === "supervisor";
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [types, setTypes] = useState({});
  const [filter, setFilter] = useState("open");
  const [deny, setDeny] = useState(null); // { id, note }
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const load = useCallback(async () => {
    const r = await org.supabase.from("requests").select("id, staff_id, type_key, date_from, date_to, days, note, status, decision_note, created_at, decided_at").eq("org_id", org.orgId).order("date_from", { ascending: true });
    const st = await org.supabase.from("staff").select("id, name").eq("org_id", org.orgId);
    const t = await org.supabase.from("request_types").select("key, label").eq("org_id", org.orgId);
    const n = {}; (st.data || []).forEach((x) => { n[x.id] = x.name; });
    const tt = {}; (t.data || []).forEach((x) => { tt[x.key] = x.label; });
    setNames(n); setTypes(tt); setRows(r.error ? [] : r.data || []);
  }, [org]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") closeRef.current(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  async function decide(id, status, note) {
    setBusy(id); setMsg("");
    const { error } = await org.supabase.from("requests").update({ status, decision_note: note ? note.trim().slice(0, 500) : null }).eq("id", id);
    setBusy(""); if (error) { setMsg(error.message); return; }
    setDeny(null); await load(); if (onChanged) onChanged();
  }

  // approved requests touching the month on screen -> day lists like "5-9" or "28-31"
  function importToPlan() {
    const first = `${year}-${pad(monthIdx + 1)}-01`;
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const last = `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`;
    const list = (rows || []).filter((r) => r.status === "approved" && r.date_to >= first && r.date_from <= last).map((r) => {
      const a = r.date_from < first ? 1 : Number(r.date_from.slice(8));
      const b = r.date_to > last ? lastDay : Number(r.date_to.slice(8));
      return { dbId: r.id, staffId: r.staff_id, days: a === b ? String(a) : `${a}-${b}`, kind: r.type_key === "krank" ? "sick" : "leave" };
    });
    if (!onImport) return;
    const res = onImport(list);
    setMsg(list.length === 0 ? "In diesem Monat gibt es keine genehmigten Anträge." : `${res.added} übernommen${res.already ? `, ${res.already} waren schon im Plan` : ""}${res.noPerson ? `, ${res.noPerson} Person(en) nicht im Plan` : ""}. Wirkt beim nächsten „Neu generieren“.`);
  }

  const shown = (rows || []).filter((r) => filter === "all" || r.status === filter);
  const openCount = (rows || []).filter((r) => r.status === "open").length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="req-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="req-title" className="text-base font-semibold">Anträge</h2>
            <div className="mt-0.5 text-xs text-slate-500">Urlaub, Fortbildung und Krankmeldungen aus der Mitarbeiter-App. Krankmeldungen sehen nur Leitung und Inhaber.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[["open", `Offen (${openCount})`], ["approved", "Genehmigt"], ["denied", "Abgelehnt"], ["all", "Alle"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-lg border px-2.5 py-1.5 text-xs active:translate-y-px ${filter === k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{l}</button>
          ))}
          {onImport && <button onClick={importToPlan} className="ml-auto rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs text-teal-800 hover:bg-teal-100 active:translate-y-px">Genehmigte in den Plan übernehmen</button>}
        </div>
        {msg && <div role="status" className="mt-2 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">{msg}</div>}
        {rows === null ? <div className="mt-4 text-xs text-slate-500">Lädt …</div> : shown.length === 0 ? <div className="mt-4 text-xs text-slate-500">Keine Anträge.</div> : (
          <ul className="mt-3 space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{names[r.staff_id] || "?"} · {types[r.type_key] || r.type_key}</div>
                    <div className="text-xs text-slate-600">{de(r.date_from)}{r.date_to !== r.date_from ? ` – ${de(r.date_to)}` : ""}{Number(r.days) ? ` · ${Number(r.days)} Arbeitstag(e)` : ""}</div>
                    {r.note && <div className="mt-1 text-xs text-slate-700">„{r.note}“</div>}
                    {r.decision_note && <div className="mt-1 text-xs text-slate-500">Antwort: {r.decision_note}</div>}
                  </div>
                  <span className={`rounded-md border px-2 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                </div>
                {isLeader && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.status !== "approved" && <button onClick={() => decide(r.id, "approved", r.decision_note)} disabled={busy === r.id} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 active:translate-y-px">Genehmigen</button>}
                    {r.status !== "denied" && <button onClick={() => setDeny({ id: r.id, note: "" })} disabled={busy === r.id} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Ablehnen</button>}
                    {r.status !== "open" && <button onClick={() => decide(r.id, "open", null)} disabled={busy === r.id} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Wieder öffnen</button>}
                  </div>
                )}
                {deny && deny.id === r.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
                    <label className="text-xs text-slate-600">Grund (optional, sieht die Person)
                      <input autoFocus value={deny.note} maxLength={500} onChange={(e) => setDeny({ ...deny, note: e.target.value })} className="mt-1 block w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    </label>
                    <button onClick={() => decide(r.id, "denied", deny.note)} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 active:translate-y-px">Ablehnen</button>
                    <button onClick={() => setDeny(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
