"use client";

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { OrgContext } from "../lib/orgContext";
import { PALETTE, makeCodes, netHours, hhmm } from "../lib/shiftStyle";
import { fetchAll } from "../lib/fetchAll";
import { computeChanges } from "../lib/planDiff";

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const PAPER = "#F4F6F9";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const KIND_LABEL = { cover: "Einspringen", extra: "Zusatzschicht", cancelled: "Entfällt" };
const WD_LONG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const EVENT_LABEL = { submitted: "Zur Freigabe eingereicht", rejected: "Zurückgewiesen", published: "Veröffentlicht" };
const STATUS = {
  draft: { t: "Entwurf", bg: "#EEF0F4", fg: "#4A5368" },
  pending: { t: "Wartet auf Freigabe", bg: "#FFF1D2", fg: "#7A4E00" },
  published: { t: "Veröffentlicht", bg: "#DDF2E8", fg: "#1F6347" },
};

const card = { background: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 };
const btn = { border: 0, borderRadius: 12, background: PRIMARY, color: "#fff", fontSize: 14, fontWeight: 650, padding: "10px 14px", cursor: "pointer" };
const btnGhost = { border: `1px solid ${LINE}`, borderRadius: 12, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "9px 12px", cursor: "pointer" };
const btnDanger = { ...btnGhost, color: "#B3263E", borderColor: "#F0C4CD" };

const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return iso; } };
const fmtDate = (iso) => { const [y, m, d] = String(iso).split("-"); return `${d}.${m}.${y}`; };
const keyOf = (y, m) => `${y}-${m}`;
function friendly(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/Could not find the function|schema cache|does not exist|relation .* does not exist/i.test(msg)) {
    return "Die Datenbank ist noch nicht auf Freigabe und Archiv umgestellt. Bitte zuerst approval-archive-schema.sql im SQL Editor ausführen.";
  }
  return msg;
}

// Read-only table: one row per person, one column per day, plus paid hours
function PlanGrid({ defs, shifts, year, month, marks = {}, extraNames = {} }) {
  const total = new Date(year, month, 0).getDate();
  const codes = useMemo(() => makeCodes(defs), [defs]);
  const defByKey = useMemo(() => { const m = {}; defs.forEach((d) => { m[d.key] = d; }); return m; }, [defs]);
  const styleOf = (key) => { const i = Math.max(0, defs.findIndex((d) => d.key === key)); return PALETTE[i % PALETTE.length]; };
  const people = useMemo(() => {
    const m = new Map();
    shifts.forEach((s) => { if (!m.has(s.staff_id)) m.set(s.staff_id, { id: s.staff_id, name: s.name || "Unbekannt", cells: {}, hours: 0 }); });
    // people whose shift was removed still get a row, so the removal is visible
    Object.keys(marks).forEach((mk) => { const id = mk.split("|")[0]; if (!m.has(id)) m.set(id, { id, name: extraNames[id] || "Unbekannt", cells: {}, hours: 0 }); });
    shifts.forEach((s) => {
      const p = m.get(s.staff_id); const day = Number(String(s.date).slice(8, 10));
      (p.cells[day] = p.cells[day] || []).push(s.key);
      if (defByKey[s.key]) p.hours += netHours(defByKey[s.key]);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [shifts, defByKey, marks, extraNames]);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  if (!people.length) return <div style={{ fontSize: 14, color: MUTED }}>In dieser Fassung gibt es keine Schichten.</div>;
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, background: "#fff", textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}`, minWidth: 110 }}>Person</th>
            {days.map((d) => {
              const wd = new Date(year, month - 1, d).getDay(); const we = wd === 0 || wd === 6;
              return <th key={d} style={{ padding: "4px 2px", borderBottom: `1px solid ${LINE}`, background: we ? "#F1F3F8" : "#fff", minWidth: 26, fontWeight: 600 }}><div style={{ color: MUTED, fontSize: 10 }}>{WD[wd]}</div>{d}</th>;
            })}
            <th style={{ padding: "4px 8px", borderBottom: `1px solid ${LINE}`, textAlign: "right" }}>Std.</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td style={{ position: "sticky", left: 0, background: "#fff", padding: "5px 8px", borderBottom: `1px solid #EEF0F4`, fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</td>
              {days.map((d) => {
                const ks = p.cells[d] || [];
                const st = ks.length ? styleOf(ks[0]) : null;
                const mk = marks[`${p.id}|${d}`];
                return (
                  <td key={d} title={mk === "removed" ? "Schicht entfällt" : mk === "added" ? "Geändert" : ks.map((k) => (defByKey[k] ? defByKey[k].label : k)).join(", ")}
                    style={{ padding: 2, borderBottom: `1px solid #EEF0F4`, textAlign: "center" }}>
                    {st && <div style={{ background: st.soft, color: st.ink, borderRadius: 6, fontWeight: 700, padding: "3px 0", outline: mk === "added" ? "2px solid #F59E0B" : "none" }}>{ks.map((k) => codes[k] || "?").join("+")}</div>}
                    {!st && mk === "removed" && <div style={{ border: "2px dashed #F59E0B", color: "#B45309", borderRadius: 6, fontWeight: 700, padding: "1px 0" }}>✕</div>}
                  </td>
                );
              })}
              <td style={{ padding: "5px 8px", borderBottom: `1px solid #EEF0F4`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.hours.toFixed(1).replace(".", ",")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "10px 10px", fontSize: 11, color: MUTED }}>
        {defs.map((d) => <span key={d.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: styleOf(d.key).solid, display: "inline-block" }} />{codes[d.key]} {d.label} {hhmm(d.start_time ?? d.start)}–{hhmm(d.end_time ?? d.end)}</span>)}
      </div>
    </div>
  );
}

