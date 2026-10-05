"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
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
    return "Die Datenbank ist noch nicht vollständig umgestellt. Bitte die SQL-Dateien (approval-archive, edit-month, changes, corrections, normal-changes) der Reihe nach im SQL Editor ausführen.";
  }
  return msg;
}

// Small modal window (opens only when a question has to be answered, so the page stays calm)
function Dialog({ title, children, actions, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 text-sm text-slate-800 shadow-xl outline-none">
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-2 text-slate-600">{children}</div>
        <div className="mt-4 flex flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}
const primary = "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const secondary = "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50";
const ghost = "rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-50";

// Saves the generated month and moves it through the approval steps:
//   Zwischenspeichern  ->  (Schichtplaner) zur Freigabe einreichen  ->  (Leitung) Freigeben / Zurückweisen  ->  veröffentlicht
// The Leitung and the Inhaber publish directly. A Schichtplaner only publishes directly if the company does not require approval.
// A question is only asked when it matters: when a month that employees already see is changed.
export default function PublishPanel({ schedule, staffList, year, monthIdx, shiftList, holidays, changeCount, editMode }) {
  const org = useContext(OrgContext);
  const [phase, setPhase] = useState("idle"); // idle | working | done | error
  const [info, setInfo] = useState("");
  const [row, setRow] = useState(null);
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null); // { step: "confirm" | "choose" | "reason", action: "publish" | "submit" }
  const [reason, setReason] = useState("");

  const month = monthIdx + 1;
  useEffect(() => {
    if (!org) return;
    let alive = true;
    (async () => {
      const r = await org.supabase.from("schedule_months").select("status, has_newer_draft, review_note, published_at").eq("org_id", org.orgId).eq("year", year).eq("month", month);
      if (alive) setRow(!r.error && r.data && r.data[0] ? r.data[0] : null);
    })();
    return () => { alive = false; };
  }, [org, year, month, tick]);

  if (!org || !schedule) return null;

  const notFromDb = staffList.filter((s) => !UUID.test(String(s.id)));
  const direct = org.role !== "planner" || org.requireApproval === false;
  const mainAction = direct ? "publish" : "submit";
  const mainLabel = direct ? "Veröffentlichen" : "Zur Freigabe einreichen";
  const hasPublished = !!(row && row.published_at); // employees already see a version of this month
  const days = org.shortNoticeDays ?? 7;

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
        for (const id of [...new Set(day.shifts[s.key] || [])].filter(Boolean)) { // empty slots ("— leer —") are not people
          const start = new Date(year, monthIdx, day.day, t.sh, t.sm);
          const end = new Date(year, monthIdx, day.day, t.eh, t.em);
          if (end <= start) end.setDate(end.getDate() + 1);
          rows.push({ staff_id: id, date: `${year}-${pad(month)}-${pad(day.day)}`, key: s.key, label: s.label, start: start.toISOString(), end: end.toISOString() });
        }
      }
    }
    if (!rows.length) throw new Error("Der Plan enthält keine Schichten.");
    r = await sb.rpc("save_draft", { p_org: org.orgId, p_year: year, p_month: month, p_shifts: rows, p_holidays: holidays || [] });
    if (r.error) throw r.error;
    return rows.length;
  }

  // kind: "draft" | "submit" | "publish";  opts: { normal, reason }
  async function run(kind, opts = {}) {
    setDialog(null); setPhase("working"); setInfo("");
    try {
      setInfo("Speichern …");
      const n = await persistDraft();
      let done = `Zwischengespeichert (${n} Schichten für ${MONTHS[monthIdx]} ${year}). Mitarbeitende sehen noch nichts davon.`;
      const note = (opts.reason || "").trim() || null;
      if (kind === "submit") {
        setInfo("Einreichen …");
        const r = await org.supabase.rpc("submit_month", { p_org: org.orgId, p_year: year, p_month: month, p_note: note, p_normal: !!opts.normal });
        if (r.error) throw r.error;
        done = `Zur Freigabe eingereicht (${n} Schichten). Die Leitung kann den Plan unter „Freigaben & Archiv“ prüfen.`;
      } else if (kind === "publish") {
        setInfo("Veröffentlichen …");
        const r = await org.supabase.rpc("publish_month", { p_org: org.orgId, p_year: year, p_month: month, p_note: note, p_normal: !!opts.normal });
        if (r.error) throw r.error;
        done = `${n} Schichten für ${MONTHS[monthIdx]} ${year} veröffentlicht.`;
      }
      setPhase("done"); setInfo(done); setReason(""); setTick((t) => t + 1); window.dispatchEvent(new Event("schedule-status-changed"));
    } catch (e) {
      setPhase("error"); setInfo(friendly(e));
    }
  }

  // the main button: ask only what is needed
  // The question "Einspringen or normal?" belongs to EDITING a saved month ("Plan bearbeiten"). A newly created plan
  // only gets a short confirmation; if it replaces a published month it is recorded as a normal plan change.
  const replacing = hasPublished && !editMode;
  function startMain() { setReason(""); setDialog({ step: hasPublished && editMode ? "choose" : "confirm", action: mainAction }); }
  const status = row ? row.status : null;
  const chip = !status ? { t: "Noch nicht gespeichert", c: "bg-slate-100 text-slate-600" }
    : status === "pending" ? { t: "Wartet auf Freigabe durch die Leitung", c: "bg-amber-100 text-amber-800" }
    : status === "published" ? { t: row.has_newer_draft ? "Veröffentlicht · neuerer Entwurf noch nicht veröffentlicht" : "Veröffentlicht", c: "bg-emerald-100 text-emerald-800" }
    : { t: "Entwurf", c: "bg-slate-100 text-slate-700" };
  const busy = phase === "working";
  const confirmWord = dialog && dialog.action === "submit" ? "Einreichen" : "Veröffentlichen";

  return (
    <div className="mx-4 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.c}`}>{MONTHS[monthIdx]} {year}: {chip.t}</span>
          <a href="/freigaben" className="text-indigo-700 underline">Freigaben &amp; Archiv</a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run("draft")} disabled={busy} title="Sichert den Plan nur für dich. Mitarbeitende sehen ihn erst nach „Veröffentlichen“." className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">Zwischenspeichern</button>
          <button onClick={startMain} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{mainLabel}</button>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-indigo-600">Zwischenspeichern sichert den Plan nur für dich. Mitarbeitende sehen ihn erst nach „{mainLabel}“{direct ? "" : " und der Freigabe"}.</div>
      {changeCount !== null && changeCount !== undefined && (
        <div className={`mt-1.5 text-[11px] ${changeCount > 0 ? "font-semibold text-amber-800" : "text-indigo-600"}`}>
          {changeCount === 0 ? "Keine Änderung gegenüber der veröffentlichten Fassung." : `Gegenüber der veröffentlichten Fassung: ${changeCount} ${changeCount === 1 ? "Änderung" : "Änderungen"} (im Plan gelb markiert).`}
          {changeCount > 15 && <span className="font-normal"> Das sind viele. Wurde der Plan neu erstellt? Für einzelne Korrekturen (z. B. Krankheit) besser „Plan bearbeiten“ und „Plan laden“ benutzen, dann bleibt der Rest unverändert.</span>}
        </div>
      )}
      {notFromDb.length > 0 && phase === "idle" && (
        <div className="mt-2 text-amber-800">Hinweis: {notFromDb.length} Person(en) sind noch nicht in der Datenbank. Zuerst „Personen in Datenbank speichern“.</div>
      )}
      {info && <div className={`mt-2 ${phase === "error" ? "font-medium text-rose-700" : phase === "done" ? "font-medium text-emerald-700" : "text-indigo-700"}`}>{info}</div>}

      {dialog && dialog.step === "confirm" && (
        <Dialog title={replacing ? "Veröffentlichte Fassung ersetzen?" : dialog.action === "submit" ? "Plan zur Freigabe einreichen?" : "Plan veröffentlichen?"} onClose={() => setDialog(null)}
          actions={<>
            <button className={primary} onClick={() => run(dialog.action, { normal: replacing })}>{confirmWord}</button>
            <button className={ghost} onClick={() => setDialog(null)}>Abbrechen</button>
          </>}>
          {replacing
            ? `Für ${MONTHS[monthIdx]} ${year} gibt es schon eine veröffentlichte Fassung. Der neue Plan ersetzt sie${changeCount ? ` (${changeCount} Änderungen)` : ""}, die Mitarbeitenden sehen danach die neue Version. Das zählt als normale Planänderung, nicht als Einspringen. Für einzelne Korrekturen (z. B. Krankheit) besser „Plan bearbeiten“ benutzen.${dialog.action === "submit" ? " Sie sehen sie erst nach der Freigabe." : ""}`
            : dialog.action === "submit"
              ? `Die Leitung prüft den Plan für ${MONTHS[monthIdx]} ${year}. Mitarbeitende sehen ihn erst nach der Freigabe.`
              : `Mitarbeitende von „${org.orgName}“ sehen den Plan für ${MONTHS[monthIdx]} ${year} danach in ihrer App.`}
        </Dialog>
      )}
      {dialog && dialog.step === "choose" && (
        <Dialog title="Was für eine Änderung ist das?" onClose={() => setDialog(null)}
          actions={<>
            <button className={primary} onClick={() => setDialog({ ...dialog, step: "reason" })}>Einspringen / kurzfristig (z. B. Krankheit)</button>
            <button className={secondary} onClick={() => run(dialog.action, { normal: true })}>Normale Planänderung (kein Einspringen)</button>
            <button className={ghost} onClick={() => setDialog(null)}>Abbrechen</button>
          </>}>
          Die Mitarbeitenden sehen diesen Monat schon. Wer eine Schicht kurzfristig übernimmt, wird der Leitung als „Einspringen“ angezeigt. Änderungen, die mehr als {days} Tage vor der Schicht liegen, zählen automatisch als normale Planänderung.
        </Dialog>
      )}
      {dialog && dialog.step === "reason" && (
        <Dialog title="Grund für das Einspringen" onClose={() => setDialog(null)}
          actions={<>
            <button className={primary} disabled={!reason.trim()} onClick={() => run(dialog.action, { reason })}>{confirmWord}</button>
            <button className={ghost} onClick={() => setDialog({ ...dialog, step: "choose" })}>Zurück</button>
          </>}>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="z. B. Krankheit Anna 12.–15."
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) run(dialog.action, { reason }); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" />
          <div className="mt-1 text-[11px] text-slate-500">Der Grund ist nur für Leitung und Inhaber sichtbar, nicht für Mitarbeitende.</div>
        </Dialog>
      )}
    </div>
  );
}
