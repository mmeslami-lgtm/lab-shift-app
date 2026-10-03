"use client";

import React, { useContext, useState } from "react";
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

// Saves the generated plan to the shared database and publishes it, so employees can see it in their app.
// Works the same for both planners: they only differ in how they get their shift list.
export default function PublishPanel({ schedule, staffList, year, monthIdx, shiftList }) {
  const org = useContext(OrgContext);
  const [phase, setPhase] = useState("idle"); // idle | working | done | error
  const [info, setInfo] = useState("");
  if (!org || !schedule) return null;

  const notFromDb = staffList.filter((s) => !UUID.test(String(s.id)));
  const hasEmployeeApp = org.products.includes("employee_app");

  async function publish() {
    setPhase("working"); setInfo("");
    try {
      if (notFromDb.length) throw new Error("Einige Personen stammen nicht aus der Datenbank. Bitte oben zuerst „Personen aus Datenbank laden“ benutzen und den Plan neu erstellen.");
      const times = {};
      for (const s of shiftList) {
        const t = parseTimes(s.time);
        if (!t) throw new Error(`Die Zeit der Schicht „${s.label}“ ist nicht lesbar (${s.time}).`);
        times[s.key] = t;
      }
      const sb = org.supabase;

      setInfo("Schichtarten speichern …");
      let r = await sb.from("shift_definitions").update({ active: false }).eq("org_id", org.orgId);
      if (r.error) throw r.error;
      const defRows = shiftList.map((s, i) => ({
        org_id: org.orgId, key: s.key, label: s.label,
        start_time: times[s.key].start, end_time: times[s.key].end,
        frequency: s.frequency === "quota" ? "quota" : "daily",
        quota_per_month: s.frequency === "quota" ? (s.quotaCount || null) : null,
        prefer_team_lead: !!s.preferLead, requires_rest_after: !!s.requiresRestAfter,
        runs_on_weekends: !!s.runsOnWeekends, sort_order: i, active: true,
      }));
      r = await sb.from("shift_definitions").upsert(defRows, { onConflict: "org_id,key" });
      if (r.error) throw r.error;

      setInfo("Entwurf speichern …");
      const from = `${year}-${pad(monthIdx + 1)}-01`;
      const next = new Date(year, monthIdx + 1, 1);
      const to = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;
      r = await sb.from("scheduled_shifts").delete().eq("org_id", org.orgId).eq("status", "draft").gte("shift_date", from).lt("shift_date", to);
      if (r.error) throw r.error;

      const rows = [];
      for (const day of schedule.days) {
        for (const s of shiftList) {
          const t = times[s.key];
          for (const id of [...new Set(day.shifts[s.key] || [])]) {
            const start = new Date(year, monthIdx, day.day, t.sh, t.sm);
            const end = new Date(year, monthIdx, day.day, t.eh, t.em);
            if (end <= start) end.setDate(end.getDate() + 1);
            rows.push({
              org_id: org.orgId, staff_id: id, shift_date: `${year}-${pad(monthIdx + 1)}-${pad(day.day)}`,
              shift_key: s.key, shift_label: s.label, planned_start: start.toISOString(), planned_end: end.toISOString(), status: "draft",
            });
          }
        }
      }
      if (!rows.length) throw new Error("Der Plan enthält keine Schichten.");
      for (let i = 0; i < rows.length; i += 400) {
        r = await sb.from("scheduled_shifts").insert(rows.slice(i, i + 400));
        if (r.error) throw r.error;
      }

      setInfo("Veröffentlichen …");
      r = await sb.rpc("publish_month", { p_org: org.orgId, p_year: year, p_month: monthIdx + 1 });
      if (r.error) throw r.error;

      setPhase("done");
      setInfo(`${rows.length} Schichten für ${MONTHS[monthIdx]} ${year} veröffentlicht.`);
    } catch (e) {
      setPhase("error");
      setInfo(e && e.message ? e.message : String(e));
    }
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Für Mitarbeitende veröffentlichen</div>
          <div className="mt-0.5 text-indigo-700">
            {hasEmployeeApp
              ? `Mitarbeitende von „${org.orgName}“ sehen den Plan für ${MONTHS[monthIdx]} ${year} in ihrer App.`
              : "Die Mitarbeiter-App ist für diese Firma nicht gebucht. Der Plan wird gespeichert, ist aber erst sichtbar, wenn die App aktiviert wird."}
          </div>
        </div>
        <button onClick={publish} disabled={phase === "working"} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {phase === "working" ? "Bitte warten …" : "Veröffentlichen"}
        </button>
      </div>
      {notFromDb.length > 0 && phase === "idle" && (
        <div className="mt-2 text-amber-800">Hinweis: {notFromDb.length} Person(en) sind Beispielpersonen. Zum Veröffentlichen zuerst „Personen aus Datenbank laden“.</div>
      )}
      {info && <div className={`mt-2 ${phase === "error" ? "font-medium text-rose-700" : phase === "done" ? "font-medium text-emerald-700" : "text-indigo-700"}`}>{info}</div>}
    </div>
  );
}
