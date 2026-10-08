"use client";

import React, { useContext, useEffect, useState } from "react";
import { OrgContext } from "../lib/orgContext";
import { fetchAll } from "../lib/fetchAll";
import WishesDialog from "./WishesDialog";

const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", planner: "Schichtplaner", employee: "Mitarbeitende" };
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_NAME = /^Mitarbeiter \d+$/;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// Slim bar at the top of a planner: which company you work for, and the two buttons that keep the
// planner's list of people and the company's real list of people (in the database) in sync.
//   onLoadStaff(rows)   replace the planner list with the rows from the database
//   staffList, toDb(s)  the planner's current people and how one becomes a database row
//   onIdsChanged(map)   tell the planner that local ids were replaced by database ids
export default function OrgBar({ onLoadStaff, staffList, toDb, onIdsChanged, year, monthIdx, onLoadPlan, hasPlan, onImportWishes }) {
  const org = useContext(OrgContext);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [row, setRow] = useState(null);
  const [bump, setBump] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editMonth, setEditMonth] = useState(1);
  const [editYear, setEditYear] = useState(2026);
  const [saved, setSaved] = useState([]); // months that already have a saved plan
  const [versionId, setVersionId] = useState("current"); // "current" = newest state, otherwise an archived published version
  const [versions, setVersions] = useState([]);
  const [openJumps, setOpenJumps] = useState(0); // Einspringer entries the Leitung has not looked at yet
  const [wishesOpen, setWishesOpen] = useState(false); // popup "Wünsche"
  const [openWishes, setOpenWishes] = useState(0);     // wishes sent by employees, not decided yet
  const [wishBump, setWishBump] = useState(0);
  useEffect(() => {
    if (!org) return undefined;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("wishes").select("id").eq("org_id", org.orgId).eq("status", "submitted");
      if (alive) setOpenWishes(!r.error && r.data ? r.data.length : 0); // before script 11 the column is missing: show 0
    })();
    return () => { alive = false; };
  }, [org, wishBump]);

  // status of the month shown in the planner (and the reason, if the Leitung rejected it)
  useEffect(() => {
    if (!org || year === undefined) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("schedule_months").select("status, has_newer_draft, review_note").eq("org_id", org.orgId).eq("year", year).eq("month", monthIdx + 1);
      if (alive) setRow(!r.error && r.data && r.data[0] ? r.data[0] : null);
    })();
    return () => { alive = false; };
  }, [org, year, monthIdx, bump]);
  useEffect(() => {
    if (!org) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("shift_changes").select("id, kind, manager_status").eq("org_id", org.orgId).eq("manager_status", "open");
      if (alive && !r.error) setOpenJumps(r.data.filter((x) => x.kind !== "cancelled").length);
    })();
    return () => { alive = false; };
  }, [org, bump]);
  useEffect(() => {
    const h = () => setBump((n) => n + 1);
    window.addEventListener("schedule-status-changed", h);
    return () => window.removeEventListener("schedule-status-changed", h);
  }, []);

  useEffect(() => {
    if (!org || !editOpen) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("schedule_months").select("year, month, status").eq("org_id", org.orgId);
      if (alive && !r.error) setSaved([...r.data].sort((a, b) => b.year - a.year || b.month - a.month));
    })();
    return () => { alive = false; };
  }, [org, editOpen, bump]);

  // earlier published versions of the chosen month (for going back after a mistake)
  useEffect(() => {
    if (!org || !editOpen) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("schedule_versions").select("id, event, actor_email, note, created_at").eq("org_id", org.orgId).eq("year", Number(editYear)).eq("month", Number(editMonth)).eq("event", "published");
      if (alive) { setVersions(!r.error ? [...r.data].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : []); setVersionId("current"); }
    })();
    return () => { alive = false; };
  }, [org, editOpen, editYear, editMonth, bump]);

  if (!org) return null;
  const sb = org.supabase;

  function openEdit() {
    setEditMonth((year !== undefined ? monthIdx : new Date().getMonth()) + 1);
    setEditYear(year !== undefined ? year : new Date().getFullYear());
    setEditOpen((o) => !o);
  }
  const STATUS_TXT = { draft: "Entwurf", pending: "wartet auf Freigabe", published: "veröffentlicht" };
  const yearOptions = [...new Set([...saved.map((x) => x.year), new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1])].sort();

  // Reopen a saved month (the newest draft, otherwise the published version) in the editor
  async function loadPlan() {
    const y = Number(editYear), m = Number(editMonth);
    if (hasPlan && !window.confirm("Der Plan im Editor wird durch den gespeicherten Plan ersetzt. Nicht gespeicherte Änderungen gehen verloren. Fortfahren?")) return;
    setBusy("plan"); setMsg("");
    try {
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const nx = new Date(y, m, 1); const to = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}-01`;
      const mrow = await sb.from("schedule_months").select("status, holidays, has_newer_draft").eq("org_id", org.orgId).eq("year", y).eq("month", m);
      if (mrow.error) throw mrow.error;
      const q = (status) => fetchAll(() => sb.from("scheduled_shifts").select("staff_id, shift_date, shift_key").eq("org_id", org.orgId).eq("status", status).gte("shift_date", from).lt("shift_date", to));
      // a published month with no newer draft is loaded from the published rows; otherwise the newest draft wins
      const info = mrow.data[0] || {};
      let source, rows;
      if (versionId !== "current") {
        // an archived published version, e.g. the one from before a mistake
        const v = await sb.from("schedule_versions").select("snapshot, created_at").eq("id", versionId);
        if (v.error) throw v.error;
        if (!v.data[0]) { setMsg("Diese Fassung wurde nicht gefunden."); setBusy(""); return; }
        source = "version";
        rows = (v.data[0].snapshot.shifts || []).map((x) => ({ staff_id: x.staff_id, shift_date: x.date, shift_key: x.key }));
      } else {
        const first = info.status === "published" && !info.has_newer_draft ? "published" : "draft";
        source = first; rows = await q(first);
        if (!rows.length) { source = first === "draft" ? "published" : "draft"; rows = await q(source); }
      }
      if (!rows.length) { setMsg(`Für ${MONTHS[m - 1]} ${y} ist kein gespeicherter Plan vorhanden.`); setBusy(""); return; }
      const d = source === "version" ? { data: [], error: null } : await sb.from("shift_definitions").select("key, label, start_time, end_time, frequency, quota_per_month, prefer_team_lead, requires_rest_after, sort_order").eq("org_id", org.orgId).eq("active", true);
      if (d.error) throw d.error;
      const st = await sb.from("staff").select("id, name, email, weekly_hours, employment_type, night_exempt, weekend_exempt, is_team_lead, active").eq("org_id", org.orgId).order("name");
      if (st.error) throw st.error;
      // what the employees currently see, to mark every manual change in the editor
      // (an archived version is compared with what is published right now, so going back shows every difference)
      const baselineRows = source === "published" ? rows : (info.status === "published" ? await q("published") : []);
      const used = new Set([...rows, ...baselineRows].map((r) => r.staff_id));
      const staffRows = st.data.filter((s) => s.active !== false || used.has(s.id));
      const res = onLoadPlan({
        year: y, month: m, rows, baselineRows, holidays: (mrow.data[0] && mrow.data[0].holidays) || [],
        defs: [...d.data].sort((a, b) => a.sort_order - b.sort_order), staffRows,
      });
      if (res && res.ok) {
        const what = source === "version" ? "frühere veröffentlichte Fassung; Unterschiede zur jetzt gültigen sind markiert" : source === "published" ? "veröffentlichte Fassung" : info.status === "pending" ? "Entwurf, der auf Freigabe wartet" : info.status === "published" ? "neuerer, noch nicht veröffentlichter Entwurf" : "gespeicherter Entwurf";
        setMsg(`${MONTHS[m - 1]} ${y} geladen (${what}). Schichten in der Tabelle ändern, dann „Entwurf speichern“ oder „Zur Freigabe einreichen“. Mitarbeitende sehen Änderungen erst nach Veröffentlichung.`);
        setEditOpen(false);
      } else setMsg((res && res.message) || "Der Plan konnte nicht geladen werden.");
    } catch (e) {
      const t = e && e.message ? e.message : String(e);
      setMsg("Fehler: " + (/column .*holidays|does not exist/i.test(t) ? "Die Datenbank ist noch nicht umgestellt. Bitte edit-month-schema.sql im SQL Editor ausführen." : t));
    }
    setBusy("");
  }

  async function load() {
    // do not silently throw away people the boss typed in by hand
    const unsaved = staffList.filter((s) => !UUID.test(String(s.id)) && !SAMPLE_NAME.test(String(s.name).trim()));
    if (unsaved.length && !window.confirm(`Die Liste wird durch die Datenbank ersetzt. ${unsaved.length} nicht gespeicherte Person(en) gehen verloren. Fortfahren?`)) return;
    setBusy("load"); setMsg("");
    const { data, error } = await sb
      .from("staff")
      .select("id, name, email, weekly_hours, employment_type, night_exempt, weekend_exempt, is_team_lead")
      .eq("org_id", org.orgId)
      .eq("active", true)
      .order("name");
    setBusy("");
    if (error) { setMsg("Fehler: " + error.message); return; }
    if (!data.length) { setMsg("In der Datenbank sind für diese Firma noch keine Personen gespeichert. Trage Personen unten ein und tippe auf „Personen in Datenbank speichern“."); return; }
    onLoadStaff(data);
    setMsg(`${data.length} Personen aus der Datenbank geladen. Urlaub, Krankheit und Wünsche wurden zurückgesetzt.`);
  }

  async function save() {
    setBusy("save"); setMsg("");
    try {
      const names = staffList.map((s) => String(s.name).trim().toLowerCase());
      if (names.some((n) => !n)) throw new Error("Eine Person hat keinen Namen.");
      if (new Set(names).size !== names.length) throw new Error("Zwei Personen haben denselben Namen. Bitte eindeutige Namen vergeben.");
      const ex = await sb.from("staff").select("id, name").eq("org_id", org.orgId).eq("active", true);
      if (ex.error) throw ex.error;
      const idMap = {}; let created = 0, updated = 0;
      for (const s of staffList) {
        const row = { ...toDb(s), name: String(s.name).trim() };
        if (UUID.test(String(s.id))) {
          const r = await sb.from("staff").update(row).eq("id", s.id);
          if (r.error) throw r.error; updated++; continue;
        }
        const match = ex.data.find((x) => String(x.name).trim().toLowerCase() === row.name.toLowerCase());
        if (match) {
          const r = await sb.from("staff").update(row).eq("id", match.id);
          if (r.error) throw r.error; idMap[s.id] = match.id; updated++;
        } else {
          const id = crypto.randomUUID();
          const r = await sb.from("staff").insert({ ...row, id, org_id: org.orgId, active: true });
          if (r.error) throw r.error; idMap[s.id] = id; created++;
        }
      }
      const changed = Object.keys(idMap).length > 0;
      if (changed) onIdsChanged(idMap);
      setMsg(`${created} neu gespeichert, ${updated} aktualisiert.${changed ? " Der Plan wurde zurückgesetzt, bitte neu erstellen." : ""}`);
    } catch (e) {
      setMsg("Fehler: " + (e && e.message ? e.message : String(e)));
    }
    setBusy("");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-slate-800">{org.orgName}</span>
          <span className="text-slate-500"> · {ROLE_LABEL[org.role] || org.role}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {org.products.map((p) => (
              <span key={p} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">{PRODUCT_LABEL[p] || p}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={!!busy} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs text-teal-800 hover:bg-teal-100 disabled:opacity-60">
            {busy === "load" ? "Lädt …" : "Personen aus Datenbank laden"}
          </button>
          <button onClick={save} disabled={!!busy} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800 hover:bg-indigo-100 disabled:opacity-60">
            {busy === "save" ? "Speichert …" : "Personen in Datenbank speichern"}
          </button>
          <button onClick={() => setWishesOpen(true)} className={`rounded-lg border px-2.5 py-1.5 text-xs active:translate-y-px ${openWishes > 0 ? "border-rose-200 bg-rose-50 font-medium text-rose-800 hover:bg-rose-100" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>Wünsche{openWishes > 0 ? ` · ${openWishes} offen` : ""}</button>
          <a href="/freigaben" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Freigaben &amp; Archiv{openJumps > 0 ? ` · ${openJumps} Einspringen offen` : ""}</a>
          <button onClick={openEdit} disabled={!!busy} aria-expanded={editOpen} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60">Plan bearbeiten</button>
          <button onClick={() => sb.auth.signOut()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Abmelden</button>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">Neue oder geänderte Personen sind erst nach „Personen in Datenbank speichern“ in der Datenbank. Nur Personen aus der Datenbank können Pläne veröffentlicht bekommen.</div>
      {wishesOpen && <WishesDialog year={year} monthIdx={monthIdx} onImport={onImportWishes} onChanged={() => setWishBump((b) => b + 1)} onClose={() => { setWishesOpen(false); setWishBump((b) => b + 1); }} />}
      {editOpen && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="mb-2 font-semibold">Gespeicherten Plan zum Bearbeiten öffnen</div>
          <div className="flex flex-wrap items-end gap-2">
            <label>Monat
              <select value={editMonth} onChange={(e) => setEditMonth(e.target.value)} className="ml-1 rounded-md border border-amber-300 bg-white px-2 py-1">
                {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
            </label>
            <label>Jahr
              <select value={editYear} onChange={(e) => setEditYear(e.target.value)} className="ml-1 rounded-md border border-amber-300 bg-white px-2 py-1">
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {versions.length > 0 && (
              <label>Fassung
                <select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="ml-1 max-w-[16rem] rounded-md border border-amber-300 bg-white px-2 py-1">
                  <option value="current">Aktueller Stand</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{new Date(v.created_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · {v.actor_email || "?"}{v.note ? ` · ${v.note}` : ""}</option>)}
                </select>
              </label>
            )}
            <button onClick={loadPlan} disabled={!!busy} className="rounded-md bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">{busy === "plan" ? "Lädt …" : "Plan laden"}</button>
          </div>
          {versions.length > 0 && <div className="mt-2 text-amber-800">Einen Fehler rückgängig machen: unter „Fassung“ den Stand vor dem Fehler wählen, „Plan laden“, dann „Zur Freigabe einreichen“ (Grund z. B. „Korrektur“). Die falsche Änderung wird dabei automatisch storniert, wenn die Schicht noch nicht stattgefunden hat.</div>}
          {saved.length > 0 && (
            <div className="mt-2 text-amber-800">Gespeichert: {saved.map((x) => `${MONTHS[x.month - 1].slice(0, 3)} ${x.year} (${STATUS_TXT[x.status] || x.status})`).join(" · ")}</div>
          )}
        </div>
      )}
      {msg && <div className="mt-1.5 text-xs text-slate-700">{msg}</div>}
      {row && row.status === "pending" && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{MONTHS[monthIdx]} {year} wartet auf Freigabe durch die Leitung.</div>}
      {row && row.status === "draft" && row.review_note && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-medium text-rose-700">{MONTHS[monthIdx]} {year} wurde zurückgewiesen: {row.review_note}</div>}
    </div>
  );
}
