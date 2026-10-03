"use client";

import React, { useContext, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", employee: "Mitarbeitende" };
const PRODUCT_LABEL = { lab_planner: "Dienstplaner Labor", generic_planner: "Dienstplaner allgemein", employee_app: "Mitarbeiter-App" };

// Slim bar at the top of a planner: which company you are working for, and a button that replaces the
// planner's sample people with the real people of that company (their ids are what publishing uses).
export default function OrgBar({ onLoadStaff }) {
  const org = useContext(OrgContext);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!org) return null;

  async function load() {
    setBusy(true); setMsg("");
    const { data, error } = await org.supabase
      .from("staff")
      .select("id, name, email, weekly_hours, employment_type, night_exempt, weekend_exempt, is_team_lead")
      .eq("org_id", org.orgId)
      .eq("active", true)
      .order("name");
    setBusy(false);
    if (error) { setMsg("Fehler: " + error.message); return; }
    if (!data.length) { setMsg("In der Datenbank sind für diese Firma noch keine Personen angelegt."); return; }
    onLoadStaff(data);
    setMsg(`${data.length} Personen aus der Datenbank geladen. Urlaub, Krankheit und Wünsche wurden zurückgesetzt.`);
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
        <div className="flex gap-2">
          <button onClick={load} disabled={busy} className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs text-teal-800 hover:bg-teal-100 disabled:opacity-60">
            {busy ? "Lädt …" : "Personen aus Datenbank laden"}
          </button>
          <button onClick={() => org.supabase.auth.signOut()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Abmelden</button>
        </div>
      </div>
      {msg && <div className="mt-2 text-xs text-slate-600">{msg}</div>}
    </div>
  );
}
