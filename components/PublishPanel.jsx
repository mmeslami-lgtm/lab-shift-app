"use client";

import React, { useContext, useEffect, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pad = (n) => String(n).padStart(2, "0");

function parseTimes(t) {
  const m = String(t || "").match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const sh = +m[1], sm = +(m[2] || 0), eh = +m[3], em = +(m[4] || 0);
  return { sh, sm, eh, em, start: `${pad(sh)}:${pad(sm)}:00`, end: `${pad(eh)}:${pad(em)}:00` };
}
function friendly(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/Could not find the function|schema cache|does not exist/i.test(msg)) {
    return "Die Datenbank ist noch nicht auf Freigabe und Archiv umgestellt. Bitte zuerst approval-archive-schema.sql im SQL Editor ausführen.";
  }
  return msg;
}

// Saves the generated month to the shared database and moves it through the approval steps:
//   Entwurf speichern  ->  (Leitung) zur Freigabe einreichen  ->  (Inhaber) Freigeben / Zurückweisen  ->  veröffentlicht
// An Inhaber, or any boss in a company that does not require approval, can publish directly.
export default function PublishPanel({ schedule, staffList, year, monthIdx, shiftList }) {
  const org = useContext(OrgContext);
  const [phase, setPhase] = useState("idle"); // idle | working | done | error
  const [info, setInfo] = useState("");
  const [row, setRow] = useState(null);       // status row of this month
  const [tick, setTick] = useState(0);

  const month = monthIdx + 1;
  useEffect(() => {
    if (!org) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("schedule_months").select("status, has_newer_draft, review_note").eq("org_id", org.orgId).eq("year", year).eq("month", month);
      if (alive) setRow(!r.error && r.data && r.data[0] ? r.data[0] : null);
    })();
    return () => { alive = false; };
  }, [org, year, month, tick]);

  if (!org || !schedule) return null;

  const notFromDb = staffList.filter((s) => !UUID.test(String(s.id)));
  const hasEmployeeApp = org.products.includes("employee_app");
  const direct = org.role === "owner" || org.requireApproval === false;

  // 1) shift kinds + 2) the whole draft month in one database call
  async function persistDraft() {
    if (notFromDb.length) throw new Error("Einige Personen stammen nicht aus der Datenbank. Bitte oben „Personen in Datenbank speichern“ benutzen und den Plan neu erstellen.");
    const times = {};
    for (const s of shiftList) {
      const t = parseTimes(s.time);
      if (!t) throw new Error(`Die Zeit der Schicht „${s.label}“ ist nicht lesbar (${s.time}).`);
      times[s.key] = t;
    }
    const sb = org.supabase;
    let r = await sb.from("shift_definitions").update({ active: false }).eq("org_id", org.orgId);
    if (r.error) throw r.error;
    const defRows = shiftList.map((s, i) => ({
      org_id: org.orgId, key: s.key, label: s.label, start_time: times[s.key].start, end_time: times[s.key].end,
      frequency: s.frequency === "quota" ? "quota" : "daily", quota_per_month: s.frequency === "quota" ? (s.quotaCount || null) : null,
      prefer_team_lead: !!s.preferLead, requires_rest_after: !!s.requiresRestAfter, runs_on_weekends: !!s.runsOnWeekends, sort_order: i, active: true,
    }));
    r = await sb.from("shift_definitions").upsert(defRows, { onConflict: "org_id,key" });
    if (r.error) throw r.error;

    const rows = [];
    for (const day of schedule.days) {
      for (const s of shiftList) {
        const t = times[s.key];
        for (const id of [...new Set(day.shifts[s.key] || [])]) {
          const start = new Date(year, monthIdx, day.day, t.sh, t.sm);
          const end = new Date(year, monthIdx, day.day, t.eh, t.em);
          if (end <= start) end.setDate(end.getDate() + 1);
          rows.push({ staff_id: id, date: `${year}-${pad(month)}-${pad(day.day)}`, key: s.key, label: s.label, start: start.toISOString(), end: end.toISOString() });
        }
      }
    }
    if (!rows.length) throw new Error("Der Plan enthält keine Schichten.");
    r = await sb.rpc("save_draft", { p_org: org.orgId, p_year: year, p_month: month, p_shifts: rows });
    if (r.error) throw r.error;
    return rows.length;
  }

  async function run(kind) {
    setPhase("working"); setInfo("");
    try {
      setInfo("Speichern …");
      const n = await persistDraft();
      let done = `Entwurf gespeichert (${n} Schichten für ${MONTHS[monthIdx]} ${year}).`;
      if (kind === "submit") {
        setInfo("Einreichen …");
        const r = await org.supabase.rpc("submit_month", { p_org: org.orgId, p_year: year, p_month: month });
        if (r.error) throw r.error;
        done = `Zur Freigabe eingereicht (${n} Schichten). Die Inhaber können den Plan unter „Freigaben & Archiv“ prüfen.`;
      } else if (kind === "publish") {
        setInfo("Veröffentlichen …");
        const r = await org.supabase.rpc("publish_month", { p_org: org.orgId, p_year: year, p_month: month });
        if (r.error) throw r.error;
        done = `${n} Schichten für ${MONTHS[monthIdx]} ${year} veröffentlicht.`;
      }
      setPhase("done"); setInfo(done); setTick((t) => t + 1); window.dispatchEvent(new Event("schedule-status-changed"));
    } catch (e) {
      setPhase("error"); setInfo(friendly(e));
    }
  }

  const status = row ? row.status : null;
  const chip = !status ? { t: "Noch nicht gespeichert", c: "bg-slate-100 text-slate-600" }
    : status === "pending" ? { t: "Wartet auf Freigabe durch die Inhaber", c: "bg-amber-100 text-amber-800" }
    : status === "published" ? { t: row.has_newer_draft ? "Veröffentlicht · neuerer Entwurf noch nicht veröffentlicht" : "Veröffentlicht", c: "bg-emerald-100 text-emerald-800" }
    : { t: "Entwurf", c: "bg-slate-100 text-slate-700" };
  const busy = phase === "working";

  return (
    <div className="mx-4 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Speichern, Freigabe, Veröffentlichen</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.c}`}>{MONTHS[monthIdx]} {year}: {chip.t}</span>
            <a href="/freigaben" className="text-indigo-700 underline">Freigaben &amp; Archiv</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run("draft")} disabled={busy} className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">Entwurf speichern</button>
          {direct ? (
            <button onClick={() => run("publish")} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Veröffentlichen</button>
          ) : (
            <button onClick={() => run("submit")} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Zur Freigabe einreichen</button>
          )}
        </div>
      </div>
      <div className="mt-2 text-indigo-700">
        {direct
          ? (hasEmployeeApp ? `Beim Veröffentlichen sehen die Mitarbeitenden von „${org.orgName}“ den Plan in ihrer App.` : "Die Mitarbeiter-App ist für diese Firma nicht gebucht. Der Plan wird gespeichert, ist aber erst sichtbar, wenn die App aktiviert wird.")
          : "In dieser Firma geben die Inhaber Pläne frei. Erst danach sehen die Mitarbeitenden den Plan."}
      </div>
      {notFromDb.length > 0 && phase === "idle" && (
        <div className="mt-2 text-amber-800">Hinweis: {notFromDb.length} Person(en) sind noch nicht in der Datenbank. Zuerst „Personen in Datenbank speichern“.</div>
      )}
      {info && <div className={`mt-2 ${phase === "error" ? "font-medium text-rose-700" : phase === "done" ? "font-medium text-emerald-700" : "text-indigo-700"}`}>{info}</div>}
    </div>
  );
}
