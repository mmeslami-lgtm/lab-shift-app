"use client";

import React, { useState, useMemo } from "react";
import { CalendarDays, Users, FileText, Clock, Gift, ChevronLeft, ChevronRight, Sunrise, Sunset, Moon, Umbrella, GraduationCap, Thermometer, Lock, Plus, X, Briefcase, Coffee, Search } from "lucide-react";

// ---------------------------------------------------------------------------------------------
// Employee-facing shift & time app (mobile first). The employee can LOOK at the plan and the
// team, see their real clock-in/out stamps and flextime, and SUBMIT requests and wishes — but can
// never change shifts. All sample data below is replaced by database content in the real system
// (plan = published by the supervisor's scheduler, stamps = chip reader, requests/wishes =
// reviewed by the supervisor).
// ---------------------------------------------------------------------------------------------

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
          <p style={{ color: "#9b1c31", fontWeight: 600, marginBottom: 8 }}>Es ist ein Fehler aufgetreten</p>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "#fdecef", padding: 12, borderRadius: 10 }}>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 10, background: "#243B6B", color: "#fff", border: 0 }}>Erneut versuchen</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const PAPER = "#E9EEF8";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";

const MONTH_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const GRID_HEAD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// ---- sample data ------------------------------------------------------------------------------
const SHIFTS = {
  F: { label: "Frühdienst", code: "F", time: "06:00-14:00", solid: "#F2B544", soft: "#FFF1D2", ink: "#7A4E00", Icon: Sunrise },
  S: { label: "Spätdienst", code: "S", time: "13:30-22:00", solid: "#D9586F", soft: "#FCE5EA", ink: "#8A2A3E", Icon: Sunset },
  N: { label: "Nachtdienst", code: "N", time: "22:00-06:30", solid: "#3D4BA8", soft: "#E3E6F8", ink: "#222C7E", Icon: Moon },
};
const LEAVE = { label: "Urlaub", code: "U", solid: "#3E9C74", soft: "#DDF2E8", ink: "#1F6347", Icon: Umbrella };

const ME = "a";
const STAFF = [
  { id: "a", name: "Anna Keller", weeklyHours: 38.5 },
  { id: "b", name: "Jonas Meyer", weeklyHours: 38.5 },
  { id: "c", name: "Selin Aydin", weeklyHours: 38.5 },
  { id: "d", name: "David Novak", weeklyHours: 38.5 },
  { id: "e", name: "Marta Lenz", weeklyHours: 38.5 },
  { id: "f", name: "Tobias Roth", weeklyHours: 38.5 },
];
// One 12-day rotation, shifted by 2 days per person: together the six people cover every day with
// 2x Früh, 1x Spät and 1x Nacht. It keeps 3 days off after a night block and never puts a Früh
// right after a Spät.
const ROTATION = ["F", "F", "F", "", "S", "S", "N", "N", "", "", "", "F"];
const OFFSET = { a: 0, b: 2, c: 4, d: 6, e: 8, f: 10 };

