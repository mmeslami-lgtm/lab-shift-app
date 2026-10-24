"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";
import { ABSENCE, absenceMap, elternzeitCut } from "../lib/absence";
import { loadReview, markSeen } from "../lib/review";
import { fetchAll } from "../lib/fetchAll";
import { useUnsavedWarning } from "../lib/draftGuard";
import { OVERTIME_MODES, overtimeMode, payoutMinutesByMonth } from "../lib/overtime";
import { computeDays, buildSheet, buildTimesheetHtml, openHtmlPrint, germanHolidays, isoOf, MONTHS, SURCHARGES } from "../lib/timesheet";

const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { if (!ts) return "–"; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = (a, b) => { if (!a || !b) return "–"; const m = Math.round((new Date(b) - new Date(a)) / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };

// Popup "Anwesenheit" (Leitung / Inhaber): who is here now, today's stamps, terminals, PIN reset.
// Read only for the times – corrections come in step 2 (with reason, logged).
// "📱 mobil" next to a time that was stamped in the app without a terminal; with a location: link to the map
function MobilMark({ ev }) {
  if (!ev) return null;
  if (ev.lat == null) return <span className="ml-1 text-xs text-sky-700" title="Mobil gestempelt (ohne Terminal)">📱</span>;
  const url = `https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lng}#map=17/${ev.lat}/${ev.lng}`;
  return <a className="ml-1 text-xs text-sky-700 underline" href={url} target="_blank" rel="noopener noreferrer" title={`Mobil gestempelt, Standort ±${ev.acc || "?"} m`}>📍 Karte</a>;
}

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
  const [missing, setMissing] = useState([]); // planned, shift started > 3 h ago, nobody stamped
  const [absForm, setAbsForm] = useState(null); // { staffId, date, kind, note }
  const [dayAbsence, setDayAbsence] = useState(null); // absence on the day open in "Zeiten bearbeiten"
  const [denyReq, setDenyReq] = useState(null); // { id, note }
  const [edit, setEdit] = useState({ staffId: "", date: "" }); // "Zeiten bearbeiten"
  const [daySessions, setDaySessions] = useState(null);
  const [fix, setFix] = useState(null);        // { sessionId|null, in, out }
  // „Zeiten bearbeiten“ is a draft: changes of ONE month are collected here and only „Speichern“ writes them, all together
  // with one reason (save_attendance_edits: all or nothing). „Abbrechen“ = no change at all.
  //   { key, op: "fix"|"add"|"absence"|"unabsence", staffId, date, sessionId?, oldIn?, oldOut?, in?, out?, kind?, note?, absenceId? }
  const [pending, setPending] = useState([]);
  const [pendReason, setPendReason] = useState("");
  useUnsavedWarning(pending.length > 0);
  const pendMonth = pending.length ? pending[0].date.slice(0, 7) : null;
  const tryClose = () => {
    if (pending.length && !window.confirm(`${pending.length} vorgemerkte ${pending.length === 1 ? "Änderung wird" : "Änderungen werden"} nicht gespeichert und verworfen. Trotzdem schließen?`)) return;
    onClose();
  };
  const [tsMonth, setTsMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [tsWho, setTsWho] = useState("all");
  const [zus, setZus] = useState(null);      // saved surcharge settings (null = never set up)
  const [zusForm, setZusForm] = useState(null);
  const [vacForm, setVacForm] = useState(null);
  const [ot, setOt] = useState(null);          // Überstunden: { mode, code } (null = Zeitkonto)
  const [otForm, setOtForm] = useState(null);
  const [payForm, setPayForm] = useState(null); // { staffId, hours, note }
  const [payList, setPayList] = useState([]);   // payouts of the month shown // { year, rows: { staffId: { entitlement, carryover } } }
  const [pairName, setPairName] = useState(null); // null = closed, string = form open
  const [mobilEv, setMobilEv] = useState({}); // event id -> { lat, lng } for "mobil" stamps
  const [review, setReview] = useState(null); // { items, present } – "Zu prüfen", stays until "Gesehen ✓"
  const reloadReview = async () => { try { setReview(await loadReview(org.supabase, org.orgId)); } catch (e) { setReview({ items: [], present: 0 }); } };
  useEffect(() => { reloadReview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function seen(keys) {
    setBusy("seen");
    const { error } = await markSeen(org.supabase, org.orgId, keys);
    setBusy(""); if (error) { setMsg(error.message); return; }
    reloadReview();
  }
  const [pairCode, setPairCode] = useState(null); // { code, name, expiresAt }
  const closeRef = useRef(tryClose); closeRef.current = tryClose;

  const load = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setTime(since.getTime() - 20 * 3600000); // includes night shifts from yesterday
    const s = await org.supabase.from("attendance_sessions").select("id, staff_id, check_in, check_out, in_event_id, out_event_id").eq("org_id", org.orgId).gte("check_in", since.toISOString()).order("check_in", { ascending: false });
    // mobile stamps (Mitarbeiter-App ohne Terminal): method + optional location of that one moment
    const evIds = (s.data || []).flatMap((x) => [x.in_event_id, x.out_event_id]).filter(Boolean);
    const ev = evIds.length ? await org.supabase.from("attendance_events").select("id, badge_code, raw_payload").in("id", evIds) : { data: [] };
    const em = {}; (ev.data || []).forEach((e) => { if (e.badge_code === "mobil") em[e.id] = e.raw_payload || {}; });
    setMobilEv(em);
    const st = await org.supabase.from("staff").select("id, name, personnel_no, weekly_hours").eq("org_id", org.orgId);
    const dv = await org.supabase.from("devices").select("id, serial, name, active, created_at").eq("org_id", org.orgId).order("created_at");
    const bg = await org.supabase.from("badges").select("id, staff_id, badge_code, revoked_at, issued_at").eq("org_id", org.orgId);
    const og = await org.supabase.from("organizations").select("card_requires_pin, surcharge_settings, overtime_settings").eq("id", org.orgId);
    setOt(og.data && og.data[0] ? og.data[0].overtime_settings || null : null);
    setZus(og.data && og.data[0] ? og.data[0].surcharge_settings || null : null);
    setBadges((bg.data || []).filter((b) => !b.revoked_at));
    setNeedPin(!!(og.data && og.data[0] && og.data[0].card_requires_pin));
    setStaffList((st.data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
    // "Noch nicht eingestempelt": published shifts that started 3 to 20 hours ago without any Kommen
    const now = Date.now();
    const sh = await org.supabase.from("scheduled_shifts").select("staff_id, shift_label, shift_key, planned_start, shift_date").eq("org_id", org.orgId).eq("status", "published").gte("planned_start", new Date(now - 20 * 3600000).toISOString()).lt("planned_start", new Date(now - 3 * 3600000).toISOString());
    const recent = (s.data || []);
    // absences (Leitung) and approved Anträge: no warning for those people/days
    const ab = await org.supabase.from("attendance_absences").select("staff_id, work_date, kind, voided_at").eq("org_id", org.orgId).gte("work_date", new Date(now - 2 * 86400000).toISOString().slice(0, 10));
    const ap = await org.supabase.from("requests").select("staff_id, type_key, date_from, date_to, status").eq("org_id", org.orgId).eq("status", "approved");
    const absent = (staffId, day) => !!absenceMap((ab.data || []).filter((a) => a.staff_id === staffId), (ap.data || []).filter((a) => a.staff_id === staffId))[day];
    setMissing(sh.error ? [] : (sh.data || []).filter((x) => !absent(x.staff_id, String(x.shift_date).slice(0, 10)) && !recent.some((r) => r.staff_id === x.staff_id && r.check_in && new Date(r.check_in).getTime() >= new Date(x.planned_start).getTime() - 3 * 3600000)));
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
  async function saveAbsence() {
    setBusy("abs");
    const { error } = await org.supabase.rpc("set_absence", { p_org: org.orgId, p_staff: absForm.staffId, p_date: absForm.date, p_kind: absForm.kind, p_note: absForm.note || null });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setMsg(`${names[absForm.staffId]}: ${ABSENCE[absForm.kind].label} eingetragen ✓${absForm.kind === "krank" ? " – Ersatz finden: im Dienstplan „Krankmeldung / Ausfall“." : ""}`);
    const same = edit.staffId === absForm.staffId && edit.date === absForm.date;
    setAbsForm(null); load(); if (same) loadDay(edit.staffId, edit.date);
  }
  async function voidAbsence(a) {
    const reason = window.prompt("Abwesenheit aufheben – Grund:", "falsch eingetragen");
    if (reason === null) return;
    const { error } = await org.supabase.rpc("void_absence", { p_id: a.id, p_reason: reason });
    setMsg(error ? error.message : "Abwesenheit aufgehoben ✓"); load(); loadDay(edit.staffId, edit.date);
  }
  async function loadDay(staffId, date) {
    if (pending.length && date && date.slice(0, 7) !== pendMonth) {
      if (!window.confirm(`Für ${ymLabel(pendMonth)} sind ${pending.length} Änderungen vorgemerkt, aber noch nicht gespeichert.\n\nOK = verwerfen und zu ${ymLabel(date.slice(0, 7))} wechseln\nAbbrechen = zurück (dann unten „Speichern“)`)) return;
      setPending([]); setPendReason("");
    }
    setEdit({ staffId, date }); setFix(null); setDayAbsence(null);
    if (!staffId || !date) { setDaySessions(null); return; }
    const ab = await org.supabase.from("attendance_absences").select("id, kind, note, voided_at").eq("org_id", org.orgId).eq("staff_id", staffId).eq("work_date", date);
    setDayAbsence(((ab.data || []).filter((a) => !a.voided_at))[0] || null);
    const from = new Date(`${date}T00:00:00`), to = new Date(from.getTime() + 86400000);
    const r = await org.supabase.from("attendance_sessions").select("id, check_in, check_out").eq("org_id", org.orgId).eq("staff_id", staffId).gte("check_in", from.toISOString()).lt("check_in", to.toISOString()).order("check_in");
    setDaySessions(r.error ? [] : r.data || []);
  }
  const atTime = (date, hhmm, after) => { if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return null; const t = new Date(`${date}T${hhmm.padStart(5, "0")}:00`); if (after && t <= after) t.setDate(t.getDate() + 1); return t; };
  const ymLabel = (ym) => { if (!ym) return ""; const [y, mo] = ym.split("-"); return `${MONTHS[Number(mo) - 1]} ${y}`; };
  const dayLabel = (iso) => { const d = new Date(`${iso}T12:00:00`); return `${["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`; };
  const localIso = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const clockOn = (ts, date) => (ts ? clock(ts) + (localIso(ts) !== date ? " (+1)" : "") : "fehlt");
  const addPending = (item) => { setPending((p) => [...p.filter((x) => x.key !== item.key), item]); setMsg(""); };
  // Korrigieren / Zeit nachtragen -> only noted down (vorgemerkt)
  function queueFix() {
    const { staffId, date } = edit;
    if (fix.sessionId) {
      const s0 = (daySessions || []).find((x) => x.id === fix.sessionId);
      const prev = pending.find((p) => p.op === "fix" && p.sessionId === fix.sessionId);
      const tin = fix.in ? atTime(date, fix.in) : null;
      const nin = tin ? tin.toISOString() : (prev ? prev.in : null);
      const effIn = new Date(nin || s0.check_in);
      const tout = fix.out ? atTime(date, fix.out, effIn) : null;
      const nout = tout ? tout.toISOString() : (prev ? prev.out : null);
      if (!nin && !nout) { setMsg("Bitte Kommen und/oder Gehen eintragen."); return; }
      const effOut = nout ? new Date(nout) : (s0.check_out ? new Date(s0.check_out) : null);
      if (effOut && effOut <= effIn) { setMsg("Gehen muss nach Kommen liegen."); return; }
      if (effOut && effOut - effIn > 16 * 3600000) { setMsg("Mehr als 16 Stunden – bitte prüfen."); return; }
      addPending({ key: `s${fix.sessionId}`, op: "fix", staffId, date, sessionId: fix.sessionId, oldIn: s0.check_in, oldOut: s0.check_out, in: nin, out: nout });
    } else {
      const tin = atTime(date, fix.in), tout = atTime(date, fix.out, tin);
      if (!tin || !tout) { setMsg("Bitte Kommen und Gehen eintragen."); return; }
      if (tout - tin > 16 * 3600000) { setMsg("Mehr als 16 Stunden – bitte prüfen."); return; }
      addPending({ key: `a${Date.now()}`, op: "add", staffId, date, in: tin.toISOString(), out: tout.toISOString() });
    }
    setFix(null);
  }
  function queueAbsence() {
    const a = absForm;
    addPending({ key: `abs${a.staffId}|${a.date}`, op: "absence", staffId: a.staffId, date: a.date, kind: a.kind, note: (a.note || "").trim() });
    setAbsForm(null);
  }
  function queueUnabsence(a) {
    addPending({ key: `abs${edit.staffId}|${edit.date}`, op: "unabsence", staffId: edit.staffId, date: edit.date, absenceId: a.id, kind: a.kind });
  }
  const unqueue = (key) => setPending((p) => p.filter((x) => x.key !== key));
  function describe(p) {
    if (p.op === "fix") return [p.in && `Kommen ${clock(p.oldIn)} → ${clockOn(p.in, p.date)}`, p.out && `Gehen ${clockOn(p.oldOut, p.date)} → ${clockOn(p.out, p.date)}`].filter(Boolean).join(" · ");
    if (p.op === "add") return `Zeit nachgetragen ${clock(p.in)} – ${clockOn(p.out, p.date)}`;
    if (p.op === "absence") return `Abwesenheit: ${(ABSENCE[p.kind] || {}).label || p.kind}${p.note ? ` („${p.note}“)` : ""}`;
    return `Abwesenheit aufheben (${(ABSENCE[p.kind] || {}).label || p.kind})`;
  }
  const sortedPending = [...pending].sort((a, b) => a.date.localeCompare(b.date) || String(names[a.staffId] || "").localeCompare(String(names[b.staffId] || "")));
  async function savePending() {
    if (pendReason.trim().length < 3) { setMsg("Bitte einen Grund für die Änderungen angeben (gilt für alle)."); return; }
    const people = [...new Set(pending.map((p) => p.staffId))];
    const closed = [];
    for (const id of people) if (await monthClosed(id, pending.find((p) => p.staffId === id).date)) closed.push(names[id] || "?");
    if (closed.length && !window.confirm(`${ymLabel(pendMonth)} ist für ${closed.join(", ")} schon abgeschlossen (Saldo). Trotzdem speichern?`)) return;
    const list = pending; // same order as sent, to name the entry in an error
    const edits = list.map((p) => (p.op === "fix" ? { op: "fix", session_id: p.sessionId, check_in: p.in || null, check_out: p.out || null }
      : p.op === "add" ? { op: "add", staff_id: p.staffId, check_in: p.in, check_out: p.out }
      : p.op === "absence" ? { op: "absence", staff_id: p.staffId, date: p.date, kind: p.kind, note: p.note || null }
      : { op: "unabsence", absence_id: p.absenceId }));
    setBusy("pend");
    const { error } = await org.supabase.rpc("save_attendance_edits", { p_org: org.orgId, p_edits: edits, p_reason: pendReason.trim() });
    setBusy("");
    if (error) {
      const m = String(error.message || "").match(/^Änderung (\d+): (.*)$/);
      const bad = m ? list[Number(m[1]) - 1] : null;
      setMsg(`Nicht gespeichert – keine der Änderungen wurde übernommen. ${bad ? `${dayLabel(bad.date)} · ${names[bad.staffId] || "?"}: ${m[2]}` : error.message}`);
      return;
    }
    setMsg(`${list.length} ${list.length === 1 ? "Änderung" : "Änderungen"} gespeichert ✓ (mit Grund protokolliert)`);
    setPending([]); setPendReason(""); load();
    if (edit.staffId && edit.date) loadDay(edit.staffId, edit.date);
  }
  function cancelPending() {
    if (!window.confirm(`Alle ${pending.length} vorgemerkten Änderungen verwerfen? Es wird nichts gespeichert.`)) return;
    setPending([]); setPendReason(""); setFix(null); setMsg("Abgebrochen – nichts geändert.");
  }

  // ---- Stundenzettel (monthly time sheet for the payroll office) ----
  const sollMode = (org.features || []).includes("soll_vertrag") ? "vertrag" : "plan";
  // Erfassungsart – Inhaber/Leitung entscheiden selbst (set_time_modes): Terminal, Handy oder beides (+ Standort)
  const f0 = org.features || [];
  const [mode, setMode] = useState(f0.includes("mobil_stempeln") ? (f0.includes("nur_mobil") ? "handy" : "beides") : "terminal");
  const [standort, setStandort] = useState(f0.includes("mobil_standort"));
  async function saveModes(nextMode, nextStandort) {
    setBusy("modes");
    const { error } = await org.supabase.rpc("set_time_modes", { p_org: org.orgId, p_mobil: nextMode !== "terminal", p_nur_mobil: nextMode === "handy", p_standort: nextMode !== "terminal" && nextStandort });
    setBusy("");
    if (error) { setMsg(error.message); return; }
    setMode(nextMode); setStandort(nextStandort);
    setMsg("Gespeichert ✓ – die Mitarbeitenden sehen die Änderung nach dem nächsten Öffnen der App.");
  }
  async function printTimesheets() {
    const [y, m] = tsMonth.split("-").map(Number); const month = m - 1;
    setBusy("ts"); setMsg("");
    try {
      const sb = org.supabase;
      const tp = await sb.from("org_products").select("created_at").eq("org_id", org.orgId).eq("product", "time_tracking");
      const startIso = tp.data && tp.data[0] && tp.data[0].created_at ? isoOf(new Date(tp.data[0].created_at)) : null;
      const jan1 = `${y}-01-01`;
      const fromIso = [startIso, jan1, `${y}-${String(m).padStart(2, "0")}-01`].filter(Boolean).sort()[0]; // earliest: Zeitkonto start or Jan 1 (Urlaub/Krank of the year)
      const from = new Date(`${fromIso}T00:00:00`), to = new Date(y, month + 1, 1);
      const people = staffList.filter((x) => tsWho === "all" || x.id === tsWho);
      const [ses, sh, ab, ap, cl, co] = await Promise.all([
        fetchAll(() => sb.from("attendance_sessions").select("id, staff_id, check_in, check_out, in_event_id, out_event_id").eq("org_id", org.orgId).gte("check_in", from.toISOString()).lt("check_in", to.toISOString())),
        fetchAll(() => sb.from("scheduled_shifts").select("staff_id, shift_date, shift_key, shift_label, planned_start, planned_end").eq("org_id", org.orgId).eq("status", "published").gte("shift_date", fromIso).lt("shift_date", `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-01`)),
        fetchAll(() => sb.from("attendance_absences").select("staff_id, work_date, kind, note, voided_at").eq("org_id", org.orgId)),
        fetchAll(() => sb.from("requests").select("staff_id, type_key, date_from, date_to, status, cut_vacation").eq("org_id", org.orgId).eq("status", "approved")),
        fetchAll(() => sb.from("staff_month_balance").select("staff_id, year, month, contract_hours, planned_hours").eq("org_id", org.orgId)),
        fetchAll(() => sb.from("attendance_corrections").select("session_id").eq("org_id", org.orgId)),
      ]);
      const pays = overtimeMode(ot) === "gemischt" ? await fetchAll(() => sb.from("overtime_payouts").select("staff_id, year, month, hours, voided_at").eq("org_id", org.orgId)) : [];
      const vac = await sb.from("staff_vacation").select("staff_id, entitlement, carryover").eq("org_id", org.orgId).eq("year", y);
      const corrected = new Set((co || []).map((x) => x.session_id));
      // sessions stamped "mobil" in the app (no terminal) – shown as "mobil" on the time sheet
      const mobEv = await fetchAll(() => sb.from("attendance_events").select("id").eq("org_id", org.orgId).eq("badge_code", "mobil").gte("scanned_at", from.toISOString()).lt("scanned_at", new Date(to.getTime() + 36 * 3600000).toISOString()));
      const mobIds = new Set((mobEv || []).map((e) => e.id));
      const mobile = new Set((ses || []).filter((x) => mobIds.has(x.in_event_id) || mobIds.has(x.out_event_id)).map((x) => x.id));
      // eingesprungen: shifts added after publication (Ersatz für jemanden / Zusatzschicht)
      const lastIso = isoOf(new Date(y, month + 1, 0));
      const chg = await fetchAll(() => sb.from("shift_changes").select("staff_id, change_date, kind, voided_at").eq("org_id", org.orgId).in("kind", ["cover", "extra"]).gte("change_date", `${y}-${String(month + 1).padStart(2, "0")}-01`).lte("change_date", lastIso));
      const coversOf = (sid) => new Set((chg || []).filter((c) => c.staff_id === sid && !c.voided_at).map((c) => String(c.change_date).slice(0, 10)));
      const hol = {}; const holidaysOf = (yy) => hol[yy] || (hol[yy] = germanHolidays(yy));
      const sheets = people.map((p) => {
        const days = computeDays({ sessions: (ses || []).filter((x) => x.staff_id === p.id), shifts: (sh || []).filter((x) => x.staff_id === p.id), absences: (ab || []).filter((x) => x.staff_id === p.id), approved: (ap || []).filter((x) => x.staff_id === p.id), holidaysOf });
        const closedRows = (cl || []).filter((r) => r.staff_id === p.id && r.year * 12 + r.month - 1 <= y * 12 + month);
        const overtime = { mode: overtimeMode(ot), code: ot && ot.code, stored: payoutMinutesByMonth(pays, p.id) };
        return buildSheet({ name: p.personnel_no ? `${p.name} (${p.personnel_no})` : p.name, year: y, month, days, startIso, closedRows, overtime, corrected, mobile, mode: sollMode, weeklyHours: p.weekly_hours, covers: coversOf(p.id), vacation: (() => { const v = (vac.data || []).find((x) => x.staff_id === p.id); if (!v) return null; const c = elternzeitCut((ap || []).filter((x) => x.staff_id === p.id), y, v.entitlement); return { ...v, entitlement: Number(v.entitlement || 0) - c.cut, cut: c.cut }; })() });
      });
      if (!sheets.length) { setMsg("Keine Personen gefunden."); setBusy(""); return; }
      const ok = openHtmlPrint(buildTimesheetHtml(sheets, { orgName: org.orgName, year: y, month, mode: sollMode, surcharges: zus }));
      setMsg(ok ? `${sheets.length} Stundenzettel für ${MONTHS[month]} ${y} – im Druckfenster „Als PDF speichern“ wählen, um sie per E-Mail an die Personalabteilung zu schicken.` : "Der Browser hat das neue Fenster blockiert.");
    } catch (e) { setMsg("Stundenzettel: " + (e.message || e)); }
    setBusy("");
  }

  async function openVac(year) {
    const r = await org.supabase.from("staff_vacation").select("staff_id, entitlement, carryover").eq("org_id", org.orgId).eq("year", year);
    const rows = {}; (r.data || []).forEach((v) => { rows[v.staff_id] = { entitlement: String(v.entitlement), carryover: String(v.carryover) }; });
    setVacForm({ year, rows });
  }
  async function saveVac() {
    setBusy("vac");
    const num = (v) => Number(String(v == null ? "" : v).replace(",", ".")) || 0;
    const up = staffList.filter((x) => vacForm.rows[x.id] && (vacForm.rows[x.id].entitlement !== "" || vacForm.rows[x.id].carryover !== ""))
      .map((x) => ({ org_id: org.orgId, staff_id: x.id, year: vacForm.year, entitlement: num(vacForm.rows[x.id].entitlement), carryover: num(vacForm.rows[x.id].carryover), updated_at: new Date().toISOString() }));
    const { error } = up.length ? await org.supabase.from("staff_vacation").upsert(up, { onConflict: "staff_id,year" }) : { error: null };
    setBusy(""); if (error) { setMsg(error.message); return; }
    setVacForm(null); setMsg(`Urlaubsanspruch ${vacForm.year} gespeichert ✓`);
  }
  async function saveOt() {
    setBusy("ot");
    const { error } = await org.supabase.rpc("set_overtime_settings", { p_org: org.orgId, p_settings: { mode: otForm.mode || "konto", code: String(otForm.code || "").slice(0, 20) } });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setOt({ mode: otForm.mode || "konto", code: String(otForm.code || "").slice(0, 20) }); setOtForm(null); setMsg("Überstunden-Regel gespeichert ✓");
  }
  async function loadPayouts() {
    const [y, m] = tsMonth.split("-").map(Number);
    const r = await org.supabase.from("overtime_payouts").select("id, staff_id, hours, note, created_at, voided_at, void_reason").eq("org_id", org.orgId).eq("year", y).eq("month", m).order("created_at");
    setPayList(r.data || []);
  }
  async function addPayout() {
    const [y, m] = tsMonth.split("-").map(Number);
    const h = Number(String(payForm.hours || "").replace(",", "."));
    if (!payForm.staffId || !(h > 0)) { setMsg("Bitte Person und Stunden angeben."); return; }
    setBusy("pay");
    const { error } = await org.supabase.rpc("add_overtime_payout", { p_org: org.orgId, p_staff: payForm.staffId, p_year: y, p_month: m, p_hours: h, p_note: payForm.note || "" });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setPayForm({ staffId: "", hours: "", note: "" }); setMsg(`${String(h).replace(".", ",")} Std. zur Auszahlung eingetragen ✓`); loadPayouts();
  }
  async function voidPayout(id) {
    const reason = window.prompt("Grund für die Stornierung:");
    if (!reason || !reason.trim()) return;
    const { error } = await org.supabase.rpc("void_overtime_payout", { p_id: id, p_reason: reason.trim() });
    if (error) { setMsg(error.message); return; }
    setMsg("Auszahlung storniert ✓"); loadPayouts();
  }
  async function saveZus() {
    setBusy("zus");
    const clean = {};
    SURCHARGES.forEach((z) => { const c = zusForm[z.key] || {}; clean[z.key] = { mode: c.mode || "off", value: c.mode === "off" ? null : Math.max(0, Number(String(c.value || "0").replace(",", ".")) || 0), code: String(c.code || "").slice(0, 20) }; });
    const { error } = await org.supabase.rpc("set_surcharge_settings", { p_org: org.orgId, p_settings: clean });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setZus(clean); setZusForm(null); setMsg("Zuschläge gespeichert ✓");
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="att-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="att-title" className="text-base font-semibold">Anwesenheit</h2>
            <div className="mt-0.5 text-xs text-slate-500">Stempelzeiten nimmt der Server; sie lassen sich nicht nachträglich ändern. Aktualisiert sich alle 30 Sekunden.</div>
          </div>
          <button onClick={tryClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
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
                <div className="mt-1 flex flex-wrap gap-2">{missing.map((x, i) => (
                  <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-900">● {names[x.staff_id] || "?"} <span className="text-amber-700">{x.shift_label || x.shift_key} seit {clock(x.planned_start)}</span>
                    <button onClick={() => setAbsForm({ staffId: x.staff_id, date: String(x.shift_date).slice(0, 10), kind: "krank", note: "" })} className="rounded-md border border-amber-400 bg-white px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100">Abwesend …</button>
                  </span>
                ))}</div>
                <div className="mt-1 text-[11px] text-slate-500">Schicht hat vor mehr als 3 Stunden begonnen, aber kein Kommen. Nicht gekommen? → „Abwesend …“. Gestempelt vergessen? → unten „Zeiten bearbeiten“.</div>
              </>
            )}
            {absForm && !absForm.queue && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="w-full text-xs font-semibold text-slate-700">{names[absForm.staffId]} · {absForm.date.split("-").reverse().join(".")}</div>
                <label className="text-xs text-slate-600">Grund
                  <select value={absForm.kind} onChange={(e) => setAbsForm({ ...absForm, kind: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    {Object.keys(ABSENCE).map((k) => <option key={k} value={k}>{ABSENCE[k].label}{ABSENCE[k].credit ? "" : " (Stunden fehlen)"}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-600">Notiz (optional)<input value={absForm.note} maxLength={500} onChange={(e) => setAbsForm({ ...absForm, note: e.target.value })} className="mt-1 block w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
                <button onClick={saveAbsence} disabled={busy === "abs"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "abs" ? "Moment …" : "Eintragen"}</button>
                <button onClick={() => setAbsForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
              </div>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Zu prüfen {review ? `(${review.items.length})` : ""}</h3>
            {!review ? <div className="mt-1 text-xs text-slate-500">Lädt …</div> : review.items.length === 0 ? (
              <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Alles gesehen ✓ – nichts zu prüfen.</div>
            ) : (
              <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50/50">
                <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-3 py-2 text-xs text-amber-900">
                  <span>Bleibt hier, bis jemand aus der Leitung „Gesehen“ tippt. Die Stempelungen selbst bleiben immer gespeichert.</span>
                  <button disabled={busy === "seen"} onClick={() => seen(review.items.map((x) => x.key))} className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100">Alle gesehen ✓</button>
                </div>
                <ul className="max-h-72 divide-y divide-amber-100 overflow-y-auto">
                  {review.items.map((it) => (
                    <li key={it.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span aria-hidden="true">{it.kind === "mobil" ? (it.loc ? "📍" : "📱") : it.kind === "manuell" ? "✎" : "⚠️"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800">{it.name}</span>
                        <span className="text-slate-500"> · {new Date(it.at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className={`block text-xs ${it.kind === "fehlt" || it.kind === "gehen" ? "font-semibold text-rose-700" : "text-slate-600"}`}>{it.text}{it.loc ? <> · <a className="text-sky-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${it.loc.lat}&mlon=${it.loc.lng}#map=17/${it.loc.lat}/${it.loc.lng}`}>Karte</a></> : null}</span>
                      </span>
                      <button disabled={busy === "seen"} onClick={() => seen([it.key])} className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Gesehen ✓</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Jetzt da ({present.length})</h3>
            {present.length === 0 ? <div className="mt-1 text-xs text-slate-500">Im Moment ist niemand eingestempelt.</div> : (
              <div className="mt-1 flex flex-wrap gap-2">{present.map((r) => <span key={r.id} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-900">● {names[r.staff_id] || "?"} <span className="text-emerald-700">seit {clock(r.check_in)}</span></span>)}</div>
            )}
            <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Alle Stempelungen heute ({today.length})</summary>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-slate-500"><th className="py-1.5 pr-2">Name</th><th className="py-1.5 pr-2">Kommen</th><th className="py-1.5 pr-2">Gehen</th><th className="py-1.5 pr-2">Dauer</th><th /></tr></thead>
                <tbody>
                  {today.length === 0 && <tr><td colSpan={5} className="py-2 text-xs text-slate-500">Heute noch keine Stempelungen.</td></tr>}
                  {today.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 font-medium">{names[r.staff_id] || "?"}</td>
                      <td className={`py-1.5 pr-2 ${r.check_in ? "" : "text-amber-700"}`}>{r.check_in ? clock(r.check_in) : "fehlt"}<MobilMark ev={mobilEv[r.in_event_id]} /></td>
                      <td className="py-1.5 pr-2">{r.check_out ? <>{clock(r.check_out)}<MobilMark ev={mobilEv[r.out_event_id]} /></> : Date.now() - new Date(r.check_in).getTime() > 12 * 3600000 ? <span className="font-semibold text-amber-700">Gehen fehlt</span> : <span className="text-emerald-700">läuft</span>}</td>
                      <td className="py-1.5 pr-2">{dur(r.check_in, r.check_out)}</td>
                      <td className="py-1.5 text-right"><button onClick={() => resetPin(r.staff_id)} disabled={!!busy} className="text-xs text-slate-500 underline">PIN zurücksetzen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </details>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Wie wird gestempelt?</h3>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Erfassungsart">
              {[["terminal", "Nur Terminal"], ["handy", "Nur Handy"], ["beides", "Terminal und Handy"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={mode === k} disabled={busy === "modes"} onClick={() => saveModes(k, standort)}
                  className={`rounded-lg border px-3 py-1.5 text-sm active:translate-y-px ${mode === k ? "border-teal-600 bg-teal-600 font-semibold text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{l}</button>
              ))}
            </div>
            {mode !== "terminal" && (
              <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={standort} disabled={busy === "modes"} onChange={(e) => saveModes(mode, e.target.checked)} />
                <span>Beim Stempeln mit dem Handy einmalig den Standort speichern <span className="text-slate-500">(keine laufende Ortung; Mitarbeitende informieren, ggf. Betriebsrat fragen)</span></span>
              </label>
            )}
            <div className="mt-1 text-[11px] text-slate-500">Vergessene oder falsche Zeiten tragen alle selbst in der App ein („Zeit beantragen“, „Korrektur beantragen“); Sie bestätigen sie hier.</div>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Stundenzettel (für die Lohnabrechnung)</h3>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">Monat<input type="month" value={tsMonth} onChange={(e) => setTsMonth(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-slate-600">Für
                <select value={tsWho} onChange={(e) => setTsWho(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="all">Alle ({staffList.length})</option>
                  {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <button onClick={printTimesheets} disabled={busy === "ts"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "ts" ? "Moment …" : "Drucken / PDF"}</button>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Eine Seite pro Person: Beginn, Ende, Pause, Netto, Soll, Zeitkonto, Nacht-/Sonntags-/Feiertagsstunden, Urlaub, Krank.</div>
            {vacForm ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">Urlaubsanspruch
                  <select value={vacForm.year} onChange={(e) => openVac(Number(e.target.value))} className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs" aria-label="Jahr">
                    {[0, 1, -1].map((k) => new Date().getFullYear() + k).sort().map((yy) => <option key={yy} value={yy}>{yy}</option>)}
                  </select>
                </div>
                <table className="mt-1 text-sm"><thead><tr className="text-xs text-slate-500"><th className="pr-3 text-left">Name</th><th className="pr-3 text-left">Tage im Jahr</th><th className="text-left">Rest Vorjahr</th></tr></thead>
                  <tbody>{staffList.map((x) => { const r = vacForm.rows[x.id] || { entitlement: "", carryover: "" }; const set = (k, v) => setVacForm({ ...vacForm, rows: { ...vacForm.rows, [x.id]: { ...r, [k]: v } } }); return (
                    <tr key={x.id}><td className="pr-3">{x.name}</td>
                      <td className="pr-3"><input value={r.entitlement} onChange={(e) => set("entitlement", e.target.value)} placeholder="z. B. 30" className="w-20 rounded-md border border-slate-300 px-2 py-0.5" aria-label={`Urlaubstage ${x.name}`} /></td>
                      <td><input value={r.carryover} onChange={(e) => set("carryover", e.target.value)} placeholder="0" className="w-20 rounded-md border border-slate-300 px-2 py-0.5" aria-label={`Rest Vorjahr ${x.name}`} /></td></tr>
                  ); })}</tbody></table>
                <div className="mt-2 flex gap-2">
                  <button onClick={saveVac} disabled={busy === "vac"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "vac" ? "Moment …" : "Speichern"}</button>
                  <button onClick={() => setVacForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                </div>
              </div>
            ) : (
              <button onClick={() => openVac(Number(tsMonth.slice(0, 4)))} className="mr-2 mt-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Urlaubsanspruch eintragen</button>
            )}
            {zusForm ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-xs font-semibold text-slate-700">Zuschläge (freiwillig – nur was Ihre Firma zahlt)</div>
                {SURCHARGES.map((z) => { const c = zusForm[z.key] || { mode: "off" }; const set = (patch) => setZusForm({ ...zusForm, [z.key]: { ...c, ...patch } }); return (
                  <div key={z.key} className="mt-1.5 flex flex-wrap items-end gap-2">
                    <span className="w-44 text-xs text-slate-700">{z.label}</span>
                    <select value={c.mode || "off"} onChange={(e) => set({ mode: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label={`${z.label} Art`}>
                      <option value="off">kein Zuschlag</option><option value="percent">Prozent (Stunden)</option><option value="perDay">Betrag pro Tag (€)</option>
                    </select>
                    {c.mode && c.mode !== "off" && <input value={c.value == null ? "" : c.value} onChange={(e) => set({ value: e.target.value })} placeholder={c.mode === "perDay" ? "z. B. 102,26" : "z. B. 20"} className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label={`${z.label} Wert`} />}
                    {c.mode && c.mode !== "off" && <input value={c.code || ""} onChange={(e) => set({ code: e.target.value })} placeholder="Lohnart-Code" className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label={`${z.label} Code`} />}
                  </div>
                ); })}
                <div className="mt-2 flex gap-2">
                  <button onClick={saveZus} disabled={busy === "zus"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "zus" ? "Moment …" : "Speichern"}</button>
                  <button onClick={() => setZusForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setZusForm(zus || {})} className="mt-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Zuschläge einstellen{zus ? ` (${SURCHARGES.filter((z) => zus[z.key] && zus[z.key].mode !== "off").length} aktiv)` : " (optional)"}</button>
            )}

            <div className="mt-2">
              {otForm ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-xs font-semibold text-slate-700">Überstunden: Zeitkonto oder Auszahlung</div>
                  {Object.entries(OVERTIME_MODES).map(([k, label]) => (
                    <label key={k} className="mt-1 flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="otmode" checked={(otForm.mode || "konto") === k} onChange={() => setOtForm({ ...otForm, mode: k })} />{label}</label>
                  ))}
                  {(otForm.mode || "konto") !== "konto" && <input value={otForm.code || ""} onChange={(e) => setOtForm({ ...otForm, code: e.target.value })} placeholder="Lohnart-Code (optional)" aria-label="Lohnart-Code Überstunden" className="mt-1.5 w-40 rounded-md border border-slate-300 px-2 py-1 text-sm" />}
                  <div className="mt-1 text-[11px] text-slate-500">Ausgezahlt werden nur Plusstunden; Minusstunden bleiben im Zeitkonto. Bei Minijobs auf die Verdienstgrenze achten.</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={saveOt} disabled={busy === "ot"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "ot" ? "Moment …" : "Speichern"}</button>
                    <button onClick={() => setOtForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setOtForm(ot || { mode: "konto" })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Überstunden: {overtimeMode(ot) === "konto" ? "Zeitkonto" : overtimeMode(ot) === "auszahlung" ? "Auszahlung" : "Gemischt"} – ändern</button>
              )}
              {overtimeMode(ot) === "gemischt" && !otForm && (
                payForm ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="text-xs font-semibold text-slate-700">Überstunden auszahlen – {MONTHS[Number(tsMonth.slice(5)) - 1]} {tsMonth.slice(0, 4)}</div>
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      <select value={payForm.staffId} onChange={(e) => setPayForm({ ...payForm, staffId: e.target.value })} aria-label="Person für Auszahlung" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                        <option value="">Person wählen …</option>
                        {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <input value={payForm.hours} onChange={(e) => setPayForm({ ...payForm, hours: e.target.value })} placeholder="Stunden" aria-label="Stunden auszahlen" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                      <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} placeholder="Notiz (optional)" aria-label="Notiz Auszahlung" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                      <button onClick={addPayout} disabled={busy === "pay"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "pay" ? "Moment …" : "Auszahlen"}</button>
                      <button onClick={() => setPayForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Schließen</button>
                    </div>
                    {payList.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {payList.map((x) => (
                          <li key={x.id} className={x.voided_at ? "text-slate-400 line-through" : "text-slate-700"}>
                            {(staffList.find((p) => p.id === x.staff_id) || {}).name || "?"}: {String(x.hours).replace(".", ",")} Std.{x.note ? ` – ${x.note}` : ""}
                            {x.voided_at ? <span className="no-underline"> (storniert: {x.void_reason})</span> : <button onClick={() => voidPayout(x.id)} className="ml-2 text-xs text-rose-700 underline">Stornieren</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1 text-[11px] text-slate-500">Wird am Monatsende vom Zeitkonto abgezogen und im Stundenzettel als „Überstunden ausgezahlt“ gezeigt. Nichts wird gelöscht – Fehler „Stornieren“ (mit Grund).</div>
                  </div>
                ) : (
                  <button onClick={() => { setPayForm({ staffId: "", hours: "", note: "" }); loadPayouts(); }} className="ml-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">Überstunden auszahlen …</button>
                )
              )}
            </div>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Zeiten bearbeiten (auch frühere Tage)</h3>
            <div className="mt-0.5 text-[11px] text-slate-500">Änderungen werden erst vorgemerkt. Erst „Speichern“ schreibt alle zusammen, mit einem Grund. „Abbrechen“ = nichts wird geändert.</div>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <select value={edit.staffId} onChange={(e) => loadDay(e.target.value, edit.date)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Person">
                <option value="">– Person –</option>
                {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input type="date" value={edit.date} onChange={(e) => loadDay(edit.staffId, e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Tag" />
            </div>
            {daySessions && (() => {
              const absKey = `abs${edit.staffId}|${edit.date}`;
              const pAbs = pending.find((p) => p.key === absKey);
              const dayAdds = pending.filter((p) => p.op === "add" && p.staffId === edit.staffId && p.date === edit.date);
              const mark = <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">vorgemerkt</span>;
              return (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                {pAbs ? (
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span>{pAbs.op === "absence" ? <>Abwesenheit: <b>{ABSENCE[pAbs.kind].label}</b>{pAbs.note ? ` · ${pAbs.note}` : ""}</> : <>Abwesenheit <s>{ABSENCE[pAbs.kind].label}</s> wird aufgehoben</>}{mark}</span>
                    <button onClick={() => unqueue(absKey)} className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Vormerkung entfernen</button>
                  </div>
                ) : dayAbsence ? (
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span>Abwesenheit: <b>{ABSENCE[dayAbsence.kind].label}</b>{dayAbsence.note ? ` · ${dayAbsence.note}` : ""}</span>
                    <span className="whitespace-nowrap"><button onClick={() => setAbsForm({ staffId: edit.staffId, date: edit.date, kind: dayAbsence.kind, note: dayAbsence.note || "", queue: true })} className="mr-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Ändern</button><button onClick={() => queueUnabsence(dayAbsence)} className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-700">Aufheben</button></span></div>
                ) : (
                  <button onClick={() => setAbsForm({ staffId: edit.staffId, date: edit.date, kind: "krank", note: "", queue: true })} className="mb-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Abwesenheit eintragen …</button>
                )}
                {absForm && absForm.queue && absForm.staffId === edit.staffId && absForm.date === edit.date && (
                  <div className="mb-2 flex flex-wrap items-end gap-2 border-y border-slate-200 py-2">
                    <label className="text-xs text-slate-600">Grund
                      <select value={absForm.kind} onChange={(e) => setAbsForm({ ...absForm, kind: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                        {Object.keys(ABSENCE).map((k) => <option key={k} value={k}>{ABSENCE[k].label}{ABSENCE[k].credit ? "" : " (Stunden fehlen)"}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Notiz (optional)<input value={absForm.note} maxLength={500} onChange={(e) => setAbsForm({ ...absForm, note: e.target.value })} className="mt-1 block w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
                    <button onClick={queueAbsence} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">Vormerken</button>
                    <button onClick={() => setAbsForm(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                  </div>
                )}
                {daySessions.length === 0 && dayAdds.length === 0 && <div className="text-xs text-slate-500">An diesem Tag gibt es keine Stempelung.</div>}
                {daySessions.map((x) => {
                  const pf = pending.find((p) => p.op === "fix" && p.sessionId === x.id);
                  return (
                    <div key={x.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                      <span>Kommen {pf && pf.in ? <><s className="text-slate-400">{clock(x.check_in)}</s> <b>{clock(pf.in)}</b></> : <b>{clock(x.check_in)}</b>} · Gehen {pf && pf.out ? <><s className="text-slate-400">{x.check_out ? clock(x.check_out) : "fehlt"}</s> <b>{clockOn(pf.out, edit.date)}</b></> : <b>{x.check_out ? clock(x.check_out) : "fehlt"}</b>}{pf && mark}</span>
                      <span className="whitespace-nowrap">
                        {pf && <button onClick={() => unqueue(pf.key)} className="mr-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Vormerkung entfernen">✕</button>}
                        <button onClick={() => setFix({ sessionId: x.id, in: pf && pf.in ? clock(pf.in) : "", out: pf && pf.out ? clock(pf.out) : "" })} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Korrigieren</button>
                      </span>
                    </div>
                  );
                })}
                {dayAdds.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span>Kommen <b>{clock(p.in)}</b> · Gehen <b>{clockOn(p.out, p.date)}</b> (nachgetragen){mark}</span>
                    <button onClick={() => unqueue(p.key)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" aria-label="Vormerkung entfernen">✕</button>
                  </div>
                ))}
                {!fix && <button onClick={() => setFix({ sessionId: null, in: "", out: "" })} className="mt-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">+ Zeit nachtragen</button>}
                {fix && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2">
                    <label className="text-xs text-slate-600">Kommen<input type="time" value={fix.in} onChange={(e) => setFix({ ...fix, in: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <label className="text-xs text-slate-600">Gehen<input type="time" value={fix.out} onChange={(e) => setFix({ ...fix, out: e.target.value })} className="mt-1 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
                    <button onClick={queueFix} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">Vormerken</button>
                    <button onClick={() => setFix(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                    {fix.sessionId && <div className="w-full text-[11px] text-slate-500">Nur das eintragen, was falsch ist. Die Stempelung selbst bleibt erhalten; die Korrektur wird beim Speichern mit Grund protokolliert.</div>}
                  </div>
                )}
              </div>
              );
            })()}
            {pending.length > 0 && (
              <div className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                <div className="text-sm font-semibold text-amber-900">{pending.length} {pending.length === 1 ? "Änderung" : "Änderungen"} für {ymLabel(pendMonth)} – noch nicht gespeichert</div>
                <ul className="mt-1 divide-y divide-amber-200">
                  {sortedPending.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-2 py-1 text-xs text-slate-800">
                      <button onClick={() => loadDay(p.staffId, p.date)} className="text-left hover:underline"><b>{dayLabel(p.date)}</b> · {names[p.staffId] || "?"} · {describe(p)}</button>
                      <button onClick={() => unqueue(p.key)} className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-600" aria-label="Diese Änderung entfernen">✕</button>
                    </li>
                  ))}
                </ul>
                <label className="mt-2 block text-xs text-slate-700">Grund für alle Änderungen (Pflicht)
                  <input value={pendReason} maxLength={500} onChange={(e) => setPendReason(e.target.value)} placeholder="z. B. Stempeln vergessen, laut Aussage der Person" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={savePending} disabled={busy === "pend"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px disabled:opacity-60">{busy === "pend" ? "Speichert …" : `Speichern (${pending.length})`}</button>
                  <button onClick={cancelPending} disabled={busy === "pend"} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">Abbrechen</button>
                </div>
                <div className="mt-1 text-[11px] text-amber-900">Gespeichert wird alles zusammen oder gar nichts. Bis dahin ändert sich nichts – auch nicht für die Mitarbeitenden.</div>
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
