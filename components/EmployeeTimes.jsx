"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ABSENCE, absenceMap } from "../lib/absence";

const INK = "#1B2433", PRIMARY = "#243B6B", MUTED = "#6B7588", LINE = "#D9DEE7", PAPER = "#E9EEF8";
const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const BAR = { F: "#6CC4E8", M: "#F2B95A", B: "#9AA8F0", S: "#5FD0B0", N: "#B48DE8" };
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (min, sign = false) => {
  const neg = min < 0; const a = Math.round(Math.abs(min));
  return `${neg ? "−" : sign ? "+" : ""}${Math.floor(a / 60)}:${pad(a % 60)}`;
};
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// legal minimum break (§ 4 ArbZG): more than 6 h -> 30 min, more than 9 h -> 45 min
const breakFor = (gross) => (gross > 9 * 60 ? 45 : gross > 6 * 60 ? 30 : 0);
// planned time of a shift = duration minus the unpaid 30-minute break (as in the planner)
const plannedOf = (s) => { const d = (new Date(s.planned_end) - new Date(s.planned_start)) / 60000; return d > 6 * 60 ? d - 30 : d; };

const card = { background: "#fff", borderRadius: 20, padding: 16, marginBottom: 12, border: "1px solid #CBD8EE" };
const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", fontSize: 15 };

