"use client";

import React, { useEffect, useMemo, useState } from "react";
import { isoOf, weeksOfMonth } from "../lib/locations";

// „Mehrere Standorte“ (Dienstplaner allgemein, Skript 32) – shown at the top of the planner, ONLY when the platform
// administration (/admin) released it for this company. Inhaber/Leitung choose „Ein Arbeitsort“ (default, nothing
// changes) or „Mehrere Einsatzorte“; then every place gets a card:
//   * name + short code (instead of a colour, readable in black-and-white print) + address (for „Route“ in the app)
//   * the shifts of this place: name, time, people on weekdays and on weekends/holidays, „Ruhe danach“
//   * the team: who works here this month or this week (chosen per place). Next to every name: hours already planned
//     this month at ALL places / monthly goal (Ziel), so one sees who still has room.
// Places and shifts are never deleted, only set inactive (old plans and time sheets keep their names).
//
// props: orgCtx, canManage, multi, locations, locShifts, teams [{location_id, staff_id, period_start}],
//        year, monthIdx, staffList, hoursOf(id) -> { h, t }, onChanged()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1).replace(".", ",");
const hm = (t) => String(t || "").slice(0, 5);
const inp = "rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
const btn = "rounded-lg px-2.5 py-1.5 text-xs font-medium active:translate-y-px disabled:opacity-50";

