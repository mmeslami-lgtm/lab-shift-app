"use client";

import React, { useContext, useEffect, useMemo, useState } from "react";
import { CalendarDays, Users, FileText, Clock, Gift, ChevronLeft, ChevronRight, Sunrise, Sunset, Moon } from "lucide-react";
import { OrgContext } from "../lib/orgContext";
import EmployeeWishes from "./EmployeeWishes";

// ---------------------------------------------------------------------------------------------
// Employee app on REAL data. Reads only what the database rules allow for this login:
//   * the published shifts of the company (shift_definitions + scheduled_shifts, status 'published')
//   * the names of the team (team_directory)
// Requests, times and wishes are still being connected and show a note for now.
// ---------------------------------------------------------------------------------------------

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const PAPER = "#E9EEF8";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";
const MONTH_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const GRID_HEAD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Colours are handed out in the order the supervisor listed the shifts.
const PALETTE = [
  { solid: "#F2B544", soft: "#FFF1D2", ink: "#7A4E00" },
  { solid: "#D9586F", soft: "#FCE5EA", ink: "#8A2A3E" },
  { solid: "#3D4BA8", soft: "#E3E6F8", ink: "#222C7E" },
  { solid: "#2F9E8F", soft: "#DDF3EF", ink: "#17625A" },
  { solid: "#8E5CC9", soft: "#EDE3F8", ink: "#4F2A82" },
  { solid: "#E07B39", soft: "#FCE9DA", ink: "#8A4313" },
  { solid: "#6B8E23", soft: "#EAF1D8", ink: "#3D5210" },
];

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const hhmm = (t) => String(t || "").slice(0, 5);
const toMin = (t) => { const [h, m] = String(t).split(":"); return (+h || 0) * 60 + (+m || 0); };
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtH = (h) => h.toFixed(1).replace(".", ",");

function shiftIcon(def) {
  if (def.requires_rest_after) return Moon;
  const s = toMin(def.start_time), e = toMin(def.end_time);
  if (e <= s) return Moon;
  return s < 11 * 60 ? Sunrise : Sunset;
}
function netHours(def) {
  const s = toMin(def.start_time); let e = toMin(def.end_time); if (e <= s) e += 1440;
  return Math.max(0, (e - s - 30) / 60);
}
// short unique code per shift for the calendar cells
function makeCodes(defs) {
  const used = new Set(); const codes = {};
  defs.forEach((d) => {
    const letters = String(d.label || "").replace(/[^A-Za-zÄÖÜäöüß]/g, "").toUpperCase();
    let len = 1, code = letters.slice(0, 1) || "X";
    while (used.has(code) && len < letters.length) { len++; code = letters.slice(0, len); }
    let n = 2; const base = code; while (used.has(code)) { code = base + n; n++; }
    used.add(code); codes[d.key] = code;
  });
  return codes;
}