// Tab "Zeiten" of the employee app: time account, month list, day details. Read only – stamps are
// locked; corrections are made by the Leitung (with a reason that is logged).
export default function EmployeeTimes({ org }) {
  const sb = org.supabase;
  const hasProduct = (org.products || []).includes("time_tracking");
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sessions, setSessions] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [closed, setClosed] = useState([]);
  const [sel, setSel] = useState(null);
  const [pinSet, setPinSet] = useState(null);
  const [needPin, setNeedPin] = useState(false); // company setting "Karte + PIN"
  const [pinForm, setPinForm] = useState(null);
  const [pinMsg, setPinMsg] = useState({ text: "", bad: false });
  const [err, setErr] = useState("");
  const [reqs, setReqs] = useState([]);      // own correction requests
  const [corrs, setCorrs] = useState([]);    // corrections made by the Leitung (session_id, field)
  const [cform, setCform] = useState(null);  // { sessionId, in, out, reason }
  const [ttStart, setTtStart] = useState(null);
  const [absences, setAbsences] = useState([]);
  const [approved, setApproved] = useState([]); // approved Anträge (Urlaub / Fortbildung / Krank) // day the company switched on Zeiterfassung (no "fehlt" before)
  const [cmsg, setCmsg] = useState({ text: "", bad: false });

  const load = useCallback(async () => {
    setErr("");
    const s = await sb.from("attendance_sessions").select("id, check_in, check_out").eq("org_id", org.orgId).eq("staff_id", org.staffId).order("check_in", { ascending: true });
    if (s.error) { setErr(s.error.message); setSessions([]); return; }
    const sh = await sb.from("scheduled_shifts").select("shift_date, shift_key, shift_label, planned_start, planned_end").eq("org_id", org.orgId).eq("staff_id", org.staffId).eq("status", "published");
    const b = await sb.from("staff_month_balance").select("year, month, contract_hours, planned_hours").eq("org_id", org.orgId).eq("staff_id", org.staffId);
    setSessions(s.data || []); setShifts(sh.data || []); setClosed(b.error ? [] : b.data || []);
    const rq = await sb.from("attendance_correction_requests").select("id, session_id, work_date, check_in, check_out, reason, status, decision_note, created_at").eq("org_id", org.orgId).eq("staff_id", org.staffId).order("created_at", { ascending: false });
    setReqs(rq.error ? [] : rq.data || []);
    const ab = await sb.from("attendance_absences").select("id, work_date, kind, note, voided_at").eq("org_id", org.orgId).eq("staff_id", org.staffId);
    setAbsences(ab.error ? [] : ab.data || []);
    const ap = await sb.from("requests").select("type_key, date_from, date_to, status").eq("org_id", org.orgId).eq("staff_id", org.staffId).eq("status", "approved");
    setApproved(ap.error ? [] : ap.data || []);
    const tp = await sb.from("org_products").select("created_at").eq("org_id", org.orgId).eq("product", "time_tracking");
    setTtStart(tp.data && tp.data[0] && tp.data[0].created_at ? isoOf(new Date(tp.data[0].created_at)) : null);
    const co = await sb.from("attendance_corrections").select("session_id, field").eq("org_id", org.orgId).eq("staff_id", org.staffId);
    setCorrs(co.error ? [] : co.data || []);
    const og = await sb.from("organizations").select("card_requires_pin").eq("id", org.orgId);
    setNeedPin(!!(og.data && og.data[0] && og.data[0].card_requires_pin));
    const p = await sb.rpc("my_pin_is_set", { p_org: org.orgId });
    setPinSet(p.error ? null : !!p.data);
  }, [sb, org.orgId, org.staffId]);
  useEffect(() => { if (hasProduct) load(); }, [load, hasProduct]);

  // one entry per calendar day: worked (from stamps), planned (from the published plan)
  const days = useMemo(() => {
    const map = {};
    const get = (iso) => (map[iso] = map[iso] || { iso, sessions: [], shifts: [] });
    (sessions || []).forEach((s) => { const d = new Date(s.check_in || s.check_out); get(isoOf(d)).sessions.push(s); });
    shifts.forEach((s) => get(String(s.shift_date).slice(0, 10)).shifts.push(s));
    const am = absenceMap(absences, approved);
    Object.keys(am).forEach((iso) => { get(iso).absence = am[iso]; });
    Object.values(map).forEach((d) => {
      d.gross = d.sessions.reduce((t, s) => t + (s.check_in && s.check_out ? (new Date(s.check_out) - new Date(s.check_in)) / 60000 : 0), 0);
      d.open = d.sessions.some((s) => s.check_in && !s.check_out);
      d.missing = d.sessions.some((s) => !s.check_in);
      d.pause = breakFor(d.gross);
      d.worked = Math.max(0, d.gross - d.pause);
      d.planned = d.shifts.reduce((t, s) => t + plannedOf(s), 0);
      // Abwesenheit: krank / urlaub / fortbildung / sonstiges count as the planned time (no minus)
      const credit = d.absence && ABSENCE[d.absence.kind] && ABSENCE[d.absence.kind].credit;
      d.daily = credit ? Math.max(d.worked, d.planned) - d.planned : d.worked - d.planned;
    });
    return map;
  }, [sessions, shifts, absences, approved]);

  // time account: closed months (plan vs. contract) + every finished day since the first stamp (worked vs. plan)
  // time account counts from the day the company switched Zeiterfassung on (else from the first own stamp)
  const firstStampIso = (sessions || []).length ? isoOf(new Date(sessions[0].check_in || sessions[0].check_out)) : null;
  const firstIso = ttStart || firstStampIso;
  const todayIso = isoOf(now);
  const balanceBefore = (iso) => {
    let t = closed.reduce((s, r) => s + (Number(r.planned_hours) - Number(r.contract_hours)) * 60, 0);
    if (!firstIso) return t;
    Object.values(days).forEach((d) => { if (d.iso >= firstIso && d.iso < iso && d.iso < todayIso) t += d.daily; });
    return t;
  };
  const total = balanceBefore(todayIso) + (days[todayIso] && !days[todayIso].open ? days[todayIso].daily : 0);

  if (!hasProduct) {
    return <div style={card}><div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Zeiten</div><div style={{ fontSize: 14, color: MUTED }}>Die Zeiterfassung ist für deine Firma noch nicht freigeschaltet.</div></div>;
  }

  async function savePin() {
    setPinMsg({ text: "", bad: false });
    if (!/^[0-9]{4,6}$/.test(pinForm.a)) { setPinMsg({ text: "Die PIN muss aus 4 bis 6 Ziffern bestehen.", bad: true }); return; }
    if (pinForm.a !== pinForm.b) { setPinMsg({ text: "Die beiden Eingaben sind nicht gleich.", bad: true }); return; }
    const { error } = await sb.rpc("set_my_pin", { p_org: org.orgId, p_pin: pinForm.a });
    if (error) { setPinMsg({ text: error.message, bad: true }); return; }
    setPinForm(null); setPinSet(true); setPinMsg({ text: "PIN gespeichert ✓", bad: false });
  }

  // ---------- day detail ----------
  const corrected = (sid, field) => corrs.some((c) => c.session_id === sid && c.field === field);
  const toIso = (dayIso, hhmm, after) => { // "HH:MM" on that day; if it is before `after`, it is the next morning (night shift)
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return null;
    const t = new Date(`${dayIso}T${hhmm.padStart(5, "0")}:00`);
    if (after && t <= after) t.setDate(t.getDate() + 1);
    return t;
  };
  async function sendCorrection() {
    setCmsg({ text: "", bad: false });
    const s0 = cform.sessionId ? (sessions || []).find((x) => x.id === cform.sessionId) : null;
    const tin = cform.in ? toIso(sel, cform.in) : null;
    const tout = cform.out ? toIso(sel, cform.out, tin || (s0 && s0.check_in ? new Date(s0.check_in) : null)) : null;
    if (!tin && !tout) return setCmsg({ text: "Bitte Kommen und/oder Gehen angeben (z. B. 16:30).", bad: true });
    if (!cform.sessionId && (!tin || !tout)) return setCmsg({ text: "Für einen ganz vergessenen Tag bitte Kommen und Gehen angeben.", bad: true });
    if (cform.reason.trim().length < 3) return setCmsg({ text: "Bitte kurz den Grund angeben.", bad: true });
    const { error } = await sb.from("attendance_correction_requests").insert({ org_id: org.orgId, staff_id: org.staffId, session_id: cform.sessionId || null, work_date: sel, check_in: tin ? tin.toISOString() : null, check_out: tout ? tout.toISOString() : null, reason: cform.reason.trim().slice(0, 500), status: "open" });
    if (error) return setCmsg({ text: /check/i.test(error.message) ? "Gehen muss nach Kommen liegen." : error.message, bad: true });
    setCform(null); setCmsg({ text: "Korrektur beantragt ✓ Die Leitung entscheidet.", bad: false }); load();
  }

  if (sel) {
    const d = days[sel] || { sessions: [], shifts: [], gross: 0, pause: 0, worked: 0, planned: 0, daily: 0 };
    const date = new Date(sel + "T12:00:00");
    const before = balanceBefore(sel);
    const finished = sel < todayIso || (sel === todayIso && !d.open);
    return (
      <div>
        <button onClick={() => setSel(null)} style={{ border: 0, background: "none", color: PRIMARY, fontSize: 16, fontWeight: 600, padding: "4px 0 10px", cursor: "pointer" }}>‹ Zurück</button>
        <div style={{ fontSize: 22, fontWeight: 750, marginBottom: 12 }}>{WD_LONG[date.getDay()]}, {pad(date.getDate())}.{pad(date.getMonth() + 1)}.{date.getFullYear()}</div>
        {d.absence && <div style={{ ...card, background: "#EEF3FB", fontSize: 15 }}><b>{ABSENCE[d.absence.kind].label}</b> <span style={{ color: MUTED, fontSize: 13 }}>{d.absence.source === "antrag" ? "(genehmigter Antrag)" : "(eingetragen von der Leitung)"}</span>{d.absence.note ? <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>{d.absence.note}</div> : null}</div>}
        {d.sessions.length === 0 && !d.absence && <div style={{ ...card, color: MUTED, fontSize: 14 }}>An diesem Tag gibt es keine Stempelung.</div>}
        {d.sessions.map((s) => (
          <div key={s.id}>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, background: "#F4F6FA" }}>
              <span style={{ color: "#3B9B5A", fontSize: 20 }}>→</span><span style={{ flex: 1, fontSize: 16 }}>Kommen</span>
              <span style={{ color: s.check_in ? MUTED : "#B45309", fontSize: 16 }}>{s.check_in ? clock(s.check_in) : "fehlt"}{corrected(s.id, "check_in") ? " ✎" : ""}</span><span aria-label="gesperrt">🔒</span>
            </div>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, background: "#F4F6FA" }}>
              <span style={{ color: "#E0A050", fontSize: 20 }}>←</span><span style={{ flex: 1, fontSize: 16 }}>Gehen</span>
              <span style={{ color: !s.check_out && Date.now() - new Date(s.check_in).getTime() > 12 * 3600000 ? "#B45309" : MUTED, fontSize: 16 }}>{s.check_out ? clock(s.check_out) : Date.now() - new Date(s.check_in).getTime() > 12 * 3600000 ? "fehlt" : "läuft"}{corrected(s.id, "check_out") ? " ✎" : ""}</span><span aria-label="gesperrt">🔒</span>
            </div>
          </div>
        ))}
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Arbeitszeit</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Alle Werte in Stunden:Minuten.</div>
          <div style={row}><span>Anwesenheit</span><span>{hm(d.gross)}</span></div>
          <div style={row}><span>− Pause <span style={{ fontSize: 12, color: MUTED }}>(gesetzlich)</span></span><span>{d.pause} min</span></div>
          <div style={{ ...row, borderTop: `1px solid ${LINE}`, fontWeight: 700 }}><span>= Gearbeitet</span><span>{hm(d.worked)}</span></div>
          <div style={row}><span>− Geplant</span><span>{hm(d.planned)}</span></div>
          <div style={{ ...row, borderTop: `1px solid ${LINE}`, fontWeight: 700 }}><span>= Tagessaldo</span><span>{finished ? hm(d.daily, true) : "–"}</span></div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Zeitkonto</div>
          <div style={row}><span>Vorher</span><span>{hm(before, true)}</span></div>
          <div style={row}><span>+ Tagessaldo</span><span>{finished && firstIso && sel >= firstIso ? hm(d.daily, true) : "0:00"}</span></div>
          <div style={{ ...row, borderTop: `1px solid ${LINE}`, fontWeight: 700 }}><span>= Neu</span><span>{hm(before + (finished && firstIso && sel >= firstIso ? d.daily : 0), true)}</span></div>
        </div>
        {(() => {
          const dayReqs = reqs.filter((q) => q.work_date === sel);
          const monthClosed = closed.some((c) => c.year === date.getFullYear() && c.month === date.getMonth() + 1);
          const STAT = { open: ["Offen – die Leitung entscheidet", "#7A4E00", "#FFF4D6"], approved: ["Übernommen ✓", "#1F6347", "#DDF2E8"], denied: ["Abgelehnt", "#8A2A3E", "#FCE5EA"] };
          return (
            <div style={card}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Korrektur</div>
              {dayReqs.map((q) => (
                <div key={q.id} style={{ fontSize: 14, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ fontSize: 12, fontWeight: 650, color: STAT[q.status][1], background: STAT[q.status][2], borderRadius: 8, padding: "2px 7px", marginRight: 6 }}>{STAT[q.status][0]}</span>
                  {q.check_in ? `Kommen ${clock(q.check_in)} ` : ""}{q.check_out ? `Gehen ${clock(q.check_out)}` : ""} · „{q.reason}“
                  {q.decision_note && <div style={{ color: MUTED, marginTop: 2 }}>Antwort der Leitung: {q.decision_note}</div>}
                </div>
              ))}
              {cmsg.text && <div role={cmsg.bad ? "alert" : "status"} style={{ fontSize: 13, margin: "8px 0", color: cmsg.bad ? "#B3263E" : "#1F6347" }}>{cmsg.text}</div>}
              {sel > todayIso ? null : cform ? (
                <div style={{ marginTop: 8 }}>
                  {d.sessions.length > 1 && (
                    <select value={cform.sessionId || ""} onChange={(e) => setCform({ ...cform, sessionId: e.target.value ? Number(e.target.value) : null })} style={{ width: "100%", padding: 10, borderRadius: 12, border: `1px solid ${LINE}`, fontSize: 15, marginBottom: 8 }}>
                      {d.sessions.map((x) => <option key={x.id} value={x.id}>{x.check_in ? clock(x.check_in) : "?"} – {x.check_out ? clock(x.check_out) : "?"}</option>)}
                      <option value="">Ganz vergessen (neuer Eintrag)</option>
                    </select>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={{ fontSize: 13, color: MUTED }}>Kommen<input type="time" value={cform.in} onChange={(e) => setCform({ ...cform, in: e.target.value })} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "9px 10px", fontSize: 16 }} /></label>
                    <label style={{ fontSize: 13, color: MUTED }}>Gehen<input type="time" value={cform.out} onChange={(e) => setCform({ ...cform, out: e.target.value })} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "9px 10px", fontSize: 16 }} /></label>
                  </div>
                  <label style={{ display: "block", fontSize: 13, color: MUTED, marginTop: 8 }}>Grund
                    <input value={cform.reason} maxLength={500} placeholder="z. B. Ausstempeln vergessen" onChange={(e) => setCform({ ...cform, reason: e.target.value })} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "9px 10px", fontSize: 16 }} />
                  </label>
                  {monthClosed && <div style={{ fontSize: 13, color: "#7A4E00", marginTop: 6 }}>Dieser Monat ist schon abgeschlossen – die Leitung entscheidet trotzdem.</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={sendCorrection} style={{ flex: 1, border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 15, fontWeight: 650, padding: "11px 0", cursor: "pointer" }}>An die Leitung senden</button>
                    <button onClick={() => { setCform(null); setCmsg({ text: "", bad: false }); }} style={{ border: "1.5px solid #9AAED0", borderRadius: 14, background: "#fff", fontSize: 14, padding: "11px 14px", cursor: "pointer" }}>Abbrechen</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setCmsg({ text: "", bad: false }); const s0 = d.sessions[0]; setCform({ sessionId: s0 ? s0.id : null, in: "", out: "", reason: "" }); }}
                  style={{ marginTop: 6, border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", fontSize: 15, fontWeight: 600, padding: "10px 14px", cursor: "pointer" }}>{d.sessions.length ? "Korrektur beantragen" : "Vergessen zu stempeln? Zeit beantragen"}</button>
              )}
              <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>🔒 Stempelzeiten ändert niemand still: Die Leitung entscheidet, alles wird mit Grund gespeichert. ✎ = von der Leitung korrigiert.</div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ---------- month list ----------
  const last = new Date(view.y, view.m + 1, 0).getDate();
  const isCurrent = view.y === now.getFullYear() && view.m === now.getMonth();
  const lastDay = isCurrent ? now.getDate() : last;
  const list = [];
  for (let day = lastDay; day >= 1; day--) list.push(isoOf(new Date(view.y, view.m, day)));
  const monthClosed = closed.some((r) => r.year === view.y && r.month === view.m + 1);
  const monthSum = list.reduce((t, iso) => { const d = days[iso]; return d && firstIso && iso >= firstIso && (iso < todayIso || !d.open) ? t + d.daily : t; }, 0);
  const shift = (delta) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div>
      <div style={{ padding: "4px 4px 14px" }}>
        <div style={{ fontSize: 22, fontWeight: 750 }}>Dein Zeitkonto</div>
        <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: -1, color: total < 0 ? "#B3263E" : INK }}>{sessions === null ? "…" : hm(total, true)}</div>
      </div>
      {err && <div role="alert" style={{ ...card, background: "#FCE5EA", color: "#8A2A3E", fontSize: 14 }}>{err}</div>}

      {needPin && <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>Stempel-PIN fürs Terminal</div>
        <div style={{ fontSize: 13, color: MUTED, margin: "2px 0 8px" }}>Deine Firma verlangt am Terminal Karte + PIN.</div>
        {pinForm ? (
          <div>
            {["a", "b"].map((k) => (
              <input key={k} type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder={k === "a" ? "Neue PIN (4–6 Ziffern)" : "PIN wiederholen"} value={pinForm[k]}
                onChange={(e) => setPinForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, "") }))}
                style={{ display: "block", width: "100%", boxSizing: "border-box", marginBottom: 8, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 18, letterSpacing: 4 }} />
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={savePin} style={{ flex: 1, border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 15, fontWeight: 650, padding: "10px 0", cursor: "pointer" }}>Speichern</button>
              <button onClick={() => { setPinForm(null); setPinMsg({ text: "", bad: false }); }} style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", fontSize: 14, padding: "10px 14px", cursor: "pointer" }}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 14, color: pinSet ? "#1F6347" : MUTED }}>{pinSet === null ? "…" : pinSet ? "PIN ist gesetzt ✓" : "Noch keine PIN"}</span>
            <button onClick={() => setPinForm({ a: "", b: "" })} style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", fontSize: 14, fontWeight: 600, padding: "8px 12px", cursor: "pointer" }}>{pinSet ? "PIN ändern" : "PIN festlegen"}</button>
          </div>
        )}
        {pinMsg.text && <div role={pinMsg.bad ? "alert" : "status"} style={{ fontSize: 13, marginTop: 8, color: pinMsg.bad ? "#B3263E" : "#1F6347" }}>{pinMsg.text}</div>}
      </div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 4px 4px" }}>
        <button onClick={() => shift(-1)} aria-label="Vormonat" style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", width: 40, height: 36, cursor: "pointer" }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#4B5568" }}>{MONTHS[view.m]} {view.y}</div>
          <div style={{ fontSize: 13, color: MUTED }}>{monthClosed ? "🔒 Monat abgeschlossen · " : ""}Monatssaldo: {hm(monthSum, true)} h</div>
        </div>
        <button onClick={() => shift(1)} disabled={isCurrent} aria-label="Nächster Monat" style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", width: 40, height: 36, cursor: "pointer", opacity: isCurrent ? 0.4 : 1 }}>›</button>
      </div>

      <div style={{ ...card, padding: "4px 12px" }}>
        {list.map((iso) => {
          const d = days[iso]; const dt = new Date(iso + "T12:00:00");
          const label = iso === todayIso ? "Heute" : iso === isoOf(new Date(now.getTime() - 86400000)) ? "Gestern" : `${WD_LONG[dt.getDay()]}, ${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
          const sh = d && d.shifts[0];
          const openS = d && d.sessions.find((x) => x.check_in && !x.check_out);
          // planned but nothing stamped: today 30 minutes after the shift start, earlier days always (since Zeiterfassung started)
          const firstStart = d && d.shifts.length ? Math.min(...d.shifts.map((x) => new Date(x.planned_start).getTime())) : null;
          const noStamp = d && d.shifts.length > 0 && d.sessions.length === 0 && ttStart && iso >= ttStart && !d.absence;
          const kommenFehlt = noStamp && (iso < todayIso || (iso === todayIso && Date.now() > firstStart + 30 * 60000));
          const forgot = openS && Date.now() - new Date(openS.check_in).getTime() > 12 * 3600000;
          const absTxt = d && d.absence ? `${ABSENCE[d.absence.kind].label}${!ABSENCE[d.absence.kind].credit && d.planned ? ` (−${hm(d.planned)} h)` : ""}` : null;
          const sub = !d ? "frei" : absTxt && !d.sessions.length ? absTxt : forgot ? "Gehen fehlt – bitte Korrektur beantragen" : kommenFehlt ? (iso === todayIso ? "Kommen fehlt" : "Kommen fehlt – bitte Korrektur beantragen") : d.open ? `läuft seit ${clock(openS.check_in)}`
            : d.sessions.length ? `gearbeitet ${hm(d.worked)} h${d.missing ? " · Kommen fehlt" : ""}`
            : d.shifts.length ? (iso < todayIso ? "geplant, kein Stempel" : `${sh.shift_label || sh.shift_key} geplant`) : "frei";
          return (
            <button key={iso} onClick={() => setSel(iso)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: `1px solid ${PAPER}`, padding: "10px 0", cursor: "pointer", color: INK }}>
              <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: sh ? BAR[sh.shift_key] || "#C9D3E3" : "transparent" }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 16 }}>{label}</span>
                <span style={{ display: "block", fontSize: 14, color: (d && d.missing) || forgot || kommenFehlt ? "#B45309" : MUTED }}>{sub}</span>
              </span>
              <span style={{ color: "#9AA4B5", fontSize: 22 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