export default function StandorteSettings({ orgCtx, canManage, multi, locations, locShifts, teams, year, monthIdx, staffList, hoursOf, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [newOpen, setNewOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const sb = orgCtx.supabase;

  async function call(fn, args, okText) {
    setBusy(true); setMsg(null);
    const r = await sb.rpc(fn, args);
    setBusy(false);
    if (r.error) { setMsg({ ok: false, text: r.error.message }); return null; }
    if (okText) setMsg({ ok: true, text: okText });
    onChanged();
    return { data: r.data };
  }
  async function setMode(on) {
    if (!on && !window.confirm("Zurück zu „Ein Arbeitsort“?\n\nDie Orte, ihre Schichten und Teams bleiben gespeichert und sind beim Wiedereinschalten wieder da. Pläne mit Schichten der Orte lassen sich dann nicht mehr bearbeiten.")) return;
    await call("set_location_mode", { p_org: orgCtx.orgId, p_multi: on }, on ? "Mehrere Einsatzorte ✓ – jetzt die Orte anlegen." : "Ein Arbeitsort ✓");
  }

  const active = locations.filter((l) => l.active);
  const inactive = locations.filter((l) => !l.active);
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3" aria-label="Arbeitsorte">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">📍 Arbeitsorte</h2>
        <div role="radiogroup" aria-label="Arbeitsorte" className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {[[false, "Ein Arbeitsort"], [true, "Mehrere Einsatzorte"]].map(([v, t]) => (
            <button key={t} role="radio" aria-checked={multi === v} disabled={!canManage || busy || multi === v} onClick={() => setMode(v)}
              className={`px-3 py-1.5 ${multi === v ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:cursor-default`}>{t}</button>
          ))}
        </div>
      </div>
      {!canManage && <p className="text-xs text-slate-500">Orte, Schichten und Teams legen Inhaber oder Leitung fest.</p>}
      {msg && <div role="status" className={`rounded-lg p-2 text-xs ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
      {!multi ? (
        <p className="text-xs text-slate-500">Alle arbeiten am selben Ort – der Dienstplaner bleibt wie bisher. Mit „Mehrere Einsatzorte“ bekommt jeder Ort eigene Schichten, eine eigene Besetzung und ein eigenes Team.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">Jeder Ort hat eigene Schichten und ein eigenes Team. Eine Person kann zu mehreren Orten gehören, hat aber nie zwei Schichten an einem Tag. Im Plan steht das Kürzel des Ortes – auch im Ausdruck.</p>
          {active.length === 0 && !newOpen && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">Noch kein Ort angelegt.</p>}
          {active.map((l) => (
            <PlaceCard key={l.id} loc={l} shifts={locShifts.filter((s) => s.location_id === l.id)} teams={teams} locations={locations} canManage={canManage} busy={busy} call={call}
              orgId={orgCtx.orgId} year={year} monthIdx={monthIdx} staffList={staffList} hoursOf={hoursOf} />
          ))}
          {canManage && (newOpen
            ? <PlaceForm loc={null} busy={busy} onCancel={() => setNewOpen(false)} onSave={async (f) => { const ok = await call("save_work_location", { p_org: orgCtx.orgId, p_id: null, p_name: f.name, p_code: f.code, p_address: f.address, p_team_period: f.period, p_active: true }, `„${f.name.trim()}“ angelegt ✓ – jetzt Schichten und Team eintragen.`); if (ok) setNewOpen(false); }} />
            : <button onClick={() => setNewOpen(true)} className={`${btn} border border-dashed border-teal-300 text-teal-700 hover:bg-teal-50`}>+ Ort hinzufügen</button>)}
          {inactive.length > 0 && (
            <div className="text-xs text-slate-500">
              <button onClick={() => setShowInactive((v) => !v)} className="underline">Inaktive Orte ({inactive.length})</button>
              {showInactive && (
                <ul className="mt-1 space-y-1">
                  {inactive.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Code c={l.code} muted /> {l.name}
                      {canManage && <button disabled={busy} onClick={() => call("save_work_location", { p_org: orgCtx.orgId, p_id: l.id, p_name: l.name, p_code: l.code || "", p_address: l.address || "", p_team_period: l.team_period, p_active: true }, `„${l.name}“ ist wieder aktiv ✓`)} className="underline text-teal-700">wieder aktivieren</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Code({ c, muted }) {
  return <span className={`inline-block min-w-[2.2rem] rounded border-2 px-1.5 text-center text-xs font-extrabold ${muted ? "border-slate-300 text-slate-400" : "border-slate-800 text-slate-800"}`}>{c || "?"}</span>;
}

function PlaceForm({ loc, busy, onSave, onCancel, onDeactivate }) {
  const [f, setF] = useState({ name: loc ? loc.name : "", code: loc ? loc.code || "" : "", address: loc ? loc.address || "" : "", period: loc ? loc.team_period || "month" : "month" });
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-600">Name<input aria-label="Name des Ortes" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Filiale Nord" className={`mt-1 block w-48 ${inp}`} /></label>
        <label className="text-xs text-slate-600">Kürzel<input aria-label="Kürzel" value={f.code} maxLength={6} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="N1" className={`mt-1 block w-20 font-bold ${inp}`} /></label>
        <label className="text-xs text-slate-600">Adresse (für „Route“ in der App)<input aria-label="Adresse" value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Straße Nr., PLZ Ort" className={`mt-1 block w-64 ${inp}`} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>Team festlegen:</span>
        <label className="inline-flex items-center gap-1"><input type="radio" checked={f.period === "month"} onChange={() => setF({ ...f, period: "month" })} /> monatlich</label>
        <label className="inline-flex items-center gap-1"><input type="radio" checked={f.period === "week"} onChange={() => setF({ ...f, period: "week" })} /> wöchentlich (Mo–So)</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !f.name.trim() || !f.code.trim()} onClick={() => onSave(f)} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>Speichern</button>
        <button onClick={onCancel} className={`${btn} border border-slate-200 bg-white text-slate-600`}>Abbrechen</button>
        {onDeactivate && <button disabled={busy} onClick={onDeactivate} className={`${btn} ml-auto text-rose-700 hover:bg-rose-50`}>Ort inaktiv setzen</button>}
      </div>
    </div>
  );
}

function PlaceCard({ loc, shifts, teams, locations, canManage, busy, call, orgId, year, monthIdx, staffList, hoursOf }) {
  const [edit, setEdit] = useState(false);
  const activeShifts = shifts.filter((s) => s.active);
  const oldShifts = shifts.filter((s) => !s.active);
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      {edit ? (
        <PlaceForm loc={loc} busy={busy} onCancel={() => setEdit(false)}
          onSave={async (f) => { const ok = await call("save_work_location", { p_org: orgId, p_id: loc.id, p_name: f.name, p_code: f.code, p_address: f.address, p_team_period: f.period, p_active: true }, `„${f.name.trim()}“ gespeichert ✓`); if (ok) setEdit(false); }}
          onDeactivate={async () => { if (!window.confirm(`„${loc.name}“ inaktiv setzen?\n\nDer Ort erscheint nicht mehr im Plan. Frühere Pläne und Stundenzettel behalten ihn.`)) return; const ok = await call("save_work_location", { p_org: orgId, p_id: loc.id, p_name: loc.name, p_code: loc.code || "", p_address: loc.address || "", p_team_period: loc.team_period, p_active: false }, `„${loc.name}“ ist inaktiv.`); if (ok) setEdit(false); }} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Code c={loc.code} />
            <div>
              <div className="text-sm font-semibold text-slate-800">{loc.name}</div>
              <div className="text-xs text-slate-500">{loc.address || <span className="text-amber-700">keine Adresse – in der App gibt es dann keine „Route“</span>}</div>
            </div>
          </div>
          {canManage && <button onClick={() => setEdit(true)} className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`}>Bearbeiten</button>}
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Schichten an diesem Ort</div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pr-2 py-1 font-medium">Schicht</th><th className="pr-2 py-1 font-medium">von</th><th className="pr-2 py-1 font-medium">bis</th>
                <th className="pr-2 py-1 font-medium" title="Personen gleichzeitig Montag bis Freitag">Personen Mo–Fr</th>
                <th className="pr-2 py-1 font-medium" title="Personen gleichzeitig an Samstag, Sonntag und Feiertagen (0 = diese Schicht gibt es dann nicht)">Sa/So/Feiertag</th>
                <th className="pr-2 py-1 font-medium" title="Nach einem Block dieser Schicht (z. B. Nachtdienst) 2 freie Tage">Ruhe danach</th><th />
              </tr>
            </thead>
            <tbody>
              {activeShifts.map((s) => <ShiftRow key={s.key} s={s} loc={loc} orgId={orgId} canManage={canManage} busy={busy} call={call} />)}
              {canManage && <ShiftRow key={`new-${activeShifts.length}`} s={null} loc={loc} orgId={orgId} canManage={canManage} busy={busy} call={call} />}
            </tbody>
          </table>
        </div>
        {activeShifts.length === 0 && <p className="text-xs text-amber-800">Noch keine Schicht – ohne Schicht erscheint der Ort nicht im Plan.</p>}
        {oldShifts.length > 0 && canManage && (
          <p className="mt-1 text-[11px] text-slate-400">Frühere Schichten: {oldShifts.map((s) => (
            <button key={s.key} disabled={busy} onClick={() => call("save_location_shift", { p_org: orgId, p_location: loc.id, p_key: s.key, p_label: s.label, p_start: hm(s.start_time), p_end: hm(s.end_time), p_weekday: s.count_weekday || 0, p_weekend: s.count_weekend || 0, p_rest: !!s.requires_rest_after, p_active: true }, `„${s.label}“ ist wieder aktiv ✓`)} className="mr-2 underline">{s.label} wieder aktivieren</button>
          ))}</p>
        )}
      </div>

      <TeamBox loc={loc} teams={teams} locations={locations} canManage={canManage} busy={busy} call={call} orgId={orgId} year={year} monthIdx={monthIdx} staffList={staffList} hoursOf={hoursOf} />
    </div>
  );
}

function ShiftRow({ s, loc, orgId, canManage, busy, call }) {
  const init = () => (s ? { label: s.label, start: hm(s.start_time), end: hm(s.end_time), wd: s.count_weekday ?? 1, we: s.count_weekend ?? 1, rest: !!s.requires_rest_after } : { label: "", start: "", end: "", wd: 1, we: 1, rest: false });
  const [f, setF] = useState(init);
  useEffect(() => { setF(init()); }, [s && s.label, s && s.start_time, s && s.end_time, s && s.count_weekday, s && s.count_weekend, s && s.requires_rest_after]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(init());
  const ro = !canManage;
  const save = () => call("save_location_shift", { p_org: orgId, p_location: loc.id, p_key: s ? s.key : null, p_label: f.label, p_start: f.start, p_end: f.end, p_weekday: Number(f.wd) || 0, p_weekend: Number(f.we) || 0, p_rest: f.rest, p_active: true },
    s ? `„${f.label.trim()}“ gespeichert ✓` : `Schicht „${f.label.trim()}“ für ${loc.code} angelegt ✓`);
  const num = (k) => <input type="number" min={0} max={20} disabled={ro} aria-label={k === "wd" ? "Personen Montag bis Freitag" : "Personen Samstag, Sonntag, Feiertag"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`w-14 text-center ${inp}`} />;
  return (
    <tr className={s ? "" : "opacity-80"}>
      <td className="pr-2 py-1"><input disabled={ro} aria-label="Name der Schicht" value={f.label} maxLength={40} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={s ? "" : "+ neue Schicht, z. B. Früh"} className={`w-36 ${inp}`} /></td>
      <td className="pr-2 py-1"><input type="time" disabled={ro} aria-label="Beginn" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inp} /></td>
      <td className="pr-2 py-1"><input type="time" disabled={ro} aria-label="Ende" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inp} /></td>
      <td className="pr-2 py-1">{num("wd")}</td>
      <td className="pr-2 py-1">{num("we")}</td>
      <td className="pr-2 py-1 text-center"><input type="checkbox" disabled={ro} aria-label="Ruhe danach" checked={f.rest} onChange={(e) => setF({ ...f, rest: e.target.checked })} /></td>
      <td className="py-1 whitespace-nowrap">
        {canManage && dirty && <button disabled={busy || !f.label.trim() || !f.start || !f.end} onClick={save} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>{s ? "Speichern" : "Hinzufügen"}</button>}
        {canManage && s && !dirty && <button disabled={busy} title="Schicht entfernen (frühere Pläne behalten sie)" aria-label={`Schicht ${s.label} entfernen`} onClick={() => { if (window.confirm(`Schicht „${s.label}“ an ${loc.code} entfernen?\n\nSie erscheint nicht mehr im Plan; frühere Pläne behalten sie.`)) call("save_location_shift", { p_org: orgId, p_location: loc.id, p_key: s.key, p_label: s.label, p_start: hm(s.start_time), p_end: hm(s.end_time), p_weekday: s.count_weekday || 0, p_weekend: s.count_weekend || 0, p_rest: !!s.requires_rest_after, p_active: false }, `„${s.label}“ entfernt.`); }} className={`${btn} text-slate-400 hover:text-rose-600`}>✕</button>}
      </td>
    </tr>
  );
}

