"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { if (!ts) return "–"; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = (a, b) => { if (!a || !b) return "–"; const m = Math.round((new Date(b) - new Date(a)) / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };

// Popup "Anwesenheit" (Leitung / Inhaber): who is here now, today's stamps, terminals, PIN reset.
// Read only for the times – corrections come in step 2 (with reason, logged).
export default function AttendanceDialog({ onClose }) {
  const org = useContext(OrgContext);
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [devices, setDevices] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [badges, setBadges] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [newCard, setNewCard] = useState(null); // { staffId, code }
  const [needPin, setNeedPin] = useState(false);
  const [reqs, setReqs] = useState([]);       // open correction requests
  const [missing, setMissing] = useState([]); // planned, shift started > 2 h ago, nobody stamped
  const [denyReq, setDenyReq] = useState(null); // { id, note }
  const [edit, setEdit] = useState({ staffId: "", date: "" }); // "Zeiten bearbeiten"
  const [daySessions, setDaySessions] = useState(null);
  const [fix, setFix] = useState(null);        // { sessionId|null, in, out, reason }
  const [pairName, setPairName] = useState(null); // null = closed, string = form open
  const [pairCode, setPairCode] = useState(null); // { code, name, expiresAt }
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const load = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setTime(since.getTime() - 20 * 3600000); // includes night shifts from yesterday
    const s = await org.supabase.from("attendance_sessions").select("id, staff_id, check_in, check_out").eq("org_id", org.orgId).gte("check_in", since.toISOString()).order("check_in", { ascending: false });
    const st = await org.supabase.from("staff").select("id, name").eq("org_id", org.orgId);
    const dv = await org.supabase.from("devices").select("id, serial, name, active, created_at").eq("org_id", org.orgId).order("created_at");
    const bg = await org.supabase.from("badges").select("id, staff_id, badge_code, revoked_at, issued_at").eq("org_id", org.orgId);
    const og = await org.supabase.from("organizations").select("card_requires_pin").eq("id", org.orgId);
    setBadges((bg.data || []).filter((b) => !b.revoked_at));
    setNeedPin(!!(og.data && og.data[0] && og.data[0].card_requires_pin));
    setStaffList((st.data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
    // "Noch nicht eingestempelt": published shifts that started 3 to 20 hours ago without any Kommen
    const now = Date.now();
    const sh = await org.supabase.from("scheduled_shifts").select("staff_id, shift_label, shift_key, planned_start").eq("org_id", org.orgId).eq("status", "published").gte("planned_start", new Date(now - 20 * 3600000).toISOString()).lt("planned_start", new Date(now - 3 * 3600000).toISOString());
    const recent = (s.data || []);
    setMissing(sh.error ? [] : (sh.data || []).filter((x) => !recent.some((r) => r.staff_id === x.staff_id && r.check_in && new Date(r.check_in).getTime() >= new Date(x.planned_start).getTime() - 3 * 3600000)));
    const rq = await org.supabase.from("attendance_correction_requests").select("id, staff_id, session_id, work_date, check_in, check_out, reason, status, created_at").eq("org_id", org.orgId).eq("status", "open").order("created_at");
    setReqs(rq.error ? [] : rq.data || []);
    const n = {}; (st.data || []).forEach((x) => { n[x.id] = x.name; });
    setNames(n); setRows(s.data || []); setDevices((dv.data || []).filter((d) => String(d.serial).startsWith("T-")));
  }, [org]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") closeRef.current(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const present = (rows || []).filter((r) => r.check_in && !r.check_out);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = (rows || []).filter((r) => new Date(r.check_in || r.check_out) >= todayStart || !r.check_out);

  async function resetPin(id) {
    if (!window.confirm(`Stempel-PIN von ${names[id] || "?"} löschen? Die Person legt danach in der App eine neue fest.`)) return;
    setBusy("pin" + id);
    const { error } = await org.supabase.rpc("reset_staff_pin", { p_org: org.orgId, p_staff: id });
    setBusy(""); setMsg(error ? error.message : `PIN von ${names[id]} gelöscht ✓`);
  }
  async function addCard() {
    const code = String(newCard.code || "").trim();
    if (!newCard.staffId || code.length < 4) { setMsg("Bitte Person wählen und die Karte an das Kartenlesegerät halten."); return; }
    setBusy("card");
    const { error } = await org.supabase.from("badges").insert({ org_id: org.orgId, staff_id: newCard.staffId, badge_code: code });
    setBusy("");
    if (error) { setMsg(/duplicate|unique/i.test(error.message) ? "Diese Karte gehört schon einer anderen Person." : error.message); return; }
    setMsg(`Karte für ${names[newCard.staffId]} gespeichert ✓`); setNewCard(null); load();
  }
  async function revokeCard(b) {
    if (!window.confirm(`Karte von ${names[b.staff_id] || "?"} entziehen? Sie funktioniert danach nicht mehr (z. B. bei Verlust).`)) return;
    setBusy("rv" + b.id);
    const { error } = await org.supabase.from("badges").update({ revoked_at: new Date().toISOString() }).eq("id", b.id);
    setBusy(""); setMsg(error ? error.message : "Karte entzogen ✓"); load();
  }
  async function toggleNeedPin(on) {
    setBusy("np");
    const { error } = await org.supabase.rpc("set_card_requires_pin", { p_org: org.orgId, p_on: on });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setNeedPin(on); setMsg(on ? "Ab jetzt: Karte + PIN ✓" : "Ab jetzt: Karte allein genügt ✓");
  }
  // ---- corrections ----
  const monthClosed = async (staffId, dateIso) => {
    const [y, m] = dateIso.split("-").map(Number);
    const r = await org.supabase.from("staff_month_balance").select("year").eq("org_id", org.orgId).eq("staff_id", staffId).eq("year", y).eq("month", m);
    return !r.error && r.data && r.data.length > 0;
  };
  async function decideReq(q, approve, note) {
    if (approve && (await monthClosed(q.staff_id, q.work_date)) && !window.confirm("Dieser Monat ist für die Person schon abgeschlossen (Saldo). Trotzdem übernehmen?")) return;
    setBusy("rq" + q.id);
    const { error } = await org.supabase.rpc("decide_correction_request", { p_id: q.id, p_approve: approve, p_note: note || null });
    setBusy(""); setDenyReq(null);
    setMsg(error ? error.message : approve ? `Korrektur für ${names[q.staff_id]} übernommen ✓` : "Antrag abgelehnt ✓"); load();
  }
  async function loadDay(staffId, date) {
    setEdit({ staffId, date }); setFix(null);
    if (!staffId || !date) { setDaySessions(null); return; }
    const from = new Date(`${date}T00:00:00`), to = new Date(from.getTime() + 86400000);
    const r = await org.supabase.from("attendance_sessions").select("id, check_in, check_out").eq("org_id", org.orgId).eq("staff_id", staffId).gte("check_in", from.toISOString()).lt("check_in", to.toISOString()).order("check_in");
    setDaySessions(r.error ? [] : r.data || []);
  }
  const atTime = (date, hhmm, after) => { if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return null; const t = new Date(`${date}T${hhmm.padStart(5, "0")}:00`); if (after && t <= after) t.setDate(t.getDate() + 1); return t; };
  async function saveFix() {
    const { staffId, date } = edit;
    if (fix.reason.trim().length < 3) { setMsg("Bitte einen Grund angeben."); return; }
    if ((await monthClosed(staffId, date)) && !window.confirm("Dieser Monat ist für die Person schon abgeschlossen (Saldo). Trotzdem ändern?")) return;
    setBusy("fix");
    let error = null;
    if (fix.sessionId) {
      const s0 = (daySessions || []).find((x) => x.id === fix.sessionId);
      const tin = fix.in ? atTime(date, fix.in) : null;
      const tout = fix.out ? atTime(date, fix.out, tin || (s0 && s0.check_in ? new Date(s0.check_in) : null)) : null;
      if (!tin && !tout) { setBusy(""); setMsg("Bitte Kommen und/oder Gehen eintragen."); return; }
      if (tin) ({ error } = await org.supabase.rpc("correct_attendance", { p_session_id: fix.sessionId, p_field: "check_in", p_new_value: tin.toISOString(), p_reason: fix.reason.trim() }));
      if (!error && tout) ({ error } = await org.supabase.rpc("correct_attendance", { p_session_id: fix.sessionId, p_field: "check_out", p_new_value: tout.toISOString(), p_reason: fix.reason.trim() }));
    } else {
      const tin = atTime(date, fix.in), tout = atTime(date, fix.out, tin);
      if (!tin || !tout) { setBusy(""); setMsg("Bitte Kommen und Gehen eintragen."); return; }
      ({ error } = await org.supabase.rpc("add_attendance_session", { p_org: org.orgId, p_staff: staffId, p_in: tin.toISOString(), p_out: tout.toISOString(), p_reason: fix.reason.trim() }));
    }
    setBusy("");
    if (error) { setMsg(error.message); return; }
    setMsg(`Gespeichert ✓ (mit Grund protokolliert)`); setFix(null); loadDay(staffId, date); load();
  }

  async function createPairCode() {
    setBusy("pair"); setMsg("");
    try {
      const { data } = await org.supabase.auth.getSession();
      const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ action: "pair-create", org_id: org.orgId, name: pairName || "Terminal" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      setPairCode(body); setPairName(null);
    } catch (e) { setMsg(e.message); }
    setBusy("");
  }
  async function toggleDevice(d) {
    if (d.active && !window.confirm(`Terminal „${d.name}“ sperren? Es zeigt dann keinen QR-Code mehr.`)) return;
    setBusy("dev" + d.id);
    const { error } = await org.supabase.from("devices").update({ active: !d.active }).eq("id", d.id);
    setBusy(""); setMsg(error ? error.message : d.active ? "Terminal gesperrt ✓" : "Terminal wieder aktiv ✓"); load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="att-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="att-title" className="text-base font-semibold">Anwesenheit</h2>
            <div className="mt-0.5 text-xs text-slate-500">Stempelzeiten nimmt der Server; sie lassen sich nicht nachträglich ändern. Aktualisiert sich alle 30 Sekunden.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>
        {msg && <div role="status" className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">{msg}</div>}
        {rows === null ? <div className="mt-4 text-xs text-slate-500">Lädt …</div> : (
          <>
            {reqs.length > 0 && (
              <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Korrekturanträge ({reqs.length})</h3>
                <ul className="mt-1 space-y-2">
                  {reqs.map((q) => (
                    <li key={q.id} className="rounded-lg bg-white p-2">
                      <div className="font-medium">{names[q.staff_id] || "?"} · {q.work_date.split("-").reverse().join(".")}</div>
                      <div className="text-xs text-slate-700">{q.check_in ? `Kommen ${clock(q.check_in)} ` : ""}{q.check_out ? `Gehen ${clock(q.check_out)}` : ""}{q.session_id ? "" : " (ganz vergessen)"} · „{q.reason}“</div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <button onClick={() => decideReq(q, true)} disabled={!!busy} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 active:translate-y-px">Übernehmen</button>
                        <button onClick={() => setDenyReq({ id: q.id, note: "" })} disabled={!!busy} className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Ablehnen</button>
                      </div>
                      {denyReq && denyReq.id === q.id && (
                        <div className="mt-1.5 flex flex-wrap items-end gap-2">
                          <input autoFocus value={denyReq.note} maxLength={500} onChange={(e) => setDenyReq({ ...denyReq, note: e.target.value })} placeholder="Grund (sieht die Person)" className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                          <button onClick={() => decideReq(q, false, denyReq.note)} className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Ablehnen</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missing.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">Noch nicht eingestempelt ({missing.length})</h3>
                <div className="mt-1 flex flex-wrap gap-2">{missing.map((x, i) => <span key={i} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900">● {names[x.staff_id] || "?"} <span className="text-amber-700">{x.shift_label || x.shift_key} seit {clock(x.planned_start)}</span></span>)}</div>
                <div className="mt-1 text-[11px] text-slate-500">Schicht hat vor mehr als 3 Stunden begonnen, aber kein Kommen. Vergessen? Dann unten unter „Zeiten bearbeiten“ nachtragen.</div>
              </>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Jetzt da ({present.length})</h3>
            {present.length === 0 ? <div className="mt-1 text-xs text-slate-500">Im Moment ist niemand eingestempelt.</div> : (
              <div className="mt-1 flex flex-wrap gap-2">{present.map((r) => <span key={r.id} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-900">● {names[r.staff_id] || "?"} <span className="text-emerald-700">seit {clock(r.check_in)}</span></span>)}</div>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Heute</h3>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-slate-500"><th className="py-1.5 pr-2">Name</th><th className="py-1.5 pr-2">Kommen</th><th className="py-1.5 pr-2">Gehen</th><th className="py-1.5 pr-2">Dauer</th><th /></tr></thead>
                <tbody>
                  {today.length === 0 && <tr><td colSpan={5} className="py-2 text-xs text-slate-500">Heute noch keine Stempelungen.</td></tr>}
                  {today.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 font-medium">{names[r.staff_id] || "?"}</td>
                      <td className={`py-1.5 pr-2 ${r.check_in ? "" : "text-amber-700"}`}>{r.check_in ? clock(r.check_in) : "fehlt"}</td>
                      <td className="py-1.5 pr-2">{r.check_out ? clock(r.check_out) : Date.now() - new Date(r.check_in).getTime() > 12 * 3600000 ? <span className="font-semibold text-amber-700">Gehen fehlt</span> : <span className="text-emerald-700">läuft</span>}</td>
                      <td className="py-1.5 pr-2">{dur(r.check_in, r.check_out)}</td>
                      <td className="py-1.5 text-right"><button onClick={() => resetPin(r.staff_id)} disabled={!!busy} className="text-xs text-slate-500 underline">PIN zurücksetzen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Zeiten bearbeiten (auch frühere Tage)</h3>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <select value={edit.staffId} onChange={(e) => loadDay(e.target.value, edit.date)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Person">
                <option value="">– Person –</option>
                {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input type="date" value={edit.date} onChange={(e) => loadDay(edit.staffId, e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Tag" />
            </div>
            {daySessions && (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                {daySessions.length === 0 && <div className="text-xs text-slate-500">An diesem Tag gibt es keine Stempelung.</div>}
                {daySessions.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span>Kommen <b>{clock(x.check_in)}</b> · Gehen <b>{x.check_out ? clock(x.check_out) : "fehlt"}</b></span>
                    <button onClick={() => setFix({ sessionId: x.id, in: "", out: "", reason: "" })} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Korrigieren</button>
                  </div>
                ))}
                {!fix && <button onClick={() => setFix({ sessionId: null, in: "", out: "", reason: "" })} className="mt-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">+ Zeit nachtragen</button>}
                {fix && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2">
                    <label className="text-xs text-slate-600">Kommen<input type="time" value={fix.in} onChange={(e) => setFix({ ...fix, in: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <label className="text-xs text-slate-600">Gehen<input type="time" value={fix.out} onChange={(e) => setFix({ ...fix, out: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <label className="text-xs text-slate-600">Grund (Pflicht)<input value={fix.reason} maxLength={500} onChange={(e) => setFix({ ...fix, reason: e.target.value })} placeholder="z. B. Gehen vergessen" className="mt-1 block w-52 rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <button onClick={saveFix} disabled={busy === "fix"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "fix" ? "Moment …" : fix.sessionId ? "Korrektur speichern" : "Nachtragen"}</button>
                    <button onClick={() => setFix(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                    {fix.sessionId && <div className="w-full text-[11px] text-slate-500">Nur das eintragen, was falsch ist. Die Stempelung selbst bleibt erhalten; die Korrektur wird mit Grund protokolliert.</div>}
                  </div>
                )}
              </div>
            )}

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Chipkarten ({badges.length})</h3>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={needPin} disabled={!!busy} onChange={(e) => toggleNeedPin(e.target.checked)} />
              Karte + PIN erforderlich <span className="text-slate-400">(sonst genügt die Karte allein)</span>
            </label>
            <ul className="mt-1 divide-y divide-slate-100">
              {badges.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{names[b.staff_id] || "?"} <span className="text-xs text-slate-400">Karte …{String(b.badge_code).slice(-4)}</span></span>
                  <button onClick={() => revokeCard(b)} disabled={!!busy} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Entziehen</button>
                </li>
              ))}
            </ul>
            {newCard ? (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-600">Person
                    <select value={newCard.staffId} onChange={(e) => setNewCard((c) => ({ ...c, staffId: e.target.value }))} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">– wählen –</option>
                      {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">Kartennummer
                    <input autoFocus value={newCard.code} onChange={(e) => setNewCard((c) => ({ ...c, code: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCard(); } }}
                      placeholder="Karte an das Kartenlesegerät halten …" className="mt-1 block w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono" />
                  </label>
                  <button onClick={addCard} disabled={busy === "card"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "card" ? "Moment …" : "Speichern"}</button>
                  <button onClick={() => setNewCard(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Das Kartenlesegerät an diesen Computer stecken, ins Feld klicken und die Karte oder den Chip davor halten – die Nummer erscheint von selbst.</div>
              </div>
            ) : (
              <button onClick={() => setNewCard({ staffId: "", code: "" })} className="mt-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Karte zuweisen</button>
            )}

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Terminals</h3>
            {pairCode ? (
              <div className="mt-2 rounded-xl border-2 border-teal-300 bg-teal-50 p-3 text-center">
                <div className="text-xs text-slate-600">Einrichtungs-Code für „{pairCode.name}“</div>
                <div className="my-1 font-mono text-3xl font-bold tracking-widest text-slate-900">{pairCode.code}</div>
                <div className="text-xs text-slate-600">Auf dem Tablet <b>{typeof window !== "undefined" ? window.location.origin : ""}/terminal</b> öffnen und diesen Code eingeben. Gilt einmal, 24 Stunden.<br />Sie müssen dafür nicht vor Ort sein – den Code können Sie auch telefonisch durchgeben.</div>
                <button onClick={() => setPairCode(null)} className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Fertig</button>
              </div>
            ) : pairName !== null ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                <label className="text-xs text-slate-600">Name des Terminals
                  <input autoFocus value={pairName} onChange={(e) => setPairName(e.target.value)} maxLength={60} placeholder="z. B. Terminal Eingang" className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <button onClick={createPairCode} disabled={busy === "pair"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "pair" ? "Moment …" : "Code erstellen"}</button>
                <button onClick={() => setPairName(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setPairName("Terminal Eingang")} className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Neues Terminal einrichten</button>
            )}
            <ul className="mt-1 divide-y divide-slate-100">
              {devices.length === 0 && <li className="py-2 text-xs text-slate-500">Noch kein Terminal eingerichtet.</li>}
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{d.name} <span className="text-xs text-slate-400">{d.serial}</span> {d.active ? <span className="text-xs text-emerald-700">aktiv</span> : <span className="text-xs text-rose-700">gesperrt</span>}</span>
                  <button onClick={() => toggleDevice(d)} disabled={!!busy} className={`rounded-lg border px-2.5 py-1 text-xs active:translate-y-px ${d.active ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`}>{d.active ? "Sperren" : "Entsperren"}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
