"use client";

import React, { useContext, useEffect, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", employee: "Mitarbeitende" };
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_NAME = /^Mitarbeiter \d+$/;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// Slim bar at the top of a planner: which company you work for, and the two buttons that keep the
// planner's list of people and the company's real list of people (in the database) in sync.
//   onLoadStaff(rows)   replace the planner list with the rows from the database
//   staffList, toDb(s)  the planner's current people and how one becomes a database row
//   onIdsChanged(map)   tell the planner that local ids were replaced by database ids
export default function OrgBar({ onLoadStaff, staffList, toDb, onIdsChanged, year, monthIdx }) {
  const org = useContext(OrgContext);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [row, setRow] = useState(null);
  const [bump, setBump] = useState(0);

  // status of the month shown in the planner (and the reason, if the Inhaber rejected it)
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
    const h = () => setBump((n) => n + 1);
    window.addEventListener("schedule-status-changed", h);
    return () => window.removeEventListener("schedule-status-changed", h);
  }, []);

  if (!org) return null;
  const sb = org.supabase;

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
          <a href="/freigaben" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Freigaben &amp; Archiv</a>
          <button onClick={() => sb.auth.signOut()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Abmelden</button>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">Neue oder geänderte Personen sind erst nach „Personen in Datenbank speichern“ in der Datenbank. Nur Personen aus der Datenbank können Pläne veröffentlicht bekommen.</div>
      {msg && <div className="mt-1.5 text-xs text-slate-700">{msg}</div>}
      {row && row.status === "pending" && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{MONTHS[monthIdx]} {year} wartet auf Freigabe durch die Inhaber.</div>}
      {row && row.status === "draft" && row.review_note && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-medium text-rose-700">{MONTHS[monthIdx]} {year} wurde zurückgewiesen: {row.review_note}</div>}
    </div>
  );
}
