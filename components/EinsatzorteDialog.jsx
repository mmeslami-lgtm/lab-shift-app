"use client";

import React, { useMemo, useState } from "react";

// „Einsatzorte“ (nur Dienstplaner allgemein): which person works WHERE on which day.
//   Tab „Plan“: table person × day like the Wunschplan. Choose a place (brush), then tap
//     a cell (one day) · a name (all days this person works) · a day number (everybody working that day).
//     Days without a shift are grey; a place on a day without shift or with leave is marked red.
//     „Übernehmen“ only changes the plan on screen (draft) – „Zwischenspeichern“ / „Veröffentlichen“ save it.
//   Tab „Orte“ (Inhaber/Leitung): „Ein Arbeitsort“ / „Mehrere Einsatzorte“ and the list of places
//     (name, address, colour; never deleted, only inactive).
// locs: { "staffId|day": locationId }
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];
export const shortName = (n) => String(n || "?").replace(/^(Filiale|Standort|Praxis|Station|Haus)\s+/i, "").slice(0, 3);

export default function EinsatzorteDialog({ orgCtx, monthLabel, days, staffList, leaveMap, locs, locations, multi, canManage, onApply, onClose, onChanged }) {
  const [tab, setTab] = useState(multi ? "plan" : "orte");
  const [draft, setDraft] = useState({ ...locs });
  const [brush, setBrush] = useState(() => { const a = locations.find((l) => l.active); return a ? a.id : ""; });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); // { id|null, name, address, color, active }
  const byId = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const works = (id, day) => { const d = days[day - 1]; return !!d && Object.values(d.shifts || {}).some((ids) => (ids || []).includes(id)); };
  const onLeave = (id, day) => !!(leaveMap && leaveMap[id] && leaveMap[id].has(day));
  const dirty = JSON.stringify(Object.entries(draft).sort()) !== JSON.stringify(Object.entries(locs).sort());

  const setCell = (next, id, day) => { const k = `${id}|${day}`; if (brush) next[k] = brush; else delete next[k]; };
  const paintCell = (id, day) => setDraft((p) => { const n = { ...p }; setCell(n, id, day); return n; });
  const paintPerson = (id) => setDraft((p) => { const n = { ...p }; days.forEach((d) => { if (works(id, d.day) && !onLeave(id, d.day)) setCell(n, id, d.day); }); return n; });
  const paintDay = (day) => setDraft((p) => { const n = { ...p }; staffList.forEach((s) => { if (works(s.id, day) && !onLeave(s.id, day)) setCell(n, s.id, day); }); return n; });

  // checks: a place on a day without shift / with leave, shifts without a place
  let wrong = 0, missing = 0;
  staffList.forEach((s) => days.forEach((d) => {
    const has = !!draft[`${s.id}|${d.day}`];
    if (has && (!works(s.id, d.day) || onLeave(s.id, d.day))) wrong++;
    if (!has && works(s.id, d.day) && !onLeave(s.id, d.day)) missing++;
  }));
  const cleanWrong = () => setDraft((p) => { const n = {}; Object.entries(p).forEach(([k, v]) => { const [id, day] = k.split("|"); if (works(id, +day) && !onLeave(id, +day)) n[k] = v; }); return n; });

  function close() { if (dirty && !window.confirm("Die Änderungen an den Einsatzorten werden nicht übernommen. Schließen?")) return; onClose(); }

  async function setMode(on) {
    setBusy(true); setMsg("");
    const r = await orgCtx.supabase.rpc("set_location_mode", { p_org: orgCtx.orgId, p_multi: on });
    setBusy(false);
    if (r.error) { setMsg(r.error.message); return; }
    setMsg(on ? "Mehrere Einsatzorte ✓ – jetzt Orte anlegen." : "Ein Arbeitsort ✓ – Einsatzorte werden nicht mehr angezeigt.");
    onChanged();
  }
  async function saveLoc() {
    setBusy(true); setMsg("");
    const r = await orgCtx.supabase.rpc("save_work_location", { p_org: orgCtx.orgId, p_id: form.id || null, p_name: form.name, p_address: form.address, p_color: form.color, p_active: form.active });
    setBusy(false);
    if (r.error) { setMsg(r.error.message); return; }
    setMsg(`„${form.name.trim()}“ gespeichert ✓`); setForm(null); onChanged();
  }

  const tabBtn = (k, t) => <button onClick={() => setTab(k)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === k ? "bg-teal-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{t}</button>;
  const active = locations.filter((l) => l.active);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Einsatzorte" className="w-full max-w-5xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">📍 Einsatzorte · {monthLabel}</h2>
            <div className="mt-0.5 text-xs text-slate-500">Wer arbeitet wo? Die Mitarbeitenden sehen den Ort erst nach „Veröffentlichen“, zusammen mit dem Plan.</div>
          </div>
          <button onClick={close} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Schließen</button>
        </div>
        <div className="mt-3 flex gap-2">{multi && tabBtn("plan", "Plan")}{canManage && tabBtn("orte", "Orte & Einstellung")}</div>
        {msg && <div role="status" className="mt-2 rounded-lg bg-teal-50 p-2 text-xs text-teal-900">{msg}</div>}

        {tab === "plan" && multi && (
          active.length === 0 ? <div className="mt-3 text-xs text-slate-600">Noch keine Orte angelegt.{canManage ? " Unter „Orte & Einstellung“ anlegen." : " Bitte Inhaber oder Leitung fragen."}</div> : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Ort wählen:</span>
              {active.map((l) => (
                <button key={l.id} onClick={() => setBrush(l.id)} aria-pressed={brush === l.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold text-white ${brush === l.id ? "ring-2 ring-offset-1 ring-slate-800" : "opacity-80"}`} style={{ background: l.color }}>{l.name}</button>
              ))}
              <button onClick={() => setBrush("")} aria-pressed={brush === ""} className={`rounded-full border border-slate-300 px-2.5 py-1 text-xs ${brush === "" ? "ring-2 ring-offset-1 ring-slate-800" : ""}`}>✕ Ort entfernen</button>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Tippen auf ein Feld = dieser Tag · auf einen Namen = alle Arbeitstage der Person · auf eine Tageszahl = alle, die an dem Tag arbeiten.</div>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="border-collapse text-[11px]">
                <thead><tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left">Person</th>
                  {days.map((d) => (
                    <th key={d.day} className={`px-0.5 py-1 font-medium ${d.isWeekend || d.isHoliday ? "bg-slate-50" : ""}`}>
                      <button onClick={() => paintDay(d.day)} title={`Alle, die am ${d.day}. arbeiten`} className="w-7 rounded hover:bg-teal-50"><div>{d.day}</div><div className="text-[9px] text-slate-400">{WD[d.weekday]}</div></button>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {staffList.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-2 py-0.5"><button onClick={() => paintPerson(s.id)} title="Alle Arbeitstage dieser Person" className="whitespace-nowrap text-left font-medium hover:underline">{s.name}</button></td>
                      {days.map((d) => {
                        const l = byId[draft[`${s.id}|${d.day}`]]; const w = works(s.id, d.day); const lv = onLeave(s.id, d.day);
                        const bad = l && (!w || lv);
                        return (
                          <td key={d.day} className="px-0.5 py-0.5">
                            <button onClick={() => paintCell(s.id, d.day)} aria-label={`${s.name}, ${d.day}.: ${l ? l.name : "kein Ort"}${w ? "" : " (keine Schicht)"}`}
                              className={`h-6 w-7 rounded text-[10px] font-bold ${bad ? "ring-2 ring-rose-500" : ""} ${l ? "text-white" : w && !lv ? "border border-dashed border-slate-300 bg-white text-slate-300" : "bg-slate-100 text-slate-300"}`}
                              style={l ? { background: l.color } : undefined}>{l ? shortName(l.name) : lv ? "U" : w ? "·" : ""}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {missing > 0 ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-900">{missing} Schicht{missing === 1 ? "" : "en"} noch ohne Ort</span> : <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">Jede Schicht hat einen Ort ✓</span>}
              {wrong > 0 && <span className="rounded bg-rose-50 px-2 py-1 text-rose-800">⚠️ {wrong} Ort{wrong === 1 ? "" : "e"} an Tagen ohne Schicht oder mit Urlaub/Abwesenheit <button onClick={cleanWrong} className="ml-1 underline">entfernen</button></span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => onApply(draft)} disabled={!dirty} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">Übernehmen</button>
              <button onClick={close} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">Abbrechen</button>
              <span className="self-center text-[11px] text-slate-500">„Übernehmen“ ändert nur den Entwurf. Gespeichert wird mit „Zwischenspeichern“ / „Veröffentlichen“.</span>
            </div>
          </>
        ))}

        {tab === "orte" && canManage && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="locmode" checked={!multi} disabled={busy} onChange={() => setMode(false)} /> Ein Arbeitsort</label>
              <label className="flex items-center gap-2"><input type="radio" name="locmode" checked={multi} disabled={busy} onChange={() => setMode(true)} /> Mehrere Einsatzorte</label>
            </div>
            {multi && (
              <>
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {locations.length === 0 && <li className="p-2 text-xs text-slate-500">Noch keine Orte.</li>}
                  {locations.map((l) => (
                    <li key={l.id} className={`flex items-center justify-between gap-2 p-2 ${l.active ? "" : "opacity-50"}`}>
                      <span className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded" style={{ background: l.color }} /><b>{l.name}</b><span className="text-xs text-slate-500">{l.address || "(keine Adresse)"}</span>{!l.active && <span className="text-xs">· inaktiv</span>}</span>
                      <button onClick={() => setForm({ id: l.id, name: l.name, address: l.address || "", color: l.color, active: l.active })} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs">Ändern</button>
                    </li>
                  ))}
                </ul>
                {!form && <button onClick={() => setForm({ id: null, name: "", address: "", color: COLORS[locations.length % COLORS.length], active: true })} className="mt-2 rounded-md border border-slate-200 px-2.5 py-1 text-xs">+ Neuer Ort</button>}
                {form && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                    <label className="text-xs text-slate-600">Name<input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Filiale Nord" className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <label className="text-xs text-slate-600">Adresse (für „Route“ in der App)<input value={form.address} maxLength={200} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Straße Nr., PLZ Ort" className="mt-1 block w-64 rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <div className="text-xs text-slate-600">Farbe<div className="mt-1 flex gap-1">{COLORS.map((c) => <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={`Farbe ${c}`} className={`h-6 w-6 rounded ${form.color === c ? "ring-2 ring-offset-1 ring-slate-800" : ""}`} style={{ background: c }} />)}</div></div>
                    {form.id && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> aktiv</label>}
                    <button onClick={saveLoc} disabled={busy || !form.name.trim()} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Speichern</button>
                    <button onClick={() => setForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs">Abbrechen</button>
                    <div className="w-full text-[11px] text-slate-500">Orte werden nie gelöscht, nur „inaktiv“ – frühere Pläne und Stundenzettel bleiben richtig.</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