// Request types are defined by the supervisor in the real system; employees only pick from them.
const REQUEST_TYPES = [
  { key: "urlaub", label: "Urlaub", Icon: Umbrella, usesVacation: true },
  { key: "fortbildung", label: "Fortbildung", Icon: GraduationCap },
  { key: "krank", label: "Krankmeldung / Attest", Icon: Thermometer },
];
const VACATION_TOTAL = 30;
const OPENING_FLEX_MIN = 10 * 60; // flextime balance at the start of the oldest month shown
// -----------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 86400000);
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
const fmtDate = (iso) => { const { y, m, d } = parseIso(iso); return `${pad(d)}.${pad(m + 1)}.${y}`; };
const hhmm = (min) => { const t = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const fmtHM = (min) => { const s = min < 0 ? "-" : ""; const a = Math.abs(Math.round(min)); return `${s}${Math.floor(a / 60)}:${pad(a % 60)}`; };
const fmtH = (h) => h.toFixed(1).replace(".", ",");

function parseRange(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return { start: 0, end: 0 };
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
}
function shiftMinutes(key) {
  const { start, end } = parseRange(SHIFTS[key].time);
  return (end <= start ? end + 1440 : end) - start - 30; // 30 min unpaid break
}

function EmployeeAppInner() {
  const now = useMemo(() => new Date(), []);
  const todayKey = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const [tab, setTab] = useState("plan");
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState({ y: now.getFullYear(), m: now.getMonth(), d: now.getDate() });
  const [teamMode, setTeamMode] = useState("people");
  const [openShift, setOpenShift] = useState(null);
  const [detailDay, setDetailDay] = useState(null); // iso date opened in the timesheet
  const [sheet, setSheet] = useState(null); // {kind:'request'|'wish', ...}
  const [typeQuery, setTypeQuery] = useState("");
  const [requests, setRequests] = useState([
    { id: 1, type: "urlaub", from: isoOf(now.getFullYear(), now.getMonth() - 1, 3), to: isoOf(now.getFullYear(), now.getMonth() - 1, 9), days: 4, status: "approved", note: "" },
    { id: 2, type: "urlaub", from: isoOf(now.getFullYear(), now.getMonth() + 2, 14), to: isoOf(now.getFullYear(), now.getMonth() + 2, 25), days: 8, status: "approved", note: "" },
    { id: 3, type: "fortbildung", from: isoOf(now.getFullYear(), now.getMonth() + 1, 5), to: isoOf(now.getFullYear(), now.getMonth() + 1, 5), days: 1, status: "open", note: "Hygieneschulung" },
  ]);
  const [wishes, setWishes] = useState([]);
  const [form, setForm] = useState({ type: "urlaub", from: todayKey, to: todayKey, note: "", shift: "" });
  const [formError, setFormError] = useState("");

  const leaveSet = useMemo(() => {
    const s = new Set();
    for (let d = 12; d <= 16; d++) s.add(`b|${isoOf(now.getFullYear(), now.getMonth(), d)}`);
    return s;
  }, [now]);

  function entryFor(id, y, m, d) {
    if (leaveSet.has(`${id}|${isoOf(y, m, d)}`)) return "U";
    const idx = (((dayNum(y, m, d) + OFFSET[id]) % 12) + 12) % 12;
    return ROTATION[idx] || "";
  }
  const metaOf = (code) => (code === "U" ? LEAVE : SHIFTS[code]);
  const myPerson = STAFF.find((s) => s.id === ME);

  // ---------- next shift ----------
  const next = useMemo(() => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < 60; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const code = entryFor(ME, dt.getFullYear(), dt.getMonth(), dt.getDate());
      if (!code || code === "U") continue;
      const { start, end } = parseRange(SHIFTS[code].time);
      if (i === 0 && end > start && end <= nowMin) continue;
      return { date: dt, code, offset: i };
    }
    return null;
  }, [now]);
  const relDay = (n) => (n.offset === 0 ? "Heute" : n.offset === 1 ? "Morgen" : `${WEEKDAY_SHORT[n.date.getDay()]}, ${n.date.getDate()}. ${MONTH_DE[n.date.getMonth()].slice(0, 3)}.`);

  // ---------- calendar ----------
  const grid = useMemo(() => {
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysIn(view.y, view.m); d++) cells.push(d);
    return cells;
  }, [view]);
  function shiftMonth(delta) {
    setView((v) => { const dt = new Date(v.y, v.m + delta, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  }
  function moveSel(delta) {
    const dt = new Date(sel.y, sel.m, sel.d + delta);
    setSel({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() });
    setView({ y: dt.getFullYear(), m: dt.getMonth() });
  }
  const isToday = (y, m, d) => isoOf(y, m, d) === todayKey;
  const isSel = (y, m, d) => sel.y === y && sel.m === m && sel.d === d;
  const selDate = new Date(sel.y, sel.m, sel.d);
  const selCode = entryFor(ME, sel.y, sel.m, sel.d);

  const monthPlan = useMemo(() => {
    const total = daysIn(view.y, view.m);
    let minutes = 0, leaveDays = 0;
    for (let d = 1; d <= total; d++) {
      const c = entryFor(ME, view.y, view.m, d);
      if (c === "U") leaveDays++;
      else if (c) minutes += shiftMinutes(c);
    }
    return { hours: minutes / 60, target: Math.max(0, myPerson.weeklyHours * ((total - leaveDays) / 7)) };
  }, [view]);

  // ---------- timesheet (stamps come from the chip reader in the real system) ----------
  function dayRecord(y, m, d) {
    const code = entryFor(ME, y, m, d);
    if (!code || code === "U") return { code, stamped: false };
    const { start, end } = parseRange(SHIFTS[code].time);
    const hash = (dayNum(y, m, d) * 2654435761) >>> 0;
    const inMin = start + ((hash % 13) - 6);
    const outMin = (end <= start ? end + 1440 : end) + (((hash >>> 8) % 25) - 6);
    const gross = outMin - inMin;
    const brk = gross > 360 ? 30 : 0;
    const worked = gross - brk;
    const planned = shiftMinutes(code);
    const past = isoOf(y, m, d) < todayKey;
    return { code, stamped: past, inMin, outMin, gross, brk, worked, planned, flexi: worked - planned };
  }
  const ledger = useMemo(() => {
    let running = OPENING_FLEX_MIN;
    const months = [];
    for (let k = 2; k >= 0; k--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const y = dt.getFullYear(), m = dt.getMonth();
      const startBalance = running;
      const days = [];
      for (let d = 1; d <= daysIn(y, m); d++) {
        const rec = dayRecord(y, m, d);
        const prev = running;
        if (rec.stamped) running += rec.flexi;
        days.push({ y, m, d, iso: isoOf(y, m, d), rec, prev, after: running });
      }
      months.push({ y, m, startBalance, endBalance: running, days, closed: k > 0 });
    }
    return { months, balance: running };
  }, [now]);
  const flatDays = useMemo(() => ledger.months.flatMap((mm) => mm.days), [ledger]);

  // ---------- requests / wishes ----------
  function planDaysBetween(fromIso, toIso) {
    const a = parseIso(fromIso), b = parseIso(toIso);
    let n = 0;
    for (let t = dayNum(a.y, a.m, a.d); t <= dayNum(b.y, b.m, b.d); t++) {
      const dt = new Date(t * 86400000);
      const c = entryFor(ME, dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      if (c && c !== "U") n++;
    }
    return n;
  }
  const vacationUsed = requests.filter((r) => REQUEST_TYPES.find((t) => t.key === r.type)?.usesVacation && r.status !== "denied").reduce((s, r) => s + r.days, 0);
  const vacationLeft = VACATION_TOTAL - vacationUsed;

  function openSheet(kind, preset) {
    setFormError("");
    setForm({ type: preset || (kind === "wish" ? "free" : "urlaub"), from: todayKey, to: todayKey, note: "", shift: "" });
    setSheet({ kind });
  }
  function submitForm() {
    if (!form.from || !form.to) return setFormError("Bitte Start- und Enddatum wählen.");
    if (form.to < form.from) return setFormError("Das Enddatum liegt vor dem Startdatum.");
    if (sheet.kind === "request") {
      const days = planDaysBetween(form.from, form.to);
      const t = REQUEST_TYPES.find((x) => x.key === form.type);
      if (t.usesVacation && days > vacationLeft) return setFormError(`Nur noch ${vacationLeft} Urlaubstage übrig, der Antrag braucht ${days}.`);
      setRequests((prev) => [{ id: Date.now(), type: form.type, from: form.from, to: form.to, days, status: "open", note: form.note.trim() }, ...prev]);
    } else {
      setWishes((prev) => [{ id: Date.now(), type: form.type, from: form.from, to: form.to, shift: form.type === "work" ? form.shift : "", note: form.note.trim() }, ...prev]);
    }
    setSheet(null);
  }

  // ---------- small UI pieces ----------
  function DayStrip({ code, height = 10 }) {
    const { start, end } = parseRange(SHIFTS[code].time);
    const segs = end > start ? [[start, end]] : [[start, 1440], [0, end]];
    return (
      <div>
        <div style={{ position: "relative", height, borderRadius: height, background: "rgba(255,255,255,.18)" }}>
          {segs.map(([a, b], i) => (
            <div key={i} style={{ position: "absolute", left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%`, top: 0, bottom: 0, background: SHIFTS[code].solid, borderRadius: height }} />
          ))}
        </div>
        <div className="tn" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 5, opacity: 0.7 }}>
          <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>
    );
  }
  const Card = ({ children, style }) => <div style={{ background: "#fff", borderRadius: 20, padding: 16, ...style }}>{children}</div>;
  const Pager = ({ label, onPrev, onNext, big }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <button aria-label="Zurück" onClick={onPrev} style={navBtn}><ChevronLeft size={18} /></button>
      <div style={{ fontSize: big ? 17 : 16, fontWeight: 650 }}>{label}</div>
      <button aria-label="Weiter" onClick={onNext} style={navBtn}><ChevronRight size={18} /></button>
    </div>
  );
  const StatusChip = ({ status }) => {
    const m = { open: ["Offen", "#FFF1D2", "#7A4E00"], approved: ["Genehmigt", "#DDF2E8", "#1F6347"], denied: ["Abgelehnt", "#FCE5EA", "#8A2A3E"] }[status];
    return <span style={{ fontSize: 11, fontWeight: 650, background: m[1], color: m[2], borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{m[0]}</span>;
  };
  const Row = ({ label, value, bold, muted, tone }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 14 }}>
      <span style={{ color: muted ? MUTED : INK }}>{label}</span>
      <span className="tn" style={{ fontWeight: bold ? 700 : 400, color: tone === "pos" ? "#1F6347" : tone === "neg" ? "#B3263E" : INK }}>{value}</span>
    </div>
  );

  // ---------- timesheet detail screen ----------
  function renderDetail() {
    const entry = flatDays.find((x) => x.iso === detailDay);
    if (!entry) return null;
    const { rec, prev, after } = entry;
    const dt = new Date(entry.y, entry.m, entry.d);
    return (
      <>
        <button onClick={() => setDetailDay(null)} style={{ background: "none", border: 0, color: PRIMARY, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10, cursor: "pointer" }}>
          <ChevronLeft size={18} /> Zurück
        </button>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginBottom: 12 }}>{WEEKDAY_LONG[dt.getDay()]}, {fmtDate(entry.iso)}</div>
        {rec.code && rec.code !== "U" && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Stempelzeiten</div>
            {rec.stamped ? [["Kommen", rec.inMin], ["Gehen", rec.outMin]].map(([label, v]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: PAPER, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
                <span style={{ fontSize: 15 }}>{label}</span>
                <span className="tn" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 650 }}>{hhmm(v)} <Lock size={14} color={MUTED} /></span>
              </div>
            )) : <div style={{ fontSize: 14, color: MUTED }}>Noch keine Stempelung. Geplant: {SHIFTS[rec.code].label}, {SHIFTS[rec.code].time.replace("-", " – ")}.</div>}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Stempelzeiten kommen vom Zeiterfassungsgerät und sind für dich gesperrt. Korrekturen macht die Leitung.</div>
          </Card>
        )}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>Arbeitstag</div>
          {rec.stamped ? (
            <>
              <Row label="Bruttoarbeitszeit" value={fmtHM(rec.gross)} />
              <Row label="Pause" value={`${rec.brk} Min.`} muted />
              <div style={{ borderTop: `1px solid ${LINE}` }}><Row label="Ist-Zeit" value={fmtHM(rec.worked)} bold /></div>
              <Row label="Soll-Zeit" value={fmtHM(rec.planned)} muted />
              <div style={{ borderTop: `1px solid ${LINE}` }}><Row label="Tagesdifferenz" value={fmtHM(rec.flexi)} bold tone={rec.flexi >= 0 ? "pos" : "neg"} /></div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: MUTED, padding: "6px 0" }}>{rec.code === "U" ? "Urlaub. Keine Sollzeit." : rec.code ? "Auswertung folgt nach der Schicht." : "Kein Dienst an diesem Tag."}</div>
          )}
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>Gleitzeitkonto</div>
          <Row label="Stand vor dem Tag" value={fmtHM(prev)} muted />
          <Row label="Tagesdifferenz" value={rec.stamped ? fmtHM(rec.flexi) : "0:00"} />
          <div style={{ borderTop: `1px solid ${LINE}` }}><Row label="Stand nach dem Tag" value={fmtHM(after)} bold /></div>
        </Card>
      </>
    );
  }

  const tabs = [["plan", "Plan", CalendarDays], ["team", "Team", Users], ["requests", "Anträge", FileText], ["time", "Zeiten", Clock], ["wishes", "Wünsche", Gift]];
  const filteredTypes = REQUEST_TYPES.filter((t) => t.label.toLowerCase().includes(typeQuery.trim().toLowerCase()));

  return (
    <div dir="ltr" style={{ background: PAPER, color: INK, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", minHeight: "100vh", paddingBottom: 96 }}>
      <style>{`.tn{font-variant-numeric:tabular-nums} button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid ${PRIMARY};outline-offset:2px}`}</style>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px 0" }}>

        {/* ===== PLAN ===== */}
        {tab === "plan" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: MUTED }}>Hallo,</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{myPerson.name.split(" ")[0]}</div>
            </div>
            <div style={{ background: PRIMARY, color: "#fff", borderRadius: 22, padding: "18px 18px 16px", marginBottom: 18 }}>
              {next ? (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, opacity: 0.75 }}>Deine nächste Schicht · {relDay(next)}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: -0.4 }}>{SHIFTS[next.code].label}</div>
                    </div>
                    <div style={{ width: 40, height: 40, borderRadius: 14, background: SHIFTS[next.code].solid, display: "grid", placeItems: "center", color: INK }}>
                      {React.createElement(SHIFTS[next.code].Icon, { size: 22 })}
                    </div>
                  </div>
                  <div className="tn" style={{ fontSize: 34, fontWeight: 700, margin: "10px 0 14px", letterSpacing: -0.8 }}>{SHIFTS[next.code].time.replace("-", " – ")}</div>
                  <DayStrip code={next.code} />
                </>
              ) : <div style={{ fontSize: 15 }}>In den nächsten Wochen ist keine Schicht für dich geplant.</div>}
            </div>

            <Pager big label={`${MONTH_DE[view.m]} ${view.y}`} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
            <Card style={{ padding: "12px 10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
                {GRID_HEAD.map((h) => <div key={h} style={{ textAlign: "center", fontSize: 11, color: MUTED }}>{h}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {grid.map((d, i) => {
                  if (d === null) return <div key={`e${i}`} />;
                  const code = entryFor(ME, view.y, view.m, d);
                  const meta = code ? metaOf(code) : null;
                  const today = isToday(view.y, view.m, d);
                  return (
                    <button key={d} onClick={() => setSel({ y: view.y, m: view.m, d })} aria-label={`${d}. ${MONTH_DE[view.m]}${meta ? ", " + meta.label : ", frei"}`}
                      style={{ height: 54, borderRadius: 12, border: isSel(view.y, view.m, d) ? `2px solid ${PRIMARY}` : "2px solid transparent", background: meta ? meta.soft : PAPER, padding: "5px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                      <span className="tn" style={{ fontSize: 13, fontWeight: today ? 800 : 500, color: today ? "#fff" : INK, background: today ? PRIMARY : "transparent", borderRadius: 10, minWidth: 22, lineHeight: "22px", textAlign: "center" }}>{d}</span>
                      {meta ? <span style={{ fontSize: 11, fontWeight: 700, color: meta.ink }}>{meta.code}</span> : <span style={{ height: 14 }} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 12, paddingLeft: 4, fontSize: 11, color: MUTED }}>
                {[...Object.values(SHIFTS), LEAVE].map((m) => (
                  <span key={m.code} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: m.solid, display: "inline-block" }} />{m.code} {m.label}</span>
                ))}
              </div>
              <div className="tn" style={{ fontSize: 12, color: MUTED, marginTop: 10, paddingLeft: 4 }}>Geplant: {fmtH(monthPlan.hours)} von {fmtH(monthPlan.target)} Std.</div>
            </Card>

            <Card style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>{WEEKDAY_LONG[selDate.getDay()]}, {selDate.getDate()}. {MONTH_DE[selDate.getMonth()]}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button aria-label="Vorheriger Tag" onClick={() => moveSel(-1)} style={navBtnSm}><ChevronLeft size={16} /></button>
                  <button aria-label="Nächster Tag" onClick={() => moveSel(1)} style={navBtnSm}><ChevronRight size={16} /></button>
                </div>
              </div>
              {selCode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: metaOf(selCode).soft, borderRadius: 14, padding: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: metaOf(selCode).solid, display: "grid", placeItems: "center", color: selCode === "N" || selCode === "U" ? "#fff" : INK }}>
                    {React.createElement(metaOf(selCode).Icon, { size: 20 })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650, color: metaOf(selCode).ink }}>{metaOf(selCode).label}</div>
                    {selCode !== "U" && <div className="tn" style={{ fontSize: 13, color: MUTED }}>{SHIFTS[selCode].time.replace("-", " – ")}</div>}
                  </div>
                  {selCode !== "U" && <div className="tn" style={{ fontSize: 13, fontWeight: 650, color: metaOf(selCode).ink }}>{fmtH(shiftMinutes(selCode) / 60)} Std.</div>}
                </div>
              ) : <div style={{ fontSize: 14, color: MUTED }}>Kein Dienst. Der Tag ist frei.</div>}
            </Card>
          </>
        )}

        {/* ===== TEAM ===== */}
        {tab === "team" && (() => {
          const monday = new Date(sel.y, sel.m, sel.d - ((selDate.getDay() + 6) % 7));
          const week = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
          const rows = STAFF.map((s) => ({ ...s, code: entryFor(s.id, sel.y, sel.m, sel.d) }));
          const working = rows.filter((r) => r.code && r.code !== "U");
          const myCode = selCode && selCode !== "U" ? selCode : null;
          return (
            <>
              <div style={{ display: "flex", background: "#E7EBF2", borderRadius: 14, padding: 3, marginBottom: 12 }}>
                {[["people", "Mitarbeitende"], ["shifts", "Schichten"]].map(([k, l]) => (
                  <button key={k} onClick={() => setTeamMode(k)} style={{ flex: 1, border: 0, borderRadius: 11, padding: "9px 0", fontSize: 14, fontWeight: 650, cursor: "pointer", background: teamMode === k ? "#fff" : "transparent", color: teamMode === k ? PRIMARY : MUTED }}>{l}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <button aria-label="Vorherige Woche" onClick={() => moveSel(-7)} style={navBtnSm}><ChevronLeft size={16} /></button>
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {week.map((dt) => {
                    const active = isSel(dt.getFullYear(), dt.getMonth(), dt.getDate());
                    const c = entryFor(ME, dt.getFullYear(), dt.getMonth(), dt.getDate());
                    return (
                      <button key={dt.getTime()} onClick={() => setSel({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() })} aria-label={`${dt.getDate()}. ${MONTH_DE[dt.getMonth()]}`}
                        style={{ border: 0, background: "none", padding: "2px 0", cursor: "pointer", color: INK }}>
                        <div style={{ fontSize: 10, color: MUTED }}>{WEEKDAY_SHORT[dt.getDay()]}</div>
                        <div className="tn" style={{ width: 30, height: 30, margin: "2px auto", borderRadius: 15, display: "grid", placeItems: "center", fontSize: 14, fontWeight: active ? 700 : 500, background: active ? PRIMARY : "transparent", color: active ? "#fff" : INK }}>{dt.getDate()}</div>
                        <i style={{ display: "block", width: 6, height: 6, borderRadius: 3, margin: "0 auto", background: c && c !== "U" ? metaOf(c).solid : "transparent" }} />
                      </button>
                    );
                  })}
                </div>
                <button aria-label="Nächste Woche" onClick={() => moveSel(7)} style={navBtnSm}><ChevronRight size={16} /></button>
              </div>

              {myCode && (
                <div style={{ background: "#E7EEFB", border: `1px solid #BCD0F2`, borderRadius: 16, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ fontWeight: 650 }}>Meine Schicht</span>
                  <span className="tn">{SHIFTS[myCode].label} · {SHIFTS[myCode].time.replace("-", " – ")}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 2px 8px" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Team {WEEKDAY_SHORT[selDate.getDay()]}, {pad(selDate.getDate())}. {MONTH_DE[selDate.getMonth()].slice(0, 3)}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{working.length} im Dienst · {rows.length - working.length} nicht im Dienst</div>
              </div>

              {teamMode === "people" && rows.map((r) => {
                const meta = r.code ? metaOf(r.code) : null;
                const off = !r.code || r.code === "U";
                return (
                  <div key={r.id} style={{ background: off ? "#EDEFF4" : "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <i style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: meta ? meta.solid : "#C4CAD6" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: r.id === ME ? 700 : 600 }}>{r.name}{r.id === ME ? " (du)" : ""}</div>
                      <div className="tn" style={{ fontSize: 13, color: off ? MUTED : meta.ink }}>{off ? (r.code === "U" ? "Urlaub" : "Frei") : `${meta.label} · ${SHIFTS[r.code].time.replace("-", " – ")}`}</div>
                    </div>
                  </div>
                );
              })}

              {teamMode === "shifts" && Object.keys(SHIFTS).map((k) => {
                const list = rows.filter((r) => r.code === k);
                const open = openShift === k;
                return (
                  <div key={k} style={{ background: "#fff", borderRadius: 16, marginBottom: 8, overflow: "hidden" }}>
                    <button onClick={() => setOpenShift(open ? null : k)} aria-expanded={open}
                      style={{ width: "100%", border: 0, background: "none", textAlign: "left", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", color: INK }}>
                      <i style={{ width: 5, alignSelf: "stretch", minHeight: 38, borderRadius: 3, background: SHIFTS[k].solid }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 650 }}>{SHIFTS[k].label}</div>
                        <div className="tn" style={{ fontSize: 13, color: MUTED }}>{SHIFTS[k].time.replace("-", " – ")}</div>
                      </div>
                      <span style={{ fontSize: 13, color: MUTED }}>{list.length} {list.length === 1 ? "Person" : "Personen"}</span>
                      <ChevronRight size={16} color={MUTED} style={{ transform: open ? "rotate(90deg)" : "none" }} />
                    </button>
                    {open && (
                      <div style={{ padding: "0 14px 12px 31px" }}>
                        {list.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Niemand eingeteilt.</div> : list.map((r) => (
                          <div key={r.id} style={{ fontSize: 14, padding: "4px 0", fontWeight: r.id === ME ? 700 : 400 }}>{r.name}{r.id === ME ? " (du)" : ""}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* ===== REQUESTS ===== */}
        {tab === "requests" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.5, marginBottom: 14 }}>Deine Anträge</div>
            <div style={{ background: "#DDF2E8", borderRadius: 18, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#1F6347" }}>
              <span style={{ fontSize: 15, fontWeight: 650 }}>Resturlaub</span>
              <span className="tn" style={{ fontSize: 30, fontWeight: 800 }}>{vacationLeft}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", background: "#fff", borderRadius: 16, padding: "12px 16px", marginTop: 8, fontSize: 13, color: MUTED }}>
              <span>Anspruch <b className="tn" style={{ color: INK }}>{VACATION_TOTAL}</b></span>
              <span>Beantragt / genehmigt <b className="tn" style={{ color: INK }}>{vacationUsed}</b></span>
            </div>
            <button onClick={() => openSheet("request")} style={{ width: "100%", marginTop: 12, border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "14px 0", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
              <Plus size={18} /> Neuer Antrag
            </button>

            <div style={{ fontSize: 17, fontWeight: 700, margin: "20px 2px 8px" }}>Häufig beantragt</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {REQUEST_TYPES.slice(0, 2).map((t) => (
                <button key={t.key} onClick={() => openSheet("request", t.key)} style={{ border: 0, background: "#fff", borderRadius: 18, padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", color: INK }}>
                  <t.Icon size={26} color={PRIMARY} /><span style={{ fontSize: 14, fontWeight: 650 }}>{t.label}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 17, fontWeight: 700, margin: "20px 2px 8px" }}>Meine Anträge</div>
            {requests.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Noch keine Anträge gestellt.</div>}
            {requests.map((r) => {
              const t = REQUEST_TYPES.find((x) => x.key === r.type);
              return (
                <div key={r.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: "#E7ECF6", display: "grid", placeItems: "center", color: PRIMARY }}><t.Icon size={19} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 650 }}>{t.label}</div>
                    <div className="tn" style={{ fontSize: 12, color: MUTED }}>{r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`}{t.usesVacation ? ` · ${r.days} Tage` : ""}</div>
                    {r.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>}
                  </div>
                  <StatusChip status={r.status} />
                </div>
              );
            })}

            <div style={{ fontSize: 17, fontWeight: 700, margin: "20px 2px 8px" }}>Alle Antragsarten</div>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={16} color={MUTED} style={{ position: "absolute", left: 12, top: 13 }} />
              <input value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} placeholder="Suchen" style={{ width: "100%", boxSizing: "border-box", border: 0, background: "#E7EBF2", borderRadius: 14, padding: "12px 12px 12px 36px", fontSize: 15 }} />
            </div>
            {filteredTypes.map((t) => (
              <button key={t.key} onClick={() => openSheet("request", t.key)} style={{ width: "100%", border: 0, background: "#fff", borderBottom: `1px solid ${PAPER}`, padding: "14px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, cursor: "pointer", color: INK, textAlign: "left" }}>
                {t.label}<ChevronRight size={16} color={MUTED} />
              </button>
            ))}
            {filteredTypes.length === 0 && <div style={{ fontSize: 14, color: MUTED, padding: 8 }}>Keine passende Antragsart.</div>}
            <p style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>Anträge gehen an die Leitung. Genehmigen oder ablehnen kann nur sie.</p>
          </>
        )}

        {/* ===== TIMESHEET ===== */}
        {tab === "time" && (detailDay ? renderDetail() : (
          <>
            <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.5 }}>Dein Gleitzeitkonto</div>
            <div className="tn" style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1.5, margin: "2px 0 14px", color: ledger.balance >= 0 ? INK : "#B3263E" }}>{fmtHM(ledger.balance)}</div>
            {[...ledger.months].reverse().slice(0, 2).map((mm) => {
              const rows = [...mm.days].reverse().filter((x) => x.rec.code && (x.iso <= todayKey || mm.closed === false && x.iso === todayKey));
              return (
                <div key={`${mm.y}-${mm.m}`} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: MUTED }}>{MONTH_DE[mm.m]} {mm.y}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, margin: "4px 0 8px" }}>
                    {mm.closed && <Lock size={14} color={MUTED} />}
                    <span style={{ fontWeight: 650 }}>{mm.closed ? "Monat abgeschlossen" : "Monat läuft"}</span>
                  </div>
                  <div className="tn" style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Gleitzeitstand: {fmtHM(mm.closed ? mm.endBalance : ledger.balance)} Std.</div>
                  {rows.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Noch keine Buchungen.</div>}
                  {rows.map((x) => {
                    const meta = x.rec.code === "U" ? LEAVE : SHIFTS[x.rec.code];
                    const dt = new Date(x.y, x.m, x.d);
                    return (
                      <button key={x.iso} onClick={() => setDetailDay(x.iso)} style={{ width: "100%", border: 0, background: "#fff", borderRadius: 14, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", color: INK }}>
                        <i style={{ width: 5, alignSelf: "stretch", minHeight: 36, borderRadius: 3, background: meta.solid }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 650 }}>{x.iso === todayKey ? "Heute" : `${WEEKDAY_LONG[dt.getDay()]}, ${fmtDate(x.iso)}`}</div>
                          <div className="tn" style={{ fontSize: 12, color: MUTED }}>{x.rec.stamped ? `${hhmm(x.rec.inMin)} – ${hhmm(x.rec.outMin)}` : x.rec.code === "U" ? "Urlaub" : `Geplant · ${SHIFTS[x.rec.code].time.replace("-", " – ")}`}</div>
                        </div>
                        {x.rec.stamped && <span className="tn" style={{ fontSize: 15, fontWeight: 650 }}>{fmtHM(x.rec.worked)}</span>}
                        <ChevronRight size={16} color={MUTED} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        ))}

        {/* ===== WISHES ===== */}
        {tab === "wishes" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.5, marginBottom: 6 }}>Deine Wünsche</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Die Leitung berücksichtigt Wünsche bei der Planung. Eine Zusage gibt es nicht automatisch.</div>
            <button onClick={() => openSheet("wish", "free")} style={wishCard}>
              <Coffee size={34} color={PRIMARY} /><span style={{ fontSize: 17, fontWeight: 650 }}>Ich möchte frei</span>
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: MUTED, margin: "10px 0" }}>oder</div>
            <button onClick={() => openSheet("wish", "work")} style={wishCard}>
              <Briefcase size={34} color={PRIMARY} /><span style={{ fontSize: 17, fontWeight: 650 }}>Ich möchte arbeiten</span>
            </button>
            <div style={{ fontSize: 17, fontWeight: 700, margin: "22px 2px 8px" }}>Meine Wünsche</div>
            {wishes.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Noch keine Wünsche eingereicht.</div>}
            {wishes.map((w) => (
              <div key={w.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "#E7ECF6", display: "grid", placeItems: "center", color: PRIMARY }}>{w.type === "free" ? <Coffee size={19} /> : <Briefcase size={19} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 650 }}>{w.type === "free" ? "Frei" : `Arbeiten${w.shift ? " · " + SHIFTS[w.shift].label : ""}`}</div>
                  <div className="tn" style={{ fontSize: 12, color: MUTED }}>{w.from === w.to ? fmtDate(w.from) : `${fmtDate(w.from)} – ${fmtDate(w.to)}`}</div>
                  {w.note && <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.note}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 650, background: "#E7ECF6", color: PRIMARY, borderRadius: 999, padding: "3px 9px" }}>Eingereicht</span>
              </div>
            ))}
          </>
        )}

        <p style={{ fontSize: 11, color: MUTED, textAlign: "center", marginTop: 22 }}>Vorschau mit Beispieldaten. Dein Plan ist nur lesbar; Änderungen macht die Leitung.</p>
      </div>

      {/* ===== bottom sheet: request / wish form ===== */}
      {sheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,28,45,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={() => setSheet(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 440, borderRadius: "24px 24px 0 0", padding: "18px 18px calc(22px + env(safe-area-inset-bottom, 0px))", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{sheet.kind === "request" ? "Neuer Antrag" : "Neuer Wunsch"}</div>
              <button aria-label="Schließen" onClick={() => setSheet(null)} style={navBtnSm}><X size={16} /></button>
            </div>
            <label style={lbl}>Art
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={fld}>
                {sheet.kind === "request"
                  ? REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)
                  : [<option key="free" value="free">Ich möchte frei</option>, <option key="work" value="work">Ich möchte arbeiten</option>]}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={lbl}>Von<input type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} style={fld} /></label>
              <label style={lbl}>Bis<input type="date" value={form.to} min={form.from} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} style={fld} /></label>
            </div>
            {sheet.kind === "wish" && form.type === "work" && (
              <label style={lbl}>Gewünschte Schicht (optional)
                <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))} style={fld}>
                  <option value="">Egal</option>
                  {Object.keys(SHIFTS).map((k) => <option key={k} value={k}>{SHIFTS[k].label}</option>)}
                </select>
              </label>
            )}
            {sheet.kind === "request" && REQUEST_TYPES.find((t) => t.key === form.type)?.usesVacation && form.to >= form.from && (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>Benötigt {planDaysBetween(form.from, form.to)} Urlaubstage (geplante Diensttage). Es bleiben {vacationLeft}.</div>
            )}
            <label style={lbl}>Anmerkung (optional)
              <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} style={{ ...fld, resize: "none", fontFamily: "inherit" }} />
            </label>
            {formError && <div role="alert" style={{ fontSize: 13, color: "#B3263E", background: "#FCE5EA", borderRadius: 12, padding: "9px 12px", marginBottom: 10 }}>{formError}</div>}
            <button onClick={submitForm} style={{ width: "100%", border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "14px 0", cursor: "pointer" }}>
              {sheet.kind === "request" ? "Antrag senden" : "Wunsch senden"}
            </button>
          </div>
        </div>
      )}

      {/* ===== bottom navigation ===== */}
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #E1E5EC", paddingBottom: "env(safe-area-inset-bottom, 0px)", zIndex: 10 }}>
        <div style={{ maxWidth: 440, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setDetailDay(null); }} aria-current={tab === k ? "page" : undefined}
              style={{ background: "none", border: 0, padding: "10px 0 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === k ? PRIMARY : "#8A93A5", fontWeight: tab === k ? 700 : 500, cursor: "pointer" }}>
              <Icon size={21} />
              <span style={{ fontSize: 11 }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

const navBtn = { width: 34, height: 34, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fff", display: "grid", placeItems: "center", color: INK, cursor: "pointer", padding: 0 };
const navBtnSm = { width: 30, height: 30, borderRadius: 10, border: `1px solid ${LINE}`, background: "#fff", display: "grid", placeItems: "center", color: INK, cursor: "pointer", padding: 0 };
const wishCard = { width: "100%", border: 0, background: "#fff", borderRadius: 22, padding: "34px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, cursor: "pointer", color: INK };
const lbl = { display: "block", fontSize: 12, color: MUTED, marginBottom: 12 };
const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px 12px", fontSize: 15, background: "#fff", color: INK };

export default function EmployeeShiftView() {
  return (
    <ErrorBoundary>
      <EmployeeAppInner />
    </ErrorBoundary>
  );
}
