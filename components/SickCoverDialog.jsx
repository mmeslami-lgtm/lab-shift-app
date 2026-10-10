"use client";

import React, { useEffect, useRef, useState } from "react";
import { suggestCover } from "../lib/sickSuggest";

// Popup "Krankmeldung / Ausfall" (Dienstplaner Labor): choose person and days, see up to 3
// possibilities (best first), "Übernehmen" changes ONLY those cells. Nothing happens automatically.
//   schedule, staffList, shiftMeta, totalDays, offDays, orgCtx, year, monthIdx
//   onApply(option, staffId, from, to)   planner applies the changes
export default function SickCoverDialog({ schedule, staffList, shiftMeta, totalDays, offDays, orgCtx, year, monthIdx, onApply, onClose }) {
  const today = new Date();
  const thisMonth = today.getFullYear() === year && today.getMonth() === monthIdx;
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState(thisMonth ? today.getDate() : 1);
  const [to, setTo] = useState(thisMonth ? today.getDate() : 1);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [einspring, setEinspring] = useState({});
  const panelRef = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;

  // how often each person jumped in this month (fairness), from the database when available
  useEffect(() => {
    if (!orgCtx) return undefined;
    let alive = true;
    (async () => {
      const pad = (n) => String(n).padStart(2, "0");
      const a = `${year}-${pad(monthIdx + 1)}-01`, b = `${year}-${pad(monthIdx + 1)}-${pad(totalDays)}`;
      let r;
      try { r = await orgCtx.supabase.from("shift_changes").select("staff_id, kind, manager_status").eq("org_id", orgCtx.orgId).gte("change_date", a).lte("change_date", b); }
      catch (_) { return; } // no data: everybody counts 0
      if (!alive || !r || r.error) return;
      const c = {};
      (r.data || []).forEach((x) => { if ((x.kind === "cover" || x.kind === "extra") && x.manager_status !== "void" && x.manager_status !== "normal") c[x.staff_id] = (c[x.staff_id] || 0) + 1; });
      setEinspring(c);
    })();
    return () => { alive = false; };
  }, [orgCtx, year, monthIdx, totalDays]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    if (panelRef.current) panelRef.current.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function show() {
    if (!staffId) { setResult({ error: "Bitte die Person wählen." }); return; }
    const a = Math.max(1, Math.min(Number(from) || 1, totalDays)), b = Math.max(a, Math.min(Number(to) || a, totalDays));
    setBusy(true);
    setTimeout(() => {
      try {
        const r = suggestCover({ days: schedule.days, staff: staffList, shiftMeta, sickId: staffId, fromDay: a, toDay: b, offDays, hours: schedule.hours, targetOf: schedule.targetOf, einspring });
        setResult({ ...r, from: a, to: b });
      } catch (e) { setResult({ error: "Fehler bei der Berechnung: " + e.message }); }
      setBusy(false);
    }, 30);
  }

  const name = (staffList.find((s) => s.id === staffId) || {}).name || "";
  const rankWord = ["1. Möglichkeit (beste)", "2. Möglichkeit", "3. Möglichkeit"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sick-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="sick-title" className="text-base font-semibold">Krankmeldung / Ausfall</h2>
            <div className="mt-0.5 text-xs text-slate-500">Vorschläge, wer die Schichten übernimmt – nur an diesen Tagen. Keine Regel wird gebrochen; nichts ändert sich ohne „Übernehmen“.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">Person
            <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setResult(null); }} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">– wählen –</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">von Tag
            <input type="number" min={1} max={totalDays} value={from} onChange={(e) => { setFrom(e.target.value); if (Number(e.target.value) > Number(to)) setTo(e.target.value); setResult(null); }} className="mt-1 block w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600">bis Tag
            <input type="number" min={1} max={totalDays} value={to} onChange={(e) => { setTo(e.target.value); setResult(null); }} className="mt-1 block w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <button onClick={show} disabled={busy} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 active:translate-y-px disabled:opacity-60">{busy ? "Moment …" : "Möglichkeiten anzeigen"}</button>
        </div>

        {result && result.error && <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">{result.error}</div>}
        {result && !result.error && result.affected.length === 0 && (
          <div role="status" className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">{name} hat an diesen Tagen keine Schicht. Es gibt nichts zu ersetzen.</div>
        )}
        {result && !result.error && result.affected.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-slate-600">{name} fällt aus: {result.affected.length} Schicht(en) zwischen Tag {result.from} und {result.to}.</div>
            {result.options.length === 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                Keine Möglichkeit ohne Regelbruch gefunden. Du kannst {name} nur austragen (Schichten bleiben leer) und manuell besetzen.
                <div className="mt-2"><button onClick={() => onApply({ changes: result.affected.map((c) => ({ ...c, to: "" })), title: "nur ausgetragen" }, staffId, result.from, result.to)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-amber-900 hover:bg-amber-100 active:translate-y-px">Nur austragen</button></div>
              </div>
            )}
            <ol className="mt-2 space-y-2">
              {result.options.map((o, i) => (
                <li key={i} className={`rounded-xl border p-3 ${i === 0 ? "border-teal-300 bg-teal-50/60" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rankWord[i]}</div>
                      <div className="font-semibold">{o.title}</div>
                    </div>
                    <button onClick={() => onApply(o, staffId, result.from, result.to)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">Übernehmen</button>
                  </div>
                  <ul className="mt-1.5 list-disc pl-5 text-xs text-slate-700">{o.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
                  {o.info.length > 0 && <div className="mt-1.5 text-[11px] text-slate-500">{o.info.join(" · ")}</div>}
                </li>
              ))}
            </ol>
            <div className="mt-2 text-[11px] text-slate-500">Nach „Übernehmen“ sind die Änderungen gelb markiert. Den Mitarbeitenden wird erst nach „Veröffentlichen“ etwas angezeigt (nach „Plan bearbeiten“ als Einspringen erfasst).</div>
          </div>
        )}
      </div>
    </div>
  );
}