export default function ScheduleReview() {
  const org = useContext(OrgContext);
  const sb = org.supabase;
  const isOwner = org.role === "owner";
  const [requireApproval, setRequireApproval] = useState(org.requireApproval !== false);
  const [retention, setRetention] = useState(org.retentionYears || 6);
  const [months, setMonths] = useState(null);
  const [sel, setSel] = useState(null);
  const [source, setSource] = useState("auto");
  const [defs, setDefs] = useState([]);
  const [staffNames, setStaffNames] = useState({});
  const [rowsByStatus, setRowsByStatus] = useState({});
  const [versions, setVersions] = useState([]);
  const [expired, setExpired] = useState(0);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [changesAll, setChangesAll] = useState([]);
  const [period, setPeriod] = useState("year");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const loadBase = useCallback(async () => {
    try {
      const m = await sb.from("schedule_months").select("year, month, status, has_newer_draft, submitted_at, published_at, review_note, change_note").eq("org_id", org.orgId);
      if (m.error) throw m.error;
      const sorted = [...m.data].sort((a, b) => b.year - a.year || b.month - a.month);
      setMonths(sorted);
      setSel((cur) => { if (cur) return cur; const pick = sorted.find((x) => x.status === "pending") || sorted[0]; return pick ? { year: pick.year, month: pick.month } : null; });
      const d = await sb.from("shift_definitions").select("key, label, start_time, end_time, sort_order, active").eq("org_id", org.orgId);
      if (d.error) throw d.error;
      setDefs([...d.data].sort((a, b) => a.sort_order - b.sort_order));
      const st = await sb.from("staff").select("id, name").eq("org_id", org.orgId);
      if (st.error) throw st.error;
      const names = {}; st.data.forEach((x) => { names[x.id] = x.name; }); setStaffNames(names);
      try {
        setChangesAll(await fetchAll(() => sb.from("shift_changes").select("id, change_date, shift_key, kind, staff_id, replaced_staff_id, note, published_at, manager_status, manager_note").eq("org_id", org.orgId)));
      } catch (e) { setChangesAll([]); } // table is created by changes-schema.sql
      const v = await sb.from("schedule_versions").select("id, keep_until").eq("org_id", org.orgId);
      if (!v.error) { const today = new Date().toISOString().slice(0, 10); setExpired(v.data.filter((x) => x.keep_until < today).length); }
    } catch (e) { setErr(friendly(e)); setMonths([]); }
  }, [sb, org.orgId]);
  useEffect(() => { loadBase(); }, [loadBase, version]);

  // plans + history of the selected month
  useEffect(() => {
    if (!sel) { setRowsByStatus({}); setVersions([]); return; }
    let alive = true;
    (async () => {
      try {
        const from = `${sel.year}-${String(sel.month).padStart(2, "0")}-01`;
        const nx = new Date(sel.year, sel.month, 1); const to = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}-01`;
        const out = {};
        for (const status of ["draft", "published"]) {
          out[status] = await fetchAll(() => sb.from("scheduled_shifts").select("staff_id, shift_date, shift_key").eq("org_id", org.orgId).eq("status", status).gte("shift_date", from).lt("shift_date", to));
        }
        const v = await sb.from("schedule_versions").select("id, event, actor_email, note, keep_until, created_at, snapshot").eq("org_id", org.orgId).eq("year", sel.year).eq("month", sel.month);
        if (v.error) throw v.error;
        if (!alive) return;
        setRowsByStatus(out); setVersions([...v.data].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
      } catch (e) { if (alive) setErr(friendly(e)); }
    })();
    return () => { alive = false; };
  }, [sb, org.orgId, sel, version]);

  const monthRow = months && sel ? months.find((m) => m.year === sel.year && m.month === sel.month) : null;
  const status = monthRow ? monthRow.status : null;
  const effective = source === "auto" ? (status === "published" ? "published" : "draft") : source;

  // what the grid shows: live drafts, live published rows, or an archived snapshot
  const view = useMemo(() => {
    if (String(effective).startsWith("v:")) {
      const v = versions.find((x) => x.id === effective.slice(2));
      if (!v) return { defs: [], shifts: [] };
      return { defs: (v.snapshot.defs || []).map((d) => ({ ...d, start_time: d.start, end_time: d.end })), shifts: (v.snapshot.shifts || []).map((s) => ({ staff_id: s.staff_id, name: s.name, date: s.date, key: s.key })) };
    }
    const rows = rowsByStatus[effective] || [];
    return { defs: defs.filter((d) => d.active !== false), shifts: rows.map((r) => ({ staff_id: r.staff_id, name: staffNames[r.staff_id], date: r.shift_date, key: r.shift_key })) };
  }, [effective, versions, rowsByStatus, defs, staffNames]);

  // what differs between the version being reviewed and what the employees currently see
  const preview = useMemo(() => {
    const pub = rowsByStatus.published || [], dr = rowsByStatus.draft || [];
    if (!monthRow || !pub.length || !dr.length) return [];
    if (monthRow.status === "published" && !monthRow.has_newer_draft) return [];
    return computeChanges(pub, dr);
  }, [rowsByStatus, monthRow]);
  const marks = useMemo(() => {
    const m = {};
    preview.forEach((c) => {
      const day = Number(c.date.slice(8, 10));
      if (c.kind === "cover") { m[`${c.staffId}|${day}`] = "added"; m[`${c.replacedId}|${day}`] = m[`${c.replacedId}|${day}`] || "removed"; }
      else if (c.kind === "extra") m[`${c.staffId}|${day}`] = "added";
      else m[`${c.staffId}|${day}`] = m[`${c.staffId}|${day}`] || "removed";
    });
    return m;
  }, [preview]);
  const labelOfKey = (k) => { const d = defs.find((x) => x.key === k); return d ? d.label : k; };
  const nameOf = (id) => staffNames[id] || "Unbekannt";
  const dayText = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${WD_LONG[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.`; };
  const changeText = (c) => {
    const who = nameOf(c.staffId || c.staff_id); const other = nameOf(c.replacedId || c.replaced_staff_id);
    return c.kind === "cover" ? `${who} übernimmt für ${other}` : c.kind === "extra" ? `${who}: zusätzliche Schicht` : `${who}: Schicht entfällt`;
  };

  // Einspringen overview for the Leitung
  const jumpsInPeriod = useMemo(() => {
    const now = new Date(); const y0 = now.getFullYear(); const cut12 = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    return changesAll.filter((c) => period === "all" || (period === "year" ? c.change_date.slice(0, 4) === String(y0) : c.change_date >= cut12));
  }, [changesAll, period]);
  const ranking = useMemo(() => {
    const m = new Map();
    jumpsInPeriod.filter((c) => c.kind !== "cancelled").forEach((c) => {
      const r = m.get(c.staff_id) || { id: c.staff_id, count: 0, open: 0, last: "" };
      r.count++; if (c.manager_status === "open") r.open++; if (c.change_date > r.last) r.last = c.change_date; m.set(c.staff_id, r);
    });
    return [...m.values()].sort((a, b) => b.count - a.count || b.open - a.open);
  }, [jumpsInPeriod]);
  const shownChanges = useMemo(() => [...jumpsInPeriod].filter((c) => !onlyOpen || (c.manager_status === "open" && c.kind !== "cancelled")).sort((a, b) => b.change_date.localeCompare(a.change_date)), [jumpsInPeriod, onlyOpen]);
  async function setStatus(c, status) {
    const note = status === "done" ? window.prompt("Notiz zur Entscheidung (optional), z. B. „Prämie zugesagt“", c.manager_note || "") : null;
    if (status === "done" && note === null) return;
    setBusy(true); setErr("");
    const r = await sb.rpc("set_change_status", { p_id: c.id, p_status: status, p_note: note });
    setBusy(false);
    if (r.error) { setErr(friendly(r.error)); return; }
    setVersion((v) => v + 1);
  }

  async function call(name, args, okText) {
    setBusy(true); setMsg(""); setErr("");
    const r = await sb.rpc(name, args);
    setBusy(false);
    if (r.error) { setErr(friendly(r.error)); return false; }
    setMsg(okText); setSource("auto"); setNote(""); setVersion((v) => v + 1); return true;
  }
  const rpcArgs = { p_org: org.orgId, p_year: sel && sel.year, p_month: sel && sel.month };

  async function saveSettings() {
    const ok = await call("set_org_settings", { p_org: org.orgId, p_require_approval: requireApproval, p_retention_years: Number(retention) }, "Einstellungen gespeichert. Sie gelten ab sofort (in den Dienstplanern nach dem nächsten Laden der Seite).");
    return ok;
  }
  async function purge() {
    if (!window.confirm(`${expired} abgelaufene Archiv-Einträge und die zugehörigen alten Pläne endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setBusy(true); setMsg(""); setErr("");
    const r = await sb.rpc("purge_expired_versions", { p_org: org.orgId });
    setBusy(false);
    if (r.error) { setErr(friendly(r.error)); return; }
    setMsg(`${r.data} Einträge gelöscht.`); setVersion((v) => v + 1);
  }

  return (
    <div dir="ltr" style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: MUTED }}>{org.orgName} · {isOwner ? "Inhaber" : "Leitung"}</div>
            <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: -0.4, margin: 0 }}>Freigaben &amp; Archiv</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/" style={{ ...btnGhost, textDecoration: "none" }}>Zum Dienstplaner</a>
            <button onClick={() => sb.auth.signOut()} style={btnGhost}>Abmelden</button>
          </div>
        </div>

        {err && <div role="alert" style={{ ...card, background: "#FCE5EA", color: "#8A2A3E", fontSize: 14 }}>{err}</div>}
        {msg && <div style={{ ...card, background: "#DDF2E8", color: "#1F6347", fontSize: 14 }}>{msg}</div>}

        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 8 }}>Monate</div>
          {months === null && <div style={{ color: MUTED }}>Lädt …</div>}
          {months && months.length === 0 && <div style={{ fontSize: 14, color: MUTED }}>Noch kein Monat gespeichert. Im Dienstplaner einen Plan erstellen und „Entwurf speichern“ drücken.</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {months && months.map((m) => {
              const st = STATUS[m.status] || STATUS.draft; const active = sel && keyOf(sel.year, sel.month) === keyOf(m.year, m.month);
              return (
                <button key={keyOf(m.year, m.month)} onClick={() => { setSel({ year: m.year, month: m.month }); setSource("auto"); setMsg(""); setErr(""); }}
                  style={{ border: active ? `2px solid ${PRIMARY}` : `1px solid ${LINE}`, background: "#fff", borderRadius: 14, padding: "8px 12px", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{MONTHS[m.month - 1]} {m.year}</div>
                  <div style={{ fontSize: 11, fontWeight: 650, background: st.bg, color: st.fg, borderRadius: 999, padding: "2px 8px", marginTop: 4, display: "inline-block" }}>{st.t}{m.has_newer_draft ? " · neuer Entwurf" : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        {sel && monthRow && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{MONTHS[sel.month - 1]} {sel.year}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["auto", "Aktuell"], ["draft", "Entwurf"], ["published", "Veröffentlicht"]].map(([k, l]) => (
                  <button key={k} onClick={() => setSource(k)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, background: source === k ? "#E7ECF6" : "#fff", color: source === k ? PRIMARY : INK }}>{l}</button>
                ))}
              </div>
            </div>
            {String(effective).startsWith("v:") && <div style={{ fontSize: 12, color: "#7A4E00", background: "#FFF1D2", borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>Archivierte Fassung (nur Ansicht). Zurück mit „Aktuell“.</div>}
            <PlanGrid defs={view.defs} shifts={view.shifts} year={sel.year} month={sel.month} marks={effective === "draft" || effective === "auto" ? marks : {}} extraNames={staffNames} />
            {preview.length > 0 && (effective === "draft") && (
              <div style={{ marginTop: 10, background: "#FFF8E6", border: "1px solid #F5D78A", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: "#7A4E00", marginBottom: 4 }}>Änderungen gegenüber der veröffentlichten Fassung ({preview.length})</div>
                {preview.map((c, i) => <div key={i} style={{ fontSize: 13 }}>{dayText(c.date)} · {labelOfKey(c.key)}: {changeText(c)}</div>)}
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Im Plan oben sind die geänderten Felder markiert. Nach der Freigabe werden diese Änderungen in der Übersicht „Einspringen & Änderungen“ festgehalten.</div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              {monthRow.review_note && status === "draft" && <div style={{ fontSize: 13, color: "#B3263E", background: "#FCE5EA", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>Zuletzt zurückgewiesen: {monthRow.review_note}</div>}
              {status === "pending" && isOwner && (
                <div>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>Dieser Plan wartet auf deine Freigabe{monthRow.submitted_at ? ` (eingereicht ${fmtDateTime(monthRow.submitted_at)})` : ""}. Die Mitarbeitenden sehen ihn erst nach „Freigeben“.</div>
                  {monthRow.change_note && <div style={{ fontSize: 14, background: "#FFF1D2", color: "#7A4E00", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}><b>Änderungsgrund:</b> {monthRow.change_note}</div>}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Grund für eine Zurückweisung (optional)" rows={2}
                    style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 12, padding: 10, fontSize: 14, marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={busy} style={btn} onClick={() => call("publish_month", rpcArgs, "Plan freigegeben und veröffentlicht.")}>Freigeben</button>
                    <button disabled={busy} style={btnDanger} onClick={() => call("reject_month", { ...rpcArgs, p_note: note }, "Plan zurückgewiesen. Die Leitung sieht den Grund im Dienstplaner.")}>Zurückweisen</button>
                  </div>
                </div>
              )}
              {status === "pending" && !isOwner && <div style={{ fontSize: 14, color: MUTED }}>Wartet auf Freigabe durch die Inhaber.</div>}
              {status === "draft" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {isOwner || !requireApproval
                    ? <button disabled={busy} style={btn} onClick={() => call("publish_month", rpcArgs, "Plan veröffentlicht.")}>Veröffentlichen</button>
                    : <button disabled={busy} style={btn} onClick={() => call("submit_month", rpcArgs, "Zur Freigabe eingereicht.")}>Zur Freigabe einreichen</button>}
                  <span style={{ fontSize: 12, color: MUTED }}>Der Entwurf ist für Mitarbeitende noch nicht sichtbar.</span>
                </div>
              )}
              {status === "published" && <div style={{ fontSize: 14, color: "#1F6347" }}>Veröffentlicht{monthRow.published_at ? ` am ${fmtDateTime(monthRow.published_at)}` : ""}.{monthRow.has_newer_draft ? " Es gibt einen neueren Entwurf, den die Mitarbeitenden noch nicht sehen." : ""}</div>}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>Verlauf (unveränderlich archiviert)</div>
              {versions.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Noch keine archivierten Fassungen. Beim Einreichen und Veröffentlichen wird jeweils eine Kopie gespeichert.</div>}
              {versions.map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #EEF0F4", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13 }}>
                    <b>{EVENT_LABEL[v.event] || v.event}</b> · {fmtDateTime(v.created_at)}{v.actor_email ? ` · ${v.actor_email}` : ""}
                    {v.note && <div style={{ color: MUTED }}>Grund: {v.note}</div>}
                    <div style={{ color: MUTED, fontSize: 11 }}>Aufbewahren bis {fmtDate(v.keep_until)}</div>
                  </div>
                  <button style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setSource("v:" + v.id)}>Ansehen</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div id="einspringer" style={card}>
          <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>Einspringen &amp; Änderungen</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>Wer bei einer Änderung eine Schicht übernimmt oder zusätzlich bekommt, wird hier festgehalten, damit es der Leitung auffällt. Das ist nur eine Übersicht für deine Entscheidung (z. B. Anerkennung). Es wird nichts automatisch ausgezahlt oder geändert.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "6px 8px", fontSize: 13 }}>
              <option value="year">Dieses Jahr</option><option value="12m">Letzte 12 Monate</option><option value="all">Alles</option>
            </select>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />nur offene</label>
          </div>
          {ranking.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Noch kein Einspringen im gewählten Zeitraum.</div>}
          {ranking.length > 0 && (
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%", marginBottom: 12 }}>
              <thead><tr style={{ textAlign: "left", color: MUTED }}><th style={{ padding: "4px 6px" }}>Person</th><th style={{ padding: "4px 6px" }}>Einspringen</th><th style={{ padding: "4px 6px" }}>offen</th><th style={{ padding: "4px 6px" }}>zuletzt</th></tr></thead>
              <tbody>{ranking.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #EEF0F4" }}>
                  <td style={{ padding: "6px", fontWeight: 650 }}>{nameOf(r.id)}</td>
                  <td style={{ padding: "6px" }}>{r.count}×</td>
                  <td style={{ padding: "6px" }}>{r.open > 0 ? <span style={{ background: "#FFF1D2", color: "#7A4E00", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 650 }}>{r.open} offen</span> : <span style={{ color: "#1F6347" }}>erledigt</span>}</td>
                  <td style={{ padding: "6px", color: MUTED }}>{fmtDate(r.last)}</td>
                </tr>))}</tbody>
            </table>
          )}
          {shownChanges.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #EEF0F4", flexWrap: "wrap", opacity: c.kind === "cancelled" ? 0.75 : 1 }}>
              <div style={{ fontSize: 13 }}>
                <b>{dayText(c.change_date)}</b> · {labelOfKey(c.shift_key)} · <span style={{ color: c.kind === "cancelled" ? MUTED : "#7A4E00", fontWeight: 650 }}>{KIND_LABEL[c.kind]}</span>
                <div>{changeText(c)}</div>
                {c.note && <div style={{ color: MUTED }}>Grund: {c.note}</div>}
                {c.manager_note && <div style={{ color: "#1F6347" }}>Vermerk: {c.manager_note}</div>}
              </div>
              {c.kind !== "cancelled" && (c.manager_status === "open"
                ? <button disabled={busy} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setStatus(c, "done")}>Berücksichtigt</button>
                : <button disabled={busy} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, color: "#1F6347" }} onClick={() => setStatus(c, "open")}>✓ berücksichtigt · wieder öffnen</button>)}
            </div>
          ))}
        </div>

        {isOwner && (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 10 }}>Einstellungen der Firma</div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 12 }}>
              <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Die Leitung muss Pläne zur Freigabe einreichen, nur die Inhaber veröffentlichen<br /><span style={{ fontSize: 12, color: MUTED }}>Ausgeschaltet können alle in der Leitung selbst veröffentlichen.</span></span>
            </label>
            <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Pläne archivieren für
              <select value={retention} onChange={(e) => setRetention(e.target.value)} style={{ marginLeft: 8, border: `1px solid ${LINE}`, borderRadius: 10, padding: "6px 8px", fontSize: 14 }}>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => <option key={y} value={y}>{y} Jahre</option>)}
              </select>
            </label>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>Gerechnet bis 31. Dezember des Jahres, in dem die Frist abläuft. Gesetzliches Minimum für Arbeitszeitnachweise sind 2 Jahre (§ 16 ArbZG). Für lohnrelevante Unterlagen gelten 6 Jahre (§ 41 EStG). Empfohlen: 6 Jahre. Lass dich im Zweifel von deiner Steuerberatung beraten.</div>
            <button disabled={busy} style={btn} onClick={saveSettings}>Einstellungen speichern</button>

            <div style={{ borderTop: "1px solid #EEF0F4", marginTop: 16, paddingTop: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 650 }}>Abgelaufene Einträge</div>
              <div style={{ fontSize: 13, color: MUTED, margin: "4px 0 8px" }}>Es wird nichts automatisch gelöscht. Nach Ablauf der Frist solltest du Daten nicht ewig behalten (Datenschutz).</div>
              {expired > 0
                ? <button disabled={busy} style={btnDanger} onClick={purge}>{expired} abgelaufene Einträge löschen</button>
                : <span style={{ fontSize: 13, color: "#1F6347" }}>Keine abgelaufenen Einträge.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
