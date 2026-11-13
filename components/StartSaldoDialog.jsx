"use client";

import React, { useEffect, useState } from "react";

// "Zeitkonto zum Start" (script 42, changed by script 43 on 13 Nov 2026 – user: "one must always have access").
// Inhaber / Leitung enter the Zeitkonto of each person when the company starts with Dienstigo (e.g. from the old
// system). The window lists ALL active people; saved values are filled in and can be changed later – a change of a
// saved value needs a reason and is logged (staff_start_balance_log). It opens by itself once per browser tab while
// somebody has no value yet; the button in the menu always opens it ("Zeitkonto zum Start", red with the number of
// people still missing).
// Input: "+12:30", "-4:15", "12,5", "0". Empty = not now. + = Überstunden, − = Minusstunden.

export function parseHM(s) {
  const t = String(s || "").trim().replace("−", "-").replace(/\s+/g, "");
  if (!t) return null;
  let m = /^([+-]?)(\d{1,4}):([0-5]?\d)$/.exec(t);
  if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  m = /^([+-]?)(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(t);
  if (m) return Math.round((m[1] === "-" ? -1 : 1) * Number(`${m[2]}.${m[3] || 0}`) * 60);
  return NaN;
}
export function fmtHM(min) {
  const a = Math.abs(Number(min) || 0);
  return `${min < 0 ? "-" : "+"}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
const later = (orgId) => `dg-startsaldo-later:${orgId}`;

export default function StartSaldoDialog({ org }) {
  const [people, setPeople] = useState(null); // [{ id, name, saved: minutes | null }]
  const [vals, setVals] = useState({});
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    const sb = org.supabase;
    const [st, have] = await Promise.all([
      sb.from("staff").select("id, name").eq("org_id", org.orgId).eq("active", true).order("name"),
      sb.from("staff_start_balance").select("staff_id, minutes").eq("org_id", org.orgId),
    ]);
    if (st.error || have.error) return [];
    const saved = Object.fromEntries((have.data || []).map((x) => [x.staff_id, Number(x.minutes) || 0]));
    // the own Zeitkonto is entered by the Inhaber or another Leitung (not by a Leitung for itself)
    return (st.data || []).filter((p) => !(org.role !== "owner" && p.id === org.staffId))
      .map((p) => ({ id: p.id, name: p.name, saved: p.id in saved ? saved[p.id] : null }));
  }
  const fill = (list) => setVals(Object.fromEntries(list.map((p) => [p.id, p.saved == null ? "" : fmtHM(p.saved)])));
  useEffect(() => {
    let off = false;
    let asked = false;
    try { asked = !!window.sessionStorage.getItem(later(org.orgId)); } catch (e) { /* ignore */ }
    load().then((list) => { if (off) return; setPeople(list); fill(list); setOpen(!asked && list.length > 0 && list.every((p) => p.saved == null)); });
    return () => { off = true; };
  }, [org.orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (people || []).filter((p) => p.saved != null && parseHM(vals[p.id]) !== null && parseHM(vals[p.id]) !== p.saved);

  function close() {
    try { window.sessionStorage.setItem(later(org.orgId), "1"); } catch (e) { /* ignore */ }
    fill(people || []); setReason(""); setMsg(""); setOpen(false);
  }
  async function save() {
    const rows = []; const bad = [];
    (people || []).forEach((p) => {
      const v = parseHM(vals[p.id]);
      if (v === null || v === p.saved) return;
      if (Number.isNaN(v) || Math.abs(v) > 120000) bad.push(p.name); else rows.push({ staff_id: p.id, minutes: v });
    });
    if (bad.length) { setMsg(`Bitte prüfen: ${bad.join(", ")} (Format z. B. +12:30, -4:15 oder 12,5)`); return; }
    if (!rows.length) { setMsg("Keine Änderung."); return; }
    if (changed.length && reason.trim().length < 3) { setMsg("Für geänderte Werte bitte einen Grund angeben."); return; }
    setBusy(true); setMsg("");
    const { error } = await org.supabase.rpc("set_start_balances", { p_org: org.orgId, p_rows: rows, p_reason: reason.trim() || null });
    setBusy(false);
    if (error) { setMsg(`Nicht gespeichert: ${error.message}`); return; }
    const list = await load();
    setPeople(list); fill(list); setReason("");
    setMsg(`✓ ${rows.length} gespeichert.`);
  }

  if (!people || !people.length) return null;
  if (!open) return (
    // neutral button (user 13 Nov 2026: no red – an empty value simply counts as 0)
    <button type="button" className="dg-item" onClick={() => { setMsg(""); setOpen(true); }} title="Zeitkonto zum Start eintragen oder ändern">
      <span className="dg-item-label">Zeitkonto zum Start</span>
    </button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Zeitkonto zum Start" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-slate-900">Zeitkonto zum Start</div>
        <p className="mt-1 text-sm text-slate-600">
          Stand des Zeitkontos jeder Person beim Start mit Dienstigo (z. B. aus dem alten System).
          <b> + </b>= Überstunden, <b>−</b> = Minusstunden, z. B. <code>+12:30</code>, <code>-4:15</code> oder <code>0</code>.
        </p>
        <p className="mt-1 text-xs text-slate-500">Leere Felder zählen als 0:00. Gespeicherte Werte lassen sich ändern – mit Grund, alles wird protokolliert.</p>
        <div className="mt-3 max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {people.map((p) => {
            const v = parseHM(vals[p.id]);
            const isChanged = p.saved != null && v !== null && v !== p.saved;
            return (
              <label key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{p.name}{p.saved == null && <span className="ml-2 text-xs font-normal text-slate-400">leer = 0</span>}{isChanged && <span className="ml-2 text-xs font-normal text-amber-700">geändert (vorher {fmtHM(p.saved)})</span>}</span>
                <input value={vals[p.id] || ""} onChange={(e) => setVals((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="+0:00" inputMode="text"
                  className={`w-28 rounded-md border px-2 py-1.5 text-right font-mono text-sm ${isChanged ? "border-amber-400 bg-amber-50" : "border-slate-300"}`} aria-label={`Zeitkonto von ${p.name}`} />
              </label>
            );
          })}
        </div>
        {changed.length > 0 && (
          <label className="mt-3 block text-xs text-slate-600">Grund für die Änderung (Pflicht)
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Tippfehler, Wert aus dem alten System korrigiert" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        )}
        {msg && <div role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Schließen</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">{busy ? "Moment …" : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}
