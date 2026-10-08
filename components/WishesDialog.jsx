"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const MONTH_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const pad = (n) => String(n).padStart(2, "0");
const parseIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (s) => { const d = parseIso(s); return `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const range = (w) => (w.date_from === w.date_to ? fmt(w.date_from) : `${fmt(w.date_from)} – ${fmt(w.date_to)}`);

// Popup "Wünsche" for Leitung / Inhaber: wishes sent from the employee app. Open ones can be
// approved or rejected (with an optional reason the employee sees). Approved wishes of the month
// on screen are taken into the plan's wish list ONLY with the button at the bottom.
//   year, monthIdx   the month of the planner
//   onImport(list)   planner function, returns { added, already, noPerson, noShift }
//   onChanged()      tells the bar to refresh its counter
export default function WishesDialog({ year, monthIdx, onImport, onClose, onChanged }) {
  const org = useContext(OrgContext);
  const canDecide = org.role === "owner" || org.role === "supervisor";
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [labels, setLabels] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    const w = await org.supabase.from("wishes").select("id, staff_id, wish_type, date_from, date_to, shift_key, note, status, decision_note, submitted_at, decided_at").eq("org_id", org.orgId).order("date_from");
    if (w.error) { setError(/status/.test(w.error.message) ? "Die Datenbank ist noch nicht vorbereitet (Skript 11 fehlt)." : w.error.message); setRows([]); return; }
    const st = await org.supabase.from("staff").select("id, name").eq("org_id", org.orgId);
    const sd = await org.supabase.from("shift_definitions").select("key, label").eq("org_id", org.orgId);
    const n = {}; (st.data || []).forEach((x) => { n[x.id] = x.name; });
    const l = {}; (sd.data || []).forEach((x) => { l[x.key] = x.label; });
    setNames(n); setLabels(l);
    setRows((w.data || []).filter((x) => x.status !== "draft")); // drafts belong to the employee until sent
  }, [org]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    if (panelRef.current) panelRef.current.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const monthStart = `${year}-${pad(monthIdx + 1)}-01`;
  const last = new Date(year, monthIdx + 1, 0).getDate();
  const monthEnd = `${year}-${pad(monthIdx + 1)}-${pad(last)}`;
  const inMonth = (w) => w.date_to >= monthStart && w.date_from <= monthEnd;
  const what = (w) => (w.wish_type === "free" ? "frei" : `möchte arbeiten: ${labels[w.shift_key] || w.shift_key}`);

  const open = (rows || []).filter((w) => w.status === "submitted");
  const approvedHere = (rows || []).filter((w) => w.status === "approved" && inMonth(w));
  const done = (rows || []).filter((w) => w.status !== "submitted" && w.date_to >= monthStart).slice(0, 60);

  async function decide(w, status) {
    let note = null;
    if (status === "rejected") {
      note = window.prompt(`Wunsch von ${names[w.staff_id] || "?"} ablehnen.\n\nGrund für die Person (optional):`, "");
      if (note === null) return; // Abbrechen
    }
    setBusy(w.id + status); setMsg("");
    const { error: e } = await org.supabase.rpc("decide_wish", { p_id: w.id, p_status: status, p_note: note });
    setBusy("");
    if (e) { setError(e.message); return; }
    setMsg(status === "approved" ? "Genehmigt ✓" : status === "rejected" ? "Abgelehnt ✓" : "Wieder offen ✓");
    await load(); if (onChanged) onChanged();
  }

  function importApproved() {
    const list = approvedHere.map((w) => {
      const a = w.date_from < monthStart ? 1 : parseIso(w.date_from).getDate();
      const b = w.date_to > monthEnd ? last : parseIso(w.date_to).getDate();
      return { dbId: w.id, staffId: w.staff_id, shiftType: w.wish_type === "free" ? "Frei" : w.shift_key, days: a === b ? String(a) : `${a}-${b}` };
    });
    const r = onImport ? onImport(list) : { added: 0 };
    const parts = [`${r.added} Wunsch/Wünsche in die Wunschliste des Plans übernommen`];
    if (r.already) parts.push(`${r.already} waren schon drin`);
    if (r.noPerson) parts.push(`${r.noPerson} Person(en) fehlen im Plan – zuerst „Personen aus Datenbank laden“`);
    if (r.noShift) parts.push(`${r.noShift} mit einer Schicht, die es in diesem Planer nicht gibt`);
    setMsg(parts.join(" · ") + ". Erst „Neu generieren“ berücksichtigt sie.");
  }

  const Row = ({ w, children }) => (
    <li className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{names[w.staff_id] || "?"} <span className="font-normal text-slate-500">· {range(w)}</span></div>
          <div className="text-xs text-slate-600">{what(w)}{w.note ? ` – „${w.note}“` : ""}</div>
          {w.decision_note && <div className="text-xs text-slate-500">Grund: {w.decision_note}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="wishes-title" className="w-full max-w-xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="wishes-title" className="text-base font-semibold">Wünsche der Mitarbeitenden</h2>
            <div className="mt-0.5 text-xs text-slate-500">Aus der App „Meine Schichten“. Ein Wunsch ist keine Zusage – du entscheidest.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>

        {error && <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">{error}</div>}
        {msg && <div role="status" className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">{msg}</div>}
        {rows === null && <div className="mt-4 text-xs text-slate-500">Lädt …</div>}

        {rows && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Offen ({open.length})</h3>
            {open.length === 0 ? <div className="mt-1 text-xs text-slate-500">Keine offenen Wünsche.</div> : (
              <ul className="mt-1 divide-y divide-slate-100 border-y border-slate-100">
                {open.map((w) => (
                  <Row key={w.id} w={w}>
                    {canDecide ? (
                      <>
                        <button onClick={() => decide(w, "approved")} disabled={!!busy} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100 active:translate-y-px disabled:opacity-60">{busy === w.id + "approved" ? "Moment …" : "Genehmigen"}</button>
                        <button onClick={() => decide(w, "rejected")} disabled={!!busy} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px disabled:opacity-60">{busy === w.id + "rejected" ? "Moment …" : "Ablehnen"}</button>
                      </>
                    ) : <span className="text-xs text-slate-400">Entscheidung durch Leitung</span>}
                  </Row>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
              <div className="text-xs text-teal-900">Genehmigt für <b>{MONTH_DE[monthIdx]} {year}</b>: {approvedHere.length}</div>
              <button onClick={importApproved} disabled={approvedHere.length === 0} className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 active:translate-y-px disabled:opacity-50">
                Genehmigte Wünsche in den Plan übernehmen
              </button>
              <div className="mt-1 text-[11px] text-teal-900/70">Sie erscheinen unten in der Wunschliste und gelten beim nächsten „Dienstplan erstellen“ / „Neu generieren“.</div>
            </div>

            <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="mt-4 text-xs text-slate-500 underline">
              {showDone ? "Entschiedene ausblenden" : `Entschiedene anzeigen (${done.length})`}
            </button>
            {showDone && (
              <ul className="mt-1 divide-y divide-slate-100 border-y border-slate-100">
                {done.map((w) => (
                  <Row key={w.id} w={w}>
                    <span className={`rounded-md px-2 py-1 text-xs ${w.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{w.status === "approved" ? "genehmigt" : "abgelehnt"}</span>
                    {canDecide && <button onClick={() => decide(w, "submitted")} disabled={!!busy} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px disabled:opacity-60">Wieder öffnen</button>}
                  </Row>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