function TeamBox({ loc, teams, locations, canManage, busy, call, orgId, year, monthIdx, staffList, hoursOf }) {
  const weekly = loc.team_period === "week";
  const weeks = useMemo(() => weeksOfMonth(year, monthIdx), [year, monthIdx]);
  const monthStart = isoOf(year, monthIdx, 1);
  const [period, setPeriod] = useState(weekly ? weeks[0].start : monthStart);
  useEffect(() => { setPeriod(weekly ? weeks[0].start : monthStart); }, [weekly, weeks, monthStart]);
  const saved = useMemo(() => new Set(teams.filter((t) => t.location_id === loc.id && t.period_start === period).map((t) => t.staff_id)), [teams, loc.id, period]);
  const [sel, setSel] = useState(saved);
  useEffect(() => { setSel(new Set(saved)); }, [saved]);
  const dirty = sel.size !== saved.size || [...sel].some((x) => !saved.has(x));
  const people = staffList.filter((s) => UUID.test(String(s.id)));
  const codeOf = Object.fromEntries(locations.map((l) => [l.id, l.code]));
  // other places this person belongs to in (an overlapping) period of this month
  const otherPlaces = (sid) => [...new Set(teams.filter((t) => t.staff_id === sid && t.location_id !== loc.id && (t.period_start === period || t.period_start === monthStart || (weekly ? false : weeks.some((w) => w.start === t.period_start)))).map((t) => codeOf[t.location_id]).filter(Boolean))];
  const weekLabel = (w) => `${w.label}${w.from.getMonth() !== monthIdx || w.to.getMonth() !== monthIdx ? " (Monatswechsel)" : ""}`;
  const toggle = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = () => call("save_location_team", { p_org: orgId, p_location: loc.id, p_period_start: period, p_staff: [...sel] }, `Team ${loc.code} gespeichert ✓ (${sel.size} Person${sel.size === 1 ? "" : "en"})`);
  async function saveAllWeeks() {
    if (!window.confirm(`Dieses Team (${sel.size} Personen) für alle ${weeks.length} Wochen von ${MONTH_DE[monthIdx]} übernehmen?`)) return;
    for (const w of weeks) { const ok = await call("save_location_team", { p_org: orgId, p_location: loc.id, p_period_start: w.start, p_staff: [...sel] }, null); if (!ok) return; }
    await call("save_location_team", { p_org: orgId, p_location: loc.id, p_period_start: period, p_staff: [...sel] }, `Team ${loc.code} für alle Wochen von ${MONTH_DE[monthIdx]} gespeichert ✓`);
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-slate-600">Team {weekly ? "der Woche" : `${MONTH_DE[monthIdx]} ${year}`}</span>
        {weekly && (
          <select aria-label="Woche" value={period} onChange={(e) => { if (dirty && !window.confirm("Die Änderungen am Team dieser Woche sind noch nicht gespeichert. Trotzdem wechseln?")) return; setPeriod(e.target.value); }} className={`${inp} text-xs`}>
            {weeks.map((w) => <option key={w.start} value={w.start}>{weekLabel(w)}</option>)}
          </select>
        )}
        <span className="text-[11px] text-slate-400">Std. = schon geplant in diesem Monat an allen Orten / Ziel</span>
      </div>
      {people.length === 0 ? (
        <p className="text-xs text-amber-800">Bitte zuerst oben „Personen aus Datenbank laden“.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => {
            const on = sel.has(p.id); const { h, t } = hoursOf(p.id); const room = t - h;
            const tone = room > 4 ? "text-emerald-700" : room >= -0.5 ? "text-amber-700" : "text-rose-700";
            const others = otherPlaces(p.id);
            return (
              <label key={p.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${on ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white"} ${canManage ? "cursor-pointer" : ""}`}>
                <input type="checkbox" disabled={!canManage} checked={on} onChange={() => toggle(p.id)} aria-label={`${p.name} im Team ${loc.code}`} />
                <span className="font-medium text-slate-800">{p.name}</span>
                <span className={`font-mono ${tone}`} title={room > 0 ? `noch ${fmt(room)} Std. bis zum Ziel` : `${fmt(-room)} Std. über dem Ziel`}>{fmt(h)} / {fmt(t)}</span>
                {others.length > 0 && <span className="text-slate-400">auch {others.join(", ")}</span>}
              </label>
            );
          })}
        </div>
      )}
      {canManage && people.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {dirty && <button disabled={busy} onClick={save} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>Team speichern</button>}
          {dirty && <button onClick={() => setSel(new Set(saved))} className={`${btn} border border-slate-200 text-slate-600`}>Verwerfen</button>}
          {weekly && sel.size > 0 && <button disabled={busy} onClick={saveAllWeeks} className={`${btn} text-teal-700 underline`}>für alle Wochen dieses Monats übernehmen</button>}
          {!dirty && <span className="text-[11px] text-slate-400">{saved.size ? `${saved.size} Person${saved.size === 1 ? "" : "en"} im Team` : "Noch niemand im Team"}</span>}
        </div>
      )}
    </div>
  );
}