const navBtn = { width: 34, height: 34, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fff", display: "grid", placeItems: "center", color: INK, cursor: "pointer", padding: 0 };
const Card = ({ children, style }) => <div style={{ background: "#fff", borderRadius: 20, padding: 16, border: "1px solid #CBD8EE", boxShadow: "0 6px 18px -12px rgba(36,59,107,.35)", ...style }}>{children}</div>;

export default function EmployeeLive() {
  const org = useContext(OrgContext);
  const now = useMemo(() => new Date(), []);
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const [tab, setTab] = useState("plan");
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selIso, setSelIso] = useState(todayIso);
  const [teamMode, setTeamMode] = useState("people");
  const [defs, setDefs] = useState(null);
  const [people, setPeople] = useState([]);
  const [myMonth, setMyMonth] = useState({});   // iso -> shift key, for the viewed month
  const [nextShift, setNextShift] = useState(undefined);
  const [dayShifts, setDayShifts] = useState([]); // all published shifts on the selected day
  const [myChanges, setMyChanges] = useState({});   // iso -> [{ key, kind }] changes of MY shifts that have not happened yet
  const [error, setError] = useState("");
  const [closedDays, setClosedDays] = useState(new Set()); // iso dates the whole company is closed (Betriebsschließung)

  const sb = org.supabase;
  const my = org.staffId;

  // static data: shift kinds + team names
  useEffect(() => {
    (async () => {
      const d = await sb.from("shift_definitions").select("key, label, start_time, end_time, requires_rest_after, sort_order, active").eq("org_id", org.orgId).order("sort_order");
      const p = await sb.from("team_directory").select("id, name").eq("org_id", org.orgId);
      if (d.error || p.error) { setError((d.error || p.error).message); return; }
      setDefs(d.data); setPeople(p.data);
    })();
  }, [sb, org.orgId]);

  // my published shifts in the viewed month
  useEffect(() => {
    if (!my) return;
    (async () => {
      const from = isoOf(view.y, view.m, 1);
      const nx = new Date(view.y, view.m + 1, 1);
      const to = isoOf(nx.getFullYear(), nx.getMonth(), 1);
      const r = await sb.from("scheduled_shifts").select("shift_date, shift_key").eq("org_id", org.orgId).eq("staff_id", my).eq("status", "published").gte("shift_date", from).lt("shift_date", to);
      if (r.error) { setError(r.error.message); return; }
      const map = {}; r.data.forEach((x) => { map[x.shift_date] = x.shift_key; });
      setMyMonth(map);
    })();
  }, [sb, org.orgId, my, view]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await sb.from("month_closures").select("days").eq("org_id", org.orgId).eq("year", view.y).eq("month", view.m + 1);
      if (cancelled) return;
      const list = !r.error && r.data && r.data[0] ? r.data[0].days || [] : []; // table missing (script 10 not run) = nothing closed
      setClosedDays(new Set(list.map((d) => isoOf(view.y, view.m, Number(d)))));
    })();
    return () => { cancelled = true; };
  }, [sb, org.orgId, view]);

  // my next shift from today on
  useEffect(() => {
    if (!my) { setNextShift(null); return; }
    (async () => {
      const r = await sb.from("scheduled_shifts").select("shift_date, shift_key").eq("org_id", org.orgId).eq("staff_id", my).eq("status", "published").gte("shift_date", todayIso).order("shift_date").limit(3);
      if (r.error) { setError(r.error.message); return; }
      setNextShift(r.data[0] || null);
    })();
  }, [sb, org.orgId, my, todayIso]);

  // changes of my own shifts (new / extra / cancelled) from today on. Only date + shift + kind: never who was
  // replaced and never the reason.
  useEffect(() => {
    if (!my) return;
    (async () => {
      const r = await sb.from("my_shift_changes").select("change_date, shift_key, kind").eq("org_id", org.orgId).gte("change_date", todayIso);
      if (r.error) return; // view is created by changes-schema.sql; the app works without it
      const m = {}; r.data.forEach((c) => { (m[c.change_date] = m[c.change_date] || []).push({ key: c.shift_key, kind: c.kind }); });
      setMyChanges(m);
    })();
  }, [sb, org.orgId, my, todayIso]);

  // everyone's shifts on the selected day (team tab)
  useEffect(() => {
    (async () => {
      const r = await sb.from("scheduled_shifts").select("staff_id, shift_key").eq("org_id", org.orgId).eq("status", "published").eq("shift_date", selIso);
      if (r.error) { setError(r.error.message); return; }
      setDayShifts(r.data);
    })();
  }, [sb, org.orgId, selIso]);

  const defByKey = useMemo(() => { const m = {}; (defs || []).forEach((d) => { m[d.key] = d; }); return m; }, [defs]);
  const shownDefs = useMemo(() => (defs || []).filter((d) => d.active !== false), [defs]);
  const codes = useMemo(() => makeCodes(shownDefs), [shownDefs]);
  const styleOf = (key) => { const i = Math.max(0, shownDefs.findIndex((d) => d.key === key)); return PALETTE[i % PALETTE.length]; };
  const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "Unbekannt";

  const grid = useMemo(() => {
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const cells = []; for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysIn(view.y, view.m); d++) cells.push(d);
    return cells;
  }, [view]);
  function shiftMonth(delta) { setView((v) => { const dt = new Date(v.y, v.m + delta, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; }); }
  function moveSel(delta) {
    const dt = parseIso(selIso); dt.setDate(dt.getDate() + delta);
    setSelIso(isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate())); setView({ y: dt.getFullYear(), m: dt.getMonth() });
  }

  function DayStrip({ def }) {
    const s = toMin(def.start_time), e = toMin(def.end_time);
    const segs = e > s ? [[s, e]] : [[s, 1440], [0, e]];
    const col = styleOf(def.key).solid;
    return (
      <div>
        <div style={{ position: "relative", height: 10, borderRadius: 10, background: "rgba(255,255,255,.18)" }}>
          {segs.map(([a, b], i) => <div key={i} style={{ position: "absolute", left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%`, top: 0, bottom: 0, background: col, borderRadius: 10 }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 5, opacity: 0.7 }}><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      </div>
    );
  }
  const relDay = (iso) => {
    if (iso === todayIso) return "Heute";
    const t = parseIso(todayIso); t.setDate(t.getDate() + 1);
    if (iso === isoOf(t.getFullYear(), t.getMonth(), t.getDate())) return "Morgen";
    const d = parseIso(iso); return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()}. ${MONTH_DE[d.getMonth()].slice(0, 3)}.`;
  };

  const selDate = parseIso(selIso);
  const selKey = myMonth[selIso];
  const monthHours = Object.values(myMonth).reduce((sum, k) => sum + (defByKey[k] ? netHours(defByKey[k]) : 0), 0);
  const tabs = [["plan", "Plan", CalendarDays], ["team", "Team", Users], ["requests", "Anträge", FileText], ["time", "Zeiten", Clock], ["wishes", "Wünsche", Gift]];

  return (
    <div dir="ltr" style={{ background: PAPER, color: INK, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", minHeight: "100vh", paddingBottom: 96 }}>
      <style>{`.tn{font-variant-numeric:tabular-nums} button:focus-visible{outline:2px solid ${PRIMARY};outline-offset:2px}`}</style>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 0" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, color: MUTED }}>{org.orgName}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{(people.find((p) => p.id === my) || {}).name || org.session.user.email}</div>
          </div>
          <button onClick={() => sb.auth.signOut()} style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", color: INK, fontSize: 13, fontWeight: 600, padding: "8px 12px", cursor: "pointer" }}>Abmelden</button>
        </div>

        {error && <Card style={{ background: "#FCE5EA", color: "#8A2A3E", fontSize: 13, marginBottom: 12 }}>Fehler beim Laden: {error}</Card>}
        {!my && <Card style={{ background: "#FFF1D2", color: "#7A4E00", fontSize: 14, marginBottom: 12 }}>Dein Konto ist noch keiner Person zugeordnet. Die Leitung muss das einrichten, dann siehst du deine Schichten.</Card>}

        {tab === "plan" && (
          <>
            {my && nextShift !== undefined && (
              <div style={{ background: PRIMARY, color: "#fff", borderRadius: 22, padding: "18px 18px 16px", marginBottom: 18 }}>
                {nextShift && defByKey[nextShift.shift_key] ? (() => {
                  const def = defByKey[nextShift.shift_key]; const Icon = shiftIcon(def);
                  return (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 13, opacity: 0.75 }}>Deine nächste Schicht · {relDay(nextShift.shift_date)}
                            {(myChanges[nextShift.shift_date] || []).some((c) => c.key === nextShift.shift_key && c.kind !== "cancelled") && <span style={{ marginLeft: 8, background: "#F59E0B", color: "#1B2433", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Geändert</span>}
                          </div>
                          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: -0.4 }}>{def.label}</div>
                        </div>
                        <div style={{ width: 40, height: 40, borderRadius: 14, background: styleOf(def.key).solid, display: "grid", placeItems: "center", color: INK }}><Icon size={22} /></div>
                      </div>
                      <div className="tn" style={{ fontSize: 34, fontWeight: 700, margin: "10px 0 14px", letterSpacing: -0.8 }}>{hhmm(def.start_time)} – {hhmm(def.end_time)}</div>
                      <DayStrip def={def} />
                    </>
                  );
                })() : <div style={{ fontSize: 15 }}>Für dich ist noch keine Schicht veröffentlicht.</div>}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button aria-label="Vorheriger Monat" onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={18} /></button>
              <div style={{ fontSize: 17, fontWeight: 650 }}>{MONTH_DE[view.m]} {view.y}</div>
              <button aria-label="Nächster Monat" onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={18} /></button>
            </div>
            <Card style={{ padding: "12px 10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
                {GRID_HEAD.map((h) => <div key={h} style={{ textAlign: "center", fontSize: 11, color: MUTED }}>{h}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {grid.map((d, i) => {
                  if (d === null) return <div key={`e${i}`} />;
                  const iso = isoOf(view.y, view.m, d); const key = myMonth[iso]; const st = key ? styleOf(key) : null;
                  const today = iso === todayIso;
                  return (
                    <button key={d} onClick={() => setSelIso(iso)} aria-label={`${d}. ${MONTH_DE[view.m]}${key && defByKey[key] ? ", " + defByKey[key].label : ", frei"}${(myChanges[iso] || []).length ? " (geändert)" : ""}`}
                      style={{ position: "relative", height: 54, borderRadius: 12, border: iso === selIso ? `2px solid ${PRIMARY}` : "2px solid transparent", background: st ? st.soft : PAPER, padding: "5px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                      <span className="tn" style={{ fontSize: 13, fontWeight: today ? 800 : 500, color: today ? "#fff" : INK, background: today ? PRIMARY : "transparent", borderRadius: 10, minWidth: 22, lineHeight: "22px", textAlign: "center" }}>{d}</span>
                      {st ? <span style={{ fontSize: 11, fontWeight: 700, color: st.ink }}>{codes[key] || "?"}</span>
                        : (myChanges[iso] || []).some((c) => c.kind === "cancelled") ? <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309" }}>✕</span>
                        : closedDays.has(iso) ? <span style={{ fontSize: 10, fontWeight: 600, color: MUTED }}>zu</span> : <span style={{ height: 14 }} />}
                      {(myChanges[iso] || []).length > 0 && <i aria-hidden="true" style={{ position: "absolute", top: 4, right: 5, width: 7, height: 7, borderRadius: 7, background: "#F59E0B" }} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 12, paddingLeft: 4, fontSize: 11, color: MUTED }}>
                {shownDefs.map((d) => <span key={d.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: styleOf(d.key).solid, display: "inline-block" }} />{codes[d.key]} {d.label}</span>)}
              </div>
              {Object.keys(myChanges).length > 0 && <div style={{ fontSize: 11, color: "#B45309", marginTop: 8, paddingLeft: 4 }}>● geändert · ✕ entfällt</div>}
              {closedDays.size > 0 && <div style={{ fontSize: 11, color: MUTED, marginTop: 6, paddingLeft: 4 }}>zu = Betrieb geschlossen</div>}
              <div className="tn" style={{ fontSize: 12, color: MUTED, marginTop: 10, paddingLeft: 4 }}>Geplant in diesem Monat: {fmtH(monthHours)} Std.</div>
            </Card>

            <Card style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>{WEEKDAY_LONG[selDate.getDay()]}, {selDate.getDate()}. {MONTH_DE[selDate.getMonth()]}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button aria-label="Vorheriger Tag" onClick={() => moveSel(-1)} style={{ ...navBtn, width: 30, height: 30 }}><ChevronLeft size={16} /></button>
                  <button aria-label="Nächster Tag" onClick={() => moveSel(1)} style={{ ...navBtn, width: 30, height: 30 }}><ChevronRight size={16} /></button>
                </div>
              </div>
              {selKey && defByKey[selKey] ? (() => {
                const def = defByKey[selKey]; const st = styleOf(selKey); const Icon = shiftIcon(def);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: st.soft, borderRadius: 14, padding: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: st.solid, display: "grid", placeItems: "center", color: INK }}><Icon size={20} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 650, color: st.ink }}>{def.label}</div>
                      <div className="tn" style={{ fontSize: 13, color: MUTED }}>{hhmm(def.start_time)} – {hhmm(def.end_time)}</div>
                    </div>
                    <div className="tn" style={{ fontSize: 13, fontWeight: 650, color: st.ink }}>{fmtH(netHours(def))} Std.</div>
                  </div>
                );
              })() : <div style={{ fontSize: 14, color: MUTED }}>{closedDays.has(selIso) ? "Der Betrieb ist an diesem Tag geschlossen." : "Kein Dienst. Der Tag ist frei."}</div>}
              {(myChanges[selIso] || []).map((c, i) => (
                <div key={i} style={{ marginTop: 10, background: "#FFF1D2", color: "#7A4E00", borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 600 }}>
                  {c.kind === "cancelled"
                    ? `Deine Schicht „${(defByKey[c.key] || {}).label || c.key}“ an diesem Tag entfällt.`
                    : `Geändert: Du bist neu für „${(defByKey[c.key] || {}).label || c.key}“ eingeteilt.`}
                </div>
              ))}
            </Card>
          </>
        )}

        {tab === "team" && (() => {
          const working = dayShifts.map((x) => ({ id: x.staff_id, key: x.shift_key }));
          const freePeople = people.filter((p) => !working.some((w) => w.id === p.id));
          return (
            <>
              <div style={{ display: "flex", background: "#E7EBF2", borderRadius: 14, padding: 3, marginBottom: 12 }}>
                {[["people", "Mitarbeitende"], ["shifts", "Schichten"]].map(([k, l]) => (
                  <button key={k} onClick={() => setTeamMode(k)} style={{ flex: 1, border: 0, borderRadius: 11, padding: "9px 0", fontSize: 14, fontWeight: 650, cursor: "pointer", background: teamMode === k ? "#fff" : "transparent", color: teamMode === k ? PRIMARY : MUTED }}>{l}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <button aria-label="Vorheriger Tag" onClick={() => moveSel(-1)} style={navBtn}><ChevronLeft size={18} /></button>
                <div style={{ fontSize: 16, fontWeight: 650 }}>{WEEKDAY_SHORT[selDate.getDay()]}, {selDate.getDate()}. {MONTH_DE[selDate.getMonth()].slice(0, 3)}.</div>
                <button aria-label="Nächster Tag" onClick={() => moveSel(1)} style={navBtn}><ChevronRight size={18} /></button>
              </div>
              <div style={{ fontSize: 12, color: MUTED, margin: "0 2px 8px" }}>{working.length} im Dienst · {freePeople.length} nicht im Dienst</div>

              {teamMode === "people" && (
                <>
                  {working.map((w) => { const d = defByKey[w.key]; const st = styleOf(w.key); return (
                    <div key={w.id + w.key} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <i style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: st.solid }} />
                      <div><div style={{ fontSize: 15, fontWeight: w.id === my ? 700 : 600 }}>{nameOf(w.id)}{w.id === my ? " (du)" : ""}</div>
                        <div className="tn" style={{ fontSize: 13, color: st.ink }}>{d ? `${d.label} · ${hhmm(d.start_time)} – ${hhmm(d.end_time)}` : w.key}</div></div>
                    </div>); })}
                  {freePeople.map((p) => (
                    <div key={p.id} style={{ background: "#EDEFF4", borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <i style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: "#C4CAD6" }} />
                      <div><div style={{ fontSize: 15, fontWeight: p.id === my ? 700 : 600 }}>{p.name}{p.id === my ? " (du)" : ""}</div><div style={{ fontSize: 13, color: MUTED }}>Frei</div></div>
                    </div>))}
                  {!people.length && <div style={{ fontSize: 14, color: MUTED }}>Keine Personen sichtbar.</div>}
                </>
              )}
              {teamMode === "shifts" && shownDefs.map((d) => {
                const list = working.filter((w) => w.key === d.key); const st = styleOf(d.key);
                return (
                  <div key={d.key} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <i style={{ width: 5, alignSelf: "stretch", minHeight: 38, borderRadius: 3, background: st.solid }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 650 }}>{d.label}</div><div className="tn" style={{ fontSize: 13, color: MUTED }}>{hhmm(d.start_time)} – {hhmm(d.end_time)}</div></div>
                      <span style={{ fontSize: 13, color: MUTED }}>{list.length} {list.length === 1 ? "Person" : "Personen"}</span>
                    </div>
                    {list.map((w) => <div key={w.id} style={{ fontSize: 14, padding: "4px 0 0 17px", fontWeight: w.id === my ? 700 : 400 }}>{nameOf(w.id)}{w.id === my ? " (du)" : ""}</div>)}
                  </div>
                );
              })}
            </>
          );
        })()}

        {tab === "wishes" && <EmployeeWishes org={org} defs={defs} />}

        {(tab === "requests" || tab === "time") && (
          <Card>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{tab === "requests" ? "Anträge" : tab === "time" ? "Zeiten" : "Wünsche"}</div>
            <div style={{ fontSize: 14, color: MUTED }}>Dieser Bereich wird gerade an die Datenbank angebunden und ist noch nicht freigeschaltet. Plan und Team zeigen bereits deine echten Daten.</div>
            <a href="/demo" style={{ display: "inline-block", marginTop: 12, fontSize: 14, color: PRIMARY, fontWeight: 650 }}>Vorschau mit Beispieldaten ansehen</a>
          </Card>
        )}
      </div>

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #E1E5EC", paddingBottom: "env(safe-area-inset-bottom, 0px)", zIndex: 10 }}>
        <div style={{ maxWidth: 440, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
              style={{ background: "none", border: 0, padding: "10px 0 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === k ? PRIMARY : "#8A93A5", fontWeight: tab === k ? 700 : 500, cursor: "pointer" }}>
              <Icon size={21} /><span style={{ fontSize: 11 }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
