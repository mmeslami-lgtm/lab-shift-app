"use client";

import React, { useEffect, useState } from "react";

// "Zeitkonto zum Start" (9 Nov 2026, script 42). Shown to Inhaber / Leitung (time tracking on) as long as some
// active person has no start value yet. ONCE per person: after "Speichern" it is fixed (later changes only with a
// reason in "Überstunden: Zeitkonto – ändern"). "Schließen" = later (asked again at the next visit, not in this tab).
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
const later = (orgId) => `dg-startsaldo-later:${orgId}`;

export default function StartSaldoDialog({ org }) {
  const [missing, setMissing] = useState(null); // [{ id, name }]
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    const sb = org.supabase;
    const [st, have] = await Promise.all([
      sb.from("staff").select("id, name").eq("org_id", org.orgId).eq("active", true).order("name"),
      sb.from("staff_start_balance").select("staff_id").eq("org_id", org.orgId),
    ]);
    if (st.error || have.error) return [];
    const done = new Set((have.data || []).map((x) => x.staff_id));
    // the own Zeitkonto is entered by the Inhaber or another Leitung (not by a Leitung for itself)
    return (st.data || []).filter((p) => !done.has(p.id) && !(org.role !== "owner" && p.id === org.staffId));
  }
  useEffect(() => {
    let off = false;
    let asked = false;
    try { asked = !!window.sessionStorage.getItem(later(org.orgId)); } catch (e) { /* ignore */ }
    // always load (for the button in the menu); open by itself only once per tab
    load().then((m) => { if (!off) { setMissing(m); setOpen(m.length > 0 && !asked); } });
    return () => { off = true; };
  }, [org.orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    try { window.sessionStorage.setItem(later(org.orgId), "1"); } catch (e) { /* ignore */ }
    setOpen(false);
  }
  async function save() {
    const rows = []; const bad = [];
    (missing || []).forEach((p) => {
      const v = parseHM(vals[p.id]);
      if (v === null) return;
      if (Number.isNaN(v) || Math.abs(v) > 120000) bad.push(p.name); else rows.push({ staff_id: p.id, minutes: v });
    });
    if (bad.length) { setMsg(`Bitte prüfen: ${bad.join(", ")} (Format z. B. +12:30, -4:15 oder 12,5)`); return; }
    if (!rows.length) { setMsg("Noch nichts eingetragen. Leere Felder werden beim nächsten Mal wieder gefragt."); return; }
    setBusy(true); setMsg("");
    const { error } = await org.supabase.rpc("set_start_balances", { p_org: org.orgId, p_rows: rows });
    setBusy(false);
    if (error) { setMsg(`Nicht gespeichert: ${error.message}`); return; }
    const m = await load();
    setMissing(m); setVals({});
    if (!m.length) { setOpen(false); return; }
    setMsg(`✓ ${rows.length} gespeichert. Noch offen: ${m.length}.`);
  }

  if (!missing || !missing.length) return null;
  // closed: a button in the menu opens it again ("Zeitkonto zum Start (3 offen)")
  if (!open) return (
    <button type="button" className="dg-item dg-item-warn" onClick={() => { setMsg(""); setOpen(true); }} title="Zeitkonto zum Start einmalig eintragen">
      <span className="dg-item-label">Zeitkonto zum Start</span><span className="dg-badge">{missing.length}</span>
    </button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Zeitkonto zum Start" className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-slate-900">Zeitkonto zum Start</div>
        <p className="mt-1 text-sm text-slate-600">
          Einmalig für jede Person: Stand des Zeitkontos beim Start mit Dienstigo (z. B. aus dem alten System).
          <b> + </b>= Überstunden, <b>−</b> = Minusstunden, z. B. <code>+12:30</code>, <code>-4:15</code> oder <code>0</code>.
        </p>
        <p className="mt-1 text-xs text-slate-500">Nach dem Speichern fest – spätere Änderungen nur mit Grund über „Überstunden: Zeitkonto – ändern“. Leere Felder werden beim nächsten Mal wieder gefragt.</p>
        <div className="mt-3 max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {missing.map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{p.name}</span>
              <input value={vals[p.id] || ""} onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))} placeholder="+0:00" inputMode="text"
                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right font-mono text-sm" aria-label={`Zeitkonto von ${p.name}`} />
            </label>
          ))}
        </div>
        {msg && <div role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Schließen</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">{busy ? "Moment …" : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}
