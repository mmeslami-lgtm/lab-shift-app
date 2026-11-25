"use client";

// Touren (Paket D3a, 21.11.2026): Kunden + Aufträge, von Hand eingetragen (Inhaber, Leitung, Büro).
// Für alle Branchen mit Arbeit beim Kunden (Reinigung, Technik, Pflege …) – nichts ist nur für eine Firma gemacht.
// Kein fester Schichtplan: Zeit, Adresse und Personenzahl sind bei jedem Auftrag anders und werden von Hand eingetragen.
// Adresse: aus den gespeicherten Adressen des Kunden wählen oder neu eintragen (Kartenlink → Koordinaten).
// Noch nicht hier (D3b): Personen zuteilen, „My jobs“, Anfragen. Kein Preis (Entscheidung Nutzer).
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { OrgContext } from "../lib/orgContext";
import PlannerShell from "./PlannerShell";
import ZugaengeDialog from "./ZugaengeDialog";
import RequestsDialog from "./RequestsDialog";
import { tx as txRaw, loc, wdShort, wdLong, dmy, dm, isoDmy, getLang, dec, monthName } from "../lib/i18n";
import { useLang } from "../lib/useLang";
import { coordsFromText, isShortMapsLink, mapsHref, normPhone } from "../lib/maps";
import { buildTrips } from "../lib/tourenTrips";
import { suggestStaff } from "../lib/tourenSuggest";

// Branchenvorlage (D3b): bei „Pflege & Betreuung“ heißen Kunden „Klienten“ und Aufträge „Einsätze“ (EN: clients / visits).
// Gilt nur in dieser Datei; die gespeicherten Daten ändern sich nicht.
let TERMS = "general";
const SWAP = {
  de: [[/\bKunden\b/g, "Klienten"], [/\bKunde\b/g, "Klient"], [/\bAufträge\b/g, "Einsätze"], [/\bAuftrags\b/g, "Einsatzes"], [/\bAuftrag\b/g, "Einsatz"]],
  en: [[/\bCustomers\b/g, "Clients"], [/\bcustomers\b/g, "clients"], [/\bCustomer\b/g, "Client"], [/\bcustomer\b/g, "client"], [/\bJobs\b/g, "Visits"], [/\bjobs\b/g, "visits"], [/\bJob\b/g, "Visit"], [/\bjob\b/g, "visit"]],
};
function tx(...a) {
  const out = txRaw(...a);
  if (TERMS !== "care" || typeof out !== "string") return out;
  return (SWAP[getLang()] || SWAP.de).reduce((t, [re, w]) => t.replace(re, w), out);
}
const DEFAULT_SETTINGS = { industry: "general", near_km: 3, fairness_pp: 10, travel_min: 30 };
const INDUSTRY = { cleaning: "Reinigung", care: "Pflege & Betreuung", facility: "Hausmeister & Technik", general: "Allgemein" };
import { CalendarDays, ClipboardList, Users, Settings, LogOut, MapPin, Plus, X, ChevronLeft, ChevronRight, Phone, KeyRound, UserCog, MoreHorizontal, FileText, Printer } from "lucide-react";

const SOURCES = [["phone", "Telefon"], ["whatsapp", "WhatsApp"], ["website", "Website"], ["email", "E-Mail"], ["in_person", "Persönlich"], ["referral", "Empfehlung"], ["other", "Sonstiges"]];
const STATUS = {
  new: { label: "Neu", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  accepted: { label: "Angenommen", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  done: { label: "Erledigt", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "Storniert", cls: "bg-rose-50 text-rose-700 border-rose-200 line-through" },
};
const MATERIAL = [["", "– keine Angabe –"], ["customer", "vom Kunden"], ["ours", "von uns"]];
const FIELD_KINDS = [["text", "Text"], ["number", "Zahl"], ["bool", "Ja/Nein"], ["date", "Datum"], ["select", "Auswahlliste"]];
const ROLE_LABEL = { owner: "Inhaber", supervisor: "Leitung", office: "Büro", planner: "Schichtplaner", employee: "Mitarbeitende" };
const PLANNER_ROLES = ["owner", "supervisor", "planner"];

// nur für schmale Bildschirme (Handy); am Computer ändert sich nichts
const MOBILE_CSS = `
.tv-only-phone { display: none; }
@media (max-width: 639px) {
  .tv-only-phone { display: flex; }
  .tv-root { padding: 8px 10px calc(84px + env(safe-area-inset-bottom)) !important; }
  .tv-root .dg-side { display: none; }
  .tv-root .dg-shell { padding: 4px 0 0; gap: 0; }
  .tv-root .dg-pagehead { margin-bottom: 12px; }
  .tv-root .dg-pagehead h1 { font-size: 22px; }
  .tv-root .dg-pagehead p { font-size: 13px; }
  .tv-root input, .tv-root select, .tv-root textarea { font-size: 16px !important; min-height: 42px; }
  .tv-root input[type="checkbox"], .tv-root input[type="radio"] { min-height: 0; width: 20px; height: 20px; }
  .tv-modal .tv-actions { position: sticky; bottom: 0; z-index: 5; background: #fff; margin: 16px -20px -16px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #E2E8F0; }
  .tv-modal .tv-actions button { min-height: 44px; }
  .tv-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; display: flex; background: #fff; border-top: 1px solid #DFE4EC; padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -4px 16px rgba(15,23,42,.06); }
  .tv-tabbar button { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 60px; font-size: 11px; color: #5B6577; }
  .tv-tabbar button[aria-current="page"], .tv-tabbar button[aria-expanded="true"] { color: #243B6B; font-weight: 600; }
  .tv-sheet { position: absolute; left: 0; right: 0; bottom: calc(60px + env(safe-area-inset-bottom)); background: #fff; border-radius: 16px 16px 0 0; padding: 8px; box-shadow: 0 -8px 24px rgba(15,23,42,.12); display: flex; flex-direction: column; }
  .tv-sheet button, .tv-sheet a { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 14px; border-radius: 10px; font-size: 16px; color: #1E293B; text-align: left; }
  .tv-sheet button:active, .tv-sheet a:active { background: #F1F5F9; }
  .tv-toast { position: fixed; left: 12px; right: 12px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 46; justify-content: center; background: #065F46; color: #fff; border-radius: 12px; padding: 10px 14px; font-size: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.18); }
}
`;

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00");
const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const mondayOf = (iso) => { const d = dateOf(iso); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoOf(d); };
// Monatsansicht (24.11.2026): ganze Wochen Mo–So, die den Monat abdecken
const monthFirst = (iso) => `${iso.slice(0, 7)}-01`;
const monthLast = (iso) => { const d = dateOf(monthFirst(iso)); return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
const addMonths = (iso, n) => { const d = dateOf(monthFirst(iso)); return isoOf(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)); };
const monthGrid = (iso) => { const a = mondayOf(monthFirst(iso)); const b = addDays(mondayOf(monthLast(iso)), 6); const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
const hhmm = (t) => String(t || "").slice(0, 5);
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
const endOf = (start, dur) => { const e = (((toMin(start) + (dur || 0)) % 1440) + 1440) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };
// D3c-1: Ist-Zeiten und Live-Status eines Auftrags (angekommen / fertig / läuft länger / Termin offen)
const tsHm = (ts) => { if (!ts) return ""; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hm = (min) => { const m = Math.abs(Math.round(min)); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
function liveStatus(j) {
  if (j.status === "cancelled") return { label: txRaw("Storniert"), cls: "bg-rose-50 text-rose-700 border-rose-200 line-through" };
  if (j.needs_confirm) return { label: txRaw("Termin offen"), cls: "bg-amber-50 text-amber-800 border-amber-200" };
  // 26.11.2026: „nicht fertig“ auch ohne Ist-Zeit (Büro); 'completed' = mit der Fortsetzung fertig geworden (Script 61)
  if (j.outcome === "partial") return { label: txRaw("⏸ nicht fertig"), cls: "bg-violet-50 text-violet-800 border-violet-200" };
  if (j.outcome === "completed") return { label: txRaw("✓ fertig (mit Fortsetzung)"), cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  if (j.finished_at) {
    const act = j.arrived_at ? (new Date(j.finished_at) - new Date(j.arrived_at)) / 60000 : null; const diff = act === null ? 0 : act - j.duration_min;
    return { label: txRaw("✓ fertig {0}", tsHm(j.finished_at)) + (diff >= 5 ? ` · +${hm(diff)}` : diff <= -5 ? ` · −${hm(diff)}` : ""), cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  }
  if (j.arrived_at) {
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes(); const end = toMin(j.start_time) + j.duration_min;
    if (j.work_date === isoOf(now) && nowMin > end) return { label: txRaw("⏱ läuft länger +{0}", hm(nowMin - end)), cls: "bg-orange-50 text-orange-800 border-orange-200" };
    return { label: txRaw("● vor Ort {0}", tsHm(j.arrived_at)), cls: "bg-blue-50 text-blue-800 border-blue-200" };
  }
  return null;
}
const durTxt = (min) => { const h = Math.floor(min / 60), m = min % 60; return getLang() === "en" ? (h ? `${h} h` : "") + (m ? ` ${m} min` : "") : (h ? `${h} Std.` : "") + (m ? ` ${m} Min.` : ""); };
const blank = (s) => !String(s || "").trim();
const clean = (s) => (blank(s) ? null : String(s).trim());
const digits = (s) => String(s || "").replace(/\D/g, "");
const custName = (c) => (c ? (c.kind === "company" && c.company ? `${c.company} – ${c.name}` : c.name) : "?");
// D3c-2 (24.11.2026): regelmäßige Aufträge – dieselbe Regel wie in der Datenbank (touren_series_hit)
const isoDow = (iso) => ((dateOf(iso).getDay() + 6) % 7) + 1; // 1 = Mo … 7 = So
const WD_ISO = [1, 2, 3, 4, 5, 6, 7];
function seriesHit(s, d) {
  if (d < s.start_date || (s.end_date && d > s.end_date)) return false;
  if (s.pause_from && d >= s.pause_from && d <= (s.pause_until || d)) return false;
  if (s.freq === "week") return (s.weekdays || []).includes(isoDow(d)) && Math.round((dateOf(mondayOf(d)) - dateOf(mondayOf(s.start_date))) / 604800000) % (s.every || 1) === 0;
  const a = dateOf(s.start_date), b = dateOf(d);
  return ((b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()) % (s.every || 1) === 0 && b.getDate() === Math.min(a.getDate(), Number(monthLast(d).slice(8)));
}
const seriesNext = (s, from, n = 1) => { const out = []; let d = from < s.start_date ? s.start_date : from; for (let i = 0; i < 800 && out.length < n; i += 1, d = addDays(d, 1)) if (seriesHit(s, d)) out.push(d); return out; };
const seriesLast = (s, upto) => { let d = upto; for (let i = 0; i < 120; i += 1, d = addDays(d, -1)) if (seriesHit({ ...s, end_date: null }, d)) return d; return upto; };
const dayList = (s, long) => [...(s.weekdays || [])].sort((a, b) => a - b).map((n) => (long ? wdLong(n % 7) : wdShort(n % 7)));
const andList = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} ${tx("und")} ${l[l.length - 1]}` : l.join(""));
const ruleText = (s) => `${s.freq === "month" ? tx("Jeden Monat am {0}.", Number(s.start_date.slice(8))) : tx(s.every > 1 ? "Alle 2 Wochen: {0}" : "Jede Woche: {0}", dayList(s).join(", "))} · ${hhmm(s.start_time)}–${endOf(s.start_time, s.duration_min)}`;
const ruleSentence = (s) => (s.freq === "month" ? tx("jeden Monat am {0}.", Number(s.start_date.slice(8))) : tx(s.every > 1 ? "alle 2 Wochen am {0}" : "jeden {0}", andList(dayList(s, true))));
const repOf = (s) => ({ mode: !s ? "none" : s.freq === "month" ? "month" : s.every > 1 ? "week2" : "week", days: s ? [...(s.weekdays || [])] : [], untilOn: !!(s && s.end_date), until: (s && s.end_date) || "", same: s ? !!s.same_team : true });
const repRule = (r) => ({ freq: r.mode === "month" ? "month" : "week", every: r.mode === "week2" ? 2 : 1, weekdays: r.mode === "month" ? [] : [...r.days].sort((a, b) => a - b) });
const dayLbl = (iso) => `${wdShort(dateOf(iso).getDay())} ${dm(dateOf(iso))}`;

function errText(e) {
  const m = e && e.message ? e.message : String(e || "");
  if (/customers_phone_uq/.test(m)) return tx("Diese Telefonnummer gehört schon zu einem anderen Kunden.");
  if (/customers_phone_check|phone/.test(m) && /check/.test(m)) return tx("Bitte eine gültige Telefonnummer eingeben (nur Ziffern, am Anfang + erlaubt).");
  if (/relation .* does not exist|schema cache/.test(m)) return tx("Die Datenbank ist noch nicht vorbereitet (Skript 46 fehlt).");
  if (/row-level security|permission denied/.test(m)) return tx("Dafür fehlt die Berechtigung.");
  return tx(m);
}

const inpBase = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white";
const inp = `w-full ${inpBase}`;
// Löschen (SQL 49): die Datenbank löscht nur, wenn die Regel erlaubt; sonst kommt 0 Zeilen zurück → Hinweis
const ask = (text) => typeof window === "undefined" || window.confirm(text);
// für Einstellungen: liefert ein Ergebnis im Format von done() – blockiert → Fehlermeldung mit Hinweis
async function delOrHint(query, hint) {
  const r = await removeRow(query);
  if (r.error) return { error: r.error };
  return r.blocked ? { error: { message: hint } } : { error: null };
}
async function removeRow(query) {
  const r = await query.select();
  if (r.error) return { error: r.error };
  return { blocked: !r.data || r.data.length === 0 };
}
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-teal-600 hover:bg-teal-700 text-white`;
const btnLight = `${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-700`;
const lbl = "block text-xs font-medium text-slate-600 mb-1";

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="tv-modal fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-0 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} min-h-full bg-white shadow-xl sm:min-h-0 sm:rounded-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3 sm:static sm:rounded-t-2xl">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tx("Schließen")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  const cls = msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : msg.kind === "warn" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800";
  return <div role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${cls}`}>{msg.text}</div>;
}

// große Knöpfe für das Handy: Anrufen / WhatsApp / Karte (nur Inhaber, Leitung, Büro sehen Touren)
function ContactButtons({ phone, map }) {
  const href = map ? mapsHref(map) : null;
  if (!phone && !href) return null;
  const b = "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50";
  const stop = (e) => e.stopPropagation();
  return (
    <div className="mt-2 flex gap-2">
      {phone && <a href={`tel:${phone}`} onClick={stop} className={b}><Phone size={15} aria-hidden="true" />{tx("Anrufen")}</a>}
      {phone && <a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer" onClick={stop} className={b}>WhatsApp</a>}
      {href && <a href={href} target="_blank" rel="noopener noreferrer" onClick={stop} className={b}><MapPin size={15} aria-hidden="true" />{tx("Route")}</a>}
    </div>
  );
}

function MapLink({ a, children }) {
  const href = mapsHref(a || {});
  if (!href) return children || null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline" title={tx("In Google Maps öffnen")}><MapPin size={14} aria-hidden="true" />{children || tx("Auf Karte zeigen")}</a>;
}

// ---------- Zusatzfelder (vom Inhaber festgelegt) ----------
function ExtraInputs({ fields, values, onChange }) {
  if (!fields.length) return null;
  const set = (id, v) => onChange({ ...values, [id]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.id];
        const name = <>{f.name}{f.required && f.kind !== "bool" ? " *" : ""}{f.staff_visible ? <span className="ml-1 text-[10px] text-slate-400">{tx("(für Mitarbeitende sichtbar)")}</span> : null}</>;
        if (f.kind === "bool") return <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={!!v} onChange={(e) => set(f.id, e.target.checked)} />{name}</label>;
        return (
          <label key={f.id} className="block">
            <span className={lbl}>{name}</span>
            {f.kind === "select" ? (
              <select className={inp} value={v || ""} onChange={(e) => set(f.id, e.target.value || null)}>
                <option value="">{tx("– bitte wählen –")}</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className={inp} type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} value={v === null || v === undefined ? "" : v} onChange={(e) => set(f.id, e.target.value === "" ? null : f.kind === "number" ? Number(e.target.value) : e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}
const missingRequired = (fields, values) => fields.filter((f) => f.required && f.kind !== "bool" && (values[f.id] === null || values[f.id] === undefined || values[f.id] === "")).map((f) => f.name);

// ---------- Adresse eintragen (Kartenlink → Koordinaten) ----------
function useCoords(org) {
  return useCallback(async (link) => {
    const s = String(link || "").trim();
    if (!s) return { lat: null, lng: null, state: "none" };
    const c = coordsFromText(s);
    if (c) return { ...c, state: "ok" };
    if (isShortMapsLink(s)) {
      try {
        const { data } = await org.supabase.auth.getSession();
        const token = data && data.session ? data.session.access_token : "";
        const r = await fetch("/api/maps", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ url: s }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.lat !== undefined) return { lat: j.lat, lng: j.lng, state: "ok" };
      } catch (e) { /* fall through */ }
      return { lat: null, lng: null, state: "unresolved" };
    }
    return { lat: null, lng: null, state: "nocoords" };
  }, [org]);
}

// Link aus einem kopierten Text holen (z. B. ganze WhatsApp-Nachricht)
const linkIn = (text) => { const m = String(text || "").match(/https?:\/\/\S+|geo:[-\d.,]+/i); return m ? m[0].replace(/[)\].,;!?]+$/, "") : String(text || "").trim(); };
function AddressFields({ value, onChange, org, optional, noLabel }) {
  const resolve = useCoords(org);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  const firstAddr = React.useRef(value.address || "");
  // Adresse → Koordinaten (OpenStreetMap über /api/maps). Link oder GPS haben immer Vorrang.
  const fromAddress = async (addr) => {
    const a = String(addr || "").trim();
    if (a.length < 4) return;
    const hasCoords = value.lat !== null && value.lat !== undefined;
    const manual = value.coordSrc === "link" || value.coordSrc === "gps";
    if (hasCoords && manual) return;
    if (hasCoords && value.coordSrc === "addr" && value.geoFor === a) return;
    if (hasCoords && !value.coordSrc && a === firstAddr.current) return; // gespeicherter Ort, Adresse unverändert
    setBusy(true); setHint(null);
    const g = await geoAddress(org, a);
    if (g && g.lat !== undefined) onChange({ ...value, address: addr, lat: g.lat, lng: g.lng, coordState: "addr", coordSrc: "addr", geoFor: a });
    else onChange({ ...value, address: addr, lat: null, lng: null, coordState: g && g.missing ? "addr_missing" : "addr_error", coordSrc: null, geoFor: a });
    setBusy(false);
  };
  const set = (k, v) => onChange({ ...value, [k]: v });
  const check = async (raw) => {
    const link = linkIn(raw);
    setBusy(true); setHint(null);
    const r = await resolve(link);
    if (r.state === "ok") onChange({ ...value, maps_url: link, lat: r.lat, lng: r.lng, coordState: "ok", coordSrc: "link" });
    else if (!link) onChange({ ...value, maps_url: "", coordState: value.coordSrc === "addr" ? "addr" : "none", ...(value.coordSrc === "link" ? { lat: null, lng: null, coordSrc: null } : {}) });
    else onChange({ ...value, maps_url: link, coordState: r.state });
    setBusy(false);
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!String(t || "").trim()) { setHint(tx("In der Zwischenablage ist nichts. Bitte zuerst den Link kopieren.")); return; }
      await check(t);
    } catch (e) { setHint(tx("Einfügen ist hier nicht erlaubt – bitte lange in das Feld tippen und „Einfügen“ wählen.")); }
  };
  const here = () => {
    if (!navigator.geolocation) { setHint(tx("Dieses Gerät kann den Standort nicht bestimmen.")); return; }
    setBusy(true); setHint(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { const lat = Math.round(pos.coords.latitude * 1e6) / 1e6, lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        onChange({ ...value, lat, lng, maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, coordState: "ok", coordSrc: "gps" }); setBusy(false); },
      (err) => { setBusy(false); setHint(err && err.code === 1 ? tx("Standort nicht freigegeben. Bitte im Browser bzw. in den Einstellungen des Telefons erlauben.")
        : err && err.code === 3 ? tx("Der Standort konnte nicht rechtzeitig bestimmt werden. Bitte noch einmal versuchen (draußen oder mit WLAN geht es schneller).")
        : tx("Der Standort konnte auf diesem Gerät nicht bestimmt werden. Am besten am Telefon vor Ort.")); },
      { enableHighAccuracy: true, timeout: 15000 });
  };
  const st = value.coordState;
  const sbtn = "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={lbl}>{tx("Adresse")}{optional ? "" : " *"}</span>
        <input className={inp} value={value.address || ""} onChange={(e) => set("address", e.target.value)} onBlur={(e) => fromAddress(e.target.value)} placeholder={tx("z. B. Marina Walk 12, Wohnung 804")} />
        <span className="mt-1 block text-[11px]">
          {value.coordState === "addr" ? <span className="text-emerald-700">{tx("✓ Auf der Karte gefunden ({0})", `${Number(value.lat).toFixed(4)}, ${Number(value.lng).toFixed(4)}`)} <a className="underline" href={mapsHref(value)} target="_blank" rel="noopener noreferrer">{tx("prüfen")}</a></span>
            : value.coordState === "addr_missing" ? <span className="text-amber-700">{tx("Adresse nicht auf der Karte gefunden – bitte genauer schreiben (Straße, Hausnummer, Stadt) oder unten den Standort-Link einfügen.")}</span>
            : value.coordState === "addr_error" ? <span className="text-amber-700">{tx("Kartendienst gerade nicht erreichbar – die Adresse wird trotzdem gespeichert.")}</span>
            : null}
        </span>
      </label>
      <label className="block sm:col-span-2">
        <span className={lbl}>{tx("Genauer Standort (freiwillig)")}</span>
        <input className={inp} value={value.maps_url || ""} onChange={(e) => set("maps_url", e.target.value)} onBlur={(e) => { if (e.target.value !== (value.maps_url_checked || "")) check(e.target.value); }} placeholder="https://maps.app.goo.gl/…" />
        <span className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={sbtn} onClick={paste} disabled={busy}>📋 {tx("Link einfügen")}</button>
          <button type="button" className={sbtn} onClick={here} disabled={busy}>📍 {tx("Mein Standort hier")}</button>
        </span>
        {hint && <span className="mt-1 block text-[11px] text-amber-700">{hint}</span>}
        <span className="mt-1 block text-[11px] text-slate-500">
          {busy ? tx("Link wird geprüft …")
            : st === "ok" ? <span className="text-emerald-700">{tx("✓ Standort gefunden ({0})", `${Number(value.lat).toFixed(5)}, ${Number(value.lng).toFixed(5)}`)}</span>
            : st === "unresolved" ? <span className="text-amber-700">{tx("Kurzlink konnte nicht geprüft werden – der Link wird trotzdem gespeichert und öffnet die Karte.")}</span>
            : st === "nocoords" ? <span className="text-amber-700">{tx("Im Link stehen keine Koordinaten – er wird trotzdem gespeichert.")}</span>
            : tx("Standort in WhatsApp antippen → Google Maps → „Teilen“ → „Link kopieren“ → hier „Link einfügen“. Oder vor Ort „Mein Standort hier“.")}
        </span>
      </label>
      {!noLabel && (
        <label className="block">
          <span className={lbl}>{tx("Bezeichnung (optional)")}</span>
          <input className={inp} value={value.label || ""} onChange={(e) => set("label", e.target.value)} placeholder={tx("z. B. Wohnung, Büro, Lager")} />
        </label>
      )}
    </div>
  );
}
const emptyAddr = () => ({ address: "", maps_url: "", label: "", lat: null, lng: null, coordState: "none" });
const addrRow = (a) => ({ address: String(a.address).trim(), maps_url: clean(a.maps_url), label: clean(a.label), lat: a.lat ?? null, lng: a.lng ?? null });
// Adresse → Koordinaten (OpenStreetMap über /api/maps); null wenn nicht gefunden
async function geoAddress(org, text) {
  const a = String(text || "").trim(); if (a.length < 4) return null;
  try {
    const { data } = await org.supabase.auth.getSession();
    const token = data && data.session ? data.session.access_token : "";
    const res = await fetch("/api/maps", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ address: a, country: org.country || "", lang: getLang() }) });
    const j = await res.json().catch(() => ({}));
    return res.ok && j.lat !== undefined ? { lat: j.lat, lng: j.lng } : (res.status === 404 ? { missing: true } : null);
  } catch (e) { return null; }
}
// beim Speichern: fehlen Koordinaten, noch einmal aus der Adresse suchen
async function withCoords(org, row, addrKey = "address", latKey = "lat", lngKey = "lng") {
  if ((row[latKey] === null || row[latKey] === undefined) && row[addrKey]) {
    const g = await geoAddress(org, row[addrKey]);
    if (g && g.lat !== undefined) return { ...row, [latKey]: g.lat, [lngKey]: g.lng };
  }
  return row;
}

// ---------- Auftrag anlegen / bearbeiten ----------
function JobDialog({ org, data, job, preset, onClose, onSaved, onAssign }) {
  const { customers, addresses, services, fields } = data;
  const editing = !!job;
  const jobFields = fields.filter((f) => f.entity === "job" && f.active);
  const custFields = fields.filter((f) => f.entity === "customer" && f.active);
  const [custId, setCustId] = useState(job ? job.customer_id : (preset && preset.customerId) || null);
  const [search, setSearch] = useState("");
  const [newCust, setNewCust] = useState(null); // { kind, name, company, phone, extra }
  const [addrChoice, setAddrChoice] = useState(job ? (job.address_id || "manual") : null);
  const [addr, setAddr] = useState(job && !job.address_id ? { address: job.address_text, maps_url: job.maps_url || "", lat: job.lat, lng: job.lng, label: "", coordState: job.lat !== null && job.lat !== undefined ? "ok" : "none" } : emptyAddr());
  const [saveAddr, setSaveAddr] = useState(!job);
  const [f, setF] = useState(() => job ? {
    work_date: job.work_date, start_time: hhmm(job.start_time), dh: Math.floor(job.duration_min / 60), dm: job.duration_min % 60, service_type_id: job.service_type_id || "",
    staff_needed: job.staff_needed, material: job.material || "", notes_staff: job.notes_staff || "", notes_internal: job.notes_internal || "", source: job.source, status: job.status, extra: job.extra || {},
  } : { work_date: (preset && preset.date) || isoOf(new Date()), start_time: "", dh: 2, dm: 0, service_type_id: "", staff_needed: 1, material: "", notes_staff: "", notes_internal: "", source: "phone", status: "new", extra: {} });
  const [cancelOpen, setCancelOpen] = useState(false);
  // 26.11.2026: Einsatz im Büro abschließen (wer nicht mit der App arbeitet) – job_office_close (Script 60)
  const [closeOpen, setCloseOpen] = useState(false);
  const [cl, setCl] = useState(() => ({ arr: job && job.start_time ? String(job.start_time).slice(0, 5) : "", fin: "", outcome: "done", rh: 1, rm: 0, reason: "" }));
  const [rep, setRep] = useState(() => ({ ...repOf(null), mode: preset && preset.repeat ? "week" : "none", days: [isoDow((preset && preset.date) || isoOf(new Date()))] }));
  useEffect(() => { if (!job && rep.days.length <= 1) setRep((p) => ({ ...p, days: [isoDow(f.work_date || isoOf(new Date()))] })); }, [f.work_date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [series, setSeries] = useState(null);
  const [scopeFor, setScopeFor] = useState(null); // save | cancel | delete
  useEffect(() => { if (!job || !job.series_id) return; org.supabase.from("job_series").select("*").eq("id", job.series_id).single().then(({ data: d }) => setSeries(d || null)); }, [job, org]);
  const showIst = !!(job && (job.arrived_at || job.finished_at || job.outcome)); // Ist-Zeiten aus der Mitarbeiter-App (Büro kann korrigieren)
  const [ist, setIst] = useState({ arr: job ? tsHm(job.arrived_at) : "", fin: job ? tsHm(job.finished_at) : "" });
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const cust = customers.find((c) => c.id === custId) || null;
  const custAddrs = addresses.filter((a) => a.customer_id === custId && (a.active || (job && a.id === job.address_id)));
  useEffect(() => { // erste gespeicherte Adresse vorschlagen
    if (!custId || addrChoice) return;
    const first = addresses.find((a) => a.customer_id === custId && a.active);
    setAddrChoice(first ? first.id : "manual");
  }, [custId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return [];
    const qd = digits(q);
    return customers.filter((c) => c.active && (c.name.toLowerCase().includes(q) || String(c.company || "").toLowerCase().includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)) || String(c.customer_no) === q)).slice(0, 8);
  }, [search, customers]);

  const duration = (+f.dh || 0) * 60 + (+f.dm || 0);
  const svcList = services.filter((s) => s.active || s.id === f.service_type_id);

  async function save(scope) {
    setMsg(null);
    if (!cust && !newCust) return setMsg({ kind: "err", text: tx("Bitte einen Kunden wählen oder neu anlegen.") });
    if (newCust && blank(newCust.name)) return setMsg({ kind: "err", text: tx("Bitte den Namen des Kunden eintragen.") });
    if (newCust && missingRequired(custFields, newCust.extra || {}).length) return setMsg({ kind: "err", text: tx("Bitte ausfüllen: {0}", missingRequired(custFields, newCust.extra || {}).join(", ")) });
    const manual = newCust || addrChoice === "manual" || !addrChoice;
    if (manual && blank(addr.address)) return setMsg({ kind: "err", text: tx("Bitte die Adresse eintragen.") });
    if (!f.work_date) return setMsg({ kind: "err", text: tx("Bitte das Datum eintragen.") });
    if (!/^\d{2}:\d{2}$/.test(f.start_time)) return setMsg({ kind: "err", text: tx("Bitte die Uhrzeit für den Beginn eintragen.") });
    if (duration < 5) return setMsg({ kind: "err", text: tx("Bitte die Dauer eintragen.") });
    const st = Math.max(1, Math.min(50, parseInt(f.staff_needed, 10) || 1));
    const miss = missingRequired(jobFields, f.extra);
    if (miss.length) return setMsg({ kind: "err", text: tx("Bitte ausfüllen: {0}", miss.join(", ")) });
    const repeat = !editing && rep.mode !== "none";
    if (repeat && rep.mode !== "month" && !rep.days.length) return setMsg({ kind: "err", text: tx("Bitte mindestens einen Tag wählen.") });
    if (repeat && rep.untilOn && rep.until && rep.until < f.work_date) return setMsg({ kind: "err", text: tx("„Bis“ liegt vor „Von“.") });
    if (repeat && !seriesNext({ ...repRule(rep), start_date: f.work_date, end_date: rep.untilOn && rep.until ? rep.until : null }, f.work_date).length) return setMsg({ kind: "err", text: tx("In diesem Zeitraum gibt es keinen Termin.") });
    if (editing && job.series_id && !scope && f.work_date === job.work_date) { setScopeFor("save"); return; }
    setBusy(true);
    const sb = org.supabase;
    try {
      let customer = cust;
      if (newCust) {
        const ins = await sb.from("customers").insert({ org_id: org.orgId, kind: newCust.kind, name: newCust.name.trim(), company: newCust.kind === "company" ? clean(newCust.company) : null, phone: normPhone(newCust.phone, org.country), source: f.source, extra: newCust.extra || {} }).select().single();
        if (ins.error) throw ins.error;
        customer = ins.data;
      }
      let addressId = manual ? null : addrChoice;
      let a = manual ? await withCoords(org, addrRow(addr)) : addresses.find((x) => x.id === addrChoice);
      if (manual && (saveAddr || newCust)) {
        const ia = await sb.from("customer_addresses").insert({ org_id: org.orgId, customer_id: customer.id, ...a }).select().single();
        if (ia.error) throw ia.error;
        addressId = ia.data.id; a = ia.data;
      }
      const row = {
        customer_id: customer.id, address_id: addressId, address_text: a.label ? `${a.label}: ${a.address}` : a.address, maps_url: a.maps_url || null, lat: a.lat ?? null, lng: a.lng ?? null,
        work_date: f.work_date, start_time: f.start_time, duration_min: duration, service_type_id: f.service_type_id || null, staff_needed: st, material: f.material || null,
        notes_staff: clean(f.notes_staff), notes_internal: clean(f.notes_internal), source: f.source, extra: f.extra || {},
      };
      if (editing) {
        if (!manual && addrChoice === job.address_id) { // Adresse nicht geändert: Text/Ort des Auftrags so lassen
          Object.assign(row, { address_text: job.address_text, maps_url: job.maps_url, lat: job.lat, lng: job.lng });
        }
        if (showIst) {
          const at = (t) => (t ? new Date(`${f.work_date}T${t}:00`).toISOString() : null);
          if (ist.arr && ist.fin && ist.fin <= ist.arr) throw new Error(tx("„Fertig“ muss nach „Angekommen“ liegen."));
          Object.assign(row, { arrived_at: at(ist.arr), finished_at: at(ist.fin) });
        }
        const up = await sb.from("jobs").update({ ...row, status: f.status }).eq("id", job.id).select().single();
        if (up.error) throw up.error;
        if (scope === "all") { // auch alle folgenden Termine der Reihe
          const p = { address_id: row.address_id || "", address_text: row.address_text, maps_url: row.maps_url || "", lat: row.lat, lng: row.lng, start_time: row.start_time, duration_min: row.duration_min,
            service_type_id: row.service_type_id || "", staff_needed: row.staff_needed, material: row.material || "", notes_staff: row.notes_staff || "", notes_internal: row.notes_internal || "", extra: row.extra };
          const ch = await sb.rpc("touren_series_change", { p_series: job.series_id, p_from: job.work_date, p });
          if (ch.error) throw ch.error;
          onSaved(tx("Gespeichert ✓ – auch alle folgenden Termine."), f.work_date); return;
        }
      } else if (repeat) { // D3c-2: Reihe anlegen, Termine erzeugen
        const { work_date: _wd, ...tmpl } = row; // eslint-disable-line no-unused-vars
        const is = await sb.from("job_series").insert({ org_id: org.orgId, ...tmpl, ...repRule(rep), start_date: f.work_date, end_date: rep.untilOn && rep.until ? rep.until : null, same_team: !!rep.same }).select().single();
        if (is.error) throw is.error;
        const fl = await sb.rpc("touren_series_fill", { p_org: org.orgId });
        if (fl.error) throw fl.error;
        const first = await sb.from("jobs").select("*").eq("series_id", is.data.id).order("work_date").limit(1);
        const fj = first.data && first.data[0];
        const n = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("series_id", is.data.id);
        onSaved(tx("Regelmäßiger Auftrag angelegt ✓ ({0} Termine in den nächsten 12 Wochen)", n.count || 0), fj ? fj.work_date : f.work_date, rep.same && fj ? { teamJob: fj } : null); return;
      } else {
        const ins = await sb.from("jobs").insert({ org_id: org.orgId, ...row }).select().single();
        if (ins.error) throw ins.error;
      }
      onSaved(editing ? tx("Auftrag gespeichert ✓") : tx("Auftrag angelegt ✓"), f.work_date);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e) });
      setBusy(false);
    }
  }

  async function endFollowing(text) { // „Diesen und alle folgenden“: Reihe endet am Tag davor
    const r = await org.supabase.rpc("touren_series_end", { p_series: job.series_id, p_last: addDays(job.work_date, -1) });
    if (r.error) { setMsg({ kind: "err", text: errText(r.error) }); setBusy(false); return; }
    onSaved(text, job.work_date);
  }
  async function deleteJob(scope) {
    if (job.series_id && !scope) { setScopeFor("delete"); return; }
    if (scope === "all") {
      if (!ask(tx("Diesen und alle folgenden Termine löschen?\n\nDas geht nicht rückgängig."))) return;
      setBusy(true); await endFollowing(tx("Termine gelöscht – die Reihe endet am {0}.", isoDmy(addDays(job.work_date, -1)))); return;
    }
    if (!ask(tx("Auftrag Nr. {0} wirklich löschen?\n\nDas geht nicht rückgängig. Wenn der Kunde nur abgesagt hat, besser „Stornieren“.", job.job_no))) return;
    setBusy(true);
    const r = await removeRow(org.supabase.from("jobs").delete().eq("id", job.id));
    if (r.error || r.blocked) { setMsg({ kind: "err", text: r.error ? errText(r.error) : tx("Erledigte oder stornierte Aufträge können nicht gelöscht werden.") }); setBusy(false); return; }
    onSaved(tx("Auftrag gelöscht"), job.work_date);
  }
  async function cancelJob(scope) {
    if (blank(cancelReason)) return setMsg({ kind: "err", text: tx("Bitte einen Grund für die Stornierung eintragen.") });
    if (job.series_id && !scope) { setScopeFor("cancel"); return; }
    setBusy(true);
    const up = await org.supabase.from("jobs").update({ status: "cancelled", cancel_reason: cancelReason.trim() }).eq("id", job.id);
    if (up.error) { setMsg({ kind: "err", text: errText(up.error) }); setBusy(false); return; }
    if (scope === "all") { await endFollowing(tx("Storniert – die Reihe endet hier.")); return; }
    onSaved(tx("Auftrag storniert"), job.work_date);
  }
  async function officeClose() {
    if (cl.arr && cl.fin && cl.fin <= cl.arr) return setMsg({ kind: "err", text: tx("„Fertig“ muss nach „Angekommen“ liegen.") });
    const rest = cl.outcome === "partial" ? (+cl.rh || 0) * 60 + (+cl.rm || 0) : null;
    if (cl.outcome === "partial" && rest < 15) return setMsg({ kind: "err", text: tx("Bitte angeben, wie lange es noch dauert.") });
    setBusy(true);
    const r = await org.supabase.rpc("job_office_close", { p_job: job.id, p_outcome: cl.outcome, p_arrived: cl.arr || null, p_finished: cl.fin || null, p_remaining_min: rest, p_reason: cl.reason.trim() || null });
    if (r.error) { setMsg({ kind: "err", text: /job_office_close/.test(r.error.message || "") ? tx("Bitte zuerst Datenbank-Skript 60 ausführen.") : errText(r.error) }); setBusy(false); return; }
    onSaved(r.data && r.data.continuation ? tx("Abgeschlossen – Fortsetzung angelegt. Bitte unter „Bitte prüfen“ einen Termin einplanen.") : tx("Einsatz abgeschlossen ✓"), job.work_date);
  }
  async function reopen() {
    setBusy(true);
    const up = await org.supabase.from("jobs").update({ status: "new" }).eq("id", job.id);
    if (up.error) { setMsg({ kind: "err", text: errText(up.error) }); setBusy(false); return; }
    onSaved(tx("Auftrag wieder offen"), job.work_date);
  }

  const title = editing ? tx("Auftrag Nr. {0}", job.job_no) : tx("Neuer Auftrag");
  return (
    <Modal title={title} onClose={onClose} wide>
      {editing && job.series_id && <div className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">🔁 <b>{tx("Regelmäßiger Termin")}</b>{series ? ` – ${ruleText(series)}` : ""}<div className="text-xs text-sky-800">{tx("Regel ändern, pausieren oder beenden: beim Kunden unter „Regelmäßige Termine“.")}</div></div>}
      {editing && job.status === "cancelled" && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{tx("Storniert: {0}", job.cancel_reason || "–")} <button type="button" className="ml-2 underline" onClick={reopen} disabled={busy}>{tx("Wieder öffnen")}</button></div>}
      {/* Kunde */}
      <section className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{tx("Kunde")}</h3>
        {cust ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div><b>{custName(cust)}</b> <span className="text-slate-500">#{cust.customer_no}</span>{cust.phone ? <span className="ml-2 text-slate-600">{cust.phone}</span> : null}</div>
            {!editing && <button type="button" className="text-xs text-teal-700 underline" onClick={() => { setCustId(null); setAddrChoice(null); }}>{tx("Anderen Kunden wählen")}</button>}
          </div>
        ) : newCust ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-teal-800">{tx("Neuer Kunde")}</span><button type="button" className="text-xs text-slate-600 underline" onClick={() => setNewCust(null)}>{tx("Abbrechen")}</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={lbl}>{tx("Art")}</span>
                <select className={inp} value={newCust.kind} onChange={(e) => setNewCust({ ...newCust, kind: e.target.value })}><option value="person">{tx("Privatperson")}</option><option value="company">{tx("Firma")}</option></select></label>
              {newCust.kind === "company" && <label className="block"><span className={lbl}>{tx("Firmenname")}</span><input className={inp} value={newCust.company} onChange={(e) => setNewCust({ ...newCust, company: e.target.value })} /></label>}
              <label className="block"><span className={lbl}>{newCust.kind === "company" ? tx("Ansprechperson") : tx("Name")} *</span><input className={inp} value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} autoFocus /></label>
              <label className="block"><span className={lbl}>{tx("Mobil / WhatsApp")}</span><input className={inp} value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} placeholder="+971 50 123 4567" inputMode="tel" /></label>
            </div>
            {custFields.length > 0 && <div className="mt-3"><ExtraInputs fields={custFields} values={newCust.extra || {}} onChange={(v) => setNewCust({ ...newCust, extra: v })} /></div>}
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input className={inp} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tx("Kunde suchen: Name, Telefon oder Nr.")} autoFocus aria-label={tx("Kunde suchen")} />
              <button type="button" className={btnLight} onClick={() => { setNewCust({ kind: "person", name: search && !digits(search) ? search : "", company: "", phone: digits(search).length >= 5 ? search : "", extra: {} }); setAddrChoice("manual"); }}><Plus size={15} />{tx("Neuer Kunde")}</button>
            </div>
            {search.trim() && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {hits.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{tx("Kein Kunde gefunden.")}</li>}
                {hits.map((c) => (
                  <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setCustId(c.id); setSearch(""); setAddrChoice(null); }}>
                    <b>{custName(c)}</b> <span className="text-slate-500">#{c.customer_no}</span>{c.phone ? <span className="ml-2 text-slate-600">{c.phone}</span> : null}
                  </button></li>
                ))}
              </ul>
            )}
          </div>
        )}
        {cust && cust.notes_staff && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>{tx("Hinweise für Mitarbeitende (beim Kunden):")}</b> {cust.notes_staff}</p>}
      </section>

      {/* Adresse */}
      {(cust || newCust) && (
        <section className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{tx("Adresse")}</h3>
          {!newCust && custAddrs.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {custAddrs.map((a) => (
                <label key={a.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="radio" name="addr" checked={addrChoice === a.id} onChange={() => setAddrChoice(a.id)} className="mt-0.5" />
                  <span className="flex-1">{a.label ? <b>{a.label}: </b> : null}{a.address}{!a.active ? <span className="ml-1 text-xs text-slate-400">{tx("(inaktiv)")}</span> : null}</span>
                  <MapLink a={a} />
                </label>
              ))}
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="radio" name="addr" checked={addrChoice === "manual"} onChange={() => setAddrChoice("manual")} />{tx("Andere Adresse eintragen")}
              </label>
            </div>
          )}
          {(newCust || addrChoice === "manual" || custAddrs.length === 0) && (
            <div className="rounded-lg border border-slate-200 p-3">
              <AddressFields value={addr} onChange={setAddr} org={org} />
              {!newCust && <label className="mt-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />{tx("Beim Kunden speichern (für nächste Aufträge)")}</label>}
            </div>
          )}
        </section>
      )}

      {/* Zeit & Einsatz */}
      <section className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{tx("Termin")}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block"><span className={lbl}>{tx("Datum")} *</span><input type="date" className={inp} value={f.work_date} onChange={(e) => set("work_date", e.target.value)} /></label>
          <label className="block"><span className={lbl}>{tx("Beginn")} *</span><input type="time" className={inp} value={f.start_time} onChange={(e) => set("start_time", e.target.value)} step="300" /></label>
          <div><span className={lbl}>{tx("Dauer")} *</span>
            <div className="flex gap-1">
              <select className={inp} value={f.dh} onChange={(e) => set("dh", +e.target.value)} aria-label={tx("Stunden")}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{getLang() === "en" ? `${i} h` : `${i} Std.`}</option>)}</select>
              <select className={inp} value={f.dm} onChange={(e) => set("dm", +e.target.value)} aria-label={tx("Minuten")}>{[0, 15, 30, 45].map((m) => <option key={m} value={m}>{getLang() === "en" ? `${m} min` : `${m} Min.`}</option>)}</select>
            </div>
          </div>
          <div><span className={lbl}>{tx("Ende")}</span><div className="py-1.5 text-sm text-slate-700">{/^\d{2}:\d{2}$/.test(f.start_time) && duration ? endOf(f.start_time, duration) : "–"}</div></div>
          <label className="block sm:col-span-2"><span className={lbl}>{tx("Leistung")}</span>
            <select className={inp} value={f.service_type_id} onChange={(e) => set("service_type_id", e.target.value)}>
              <option value="">{tx("– keine Angabe –")}</option>
              {svcList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {services.length === 0 && <span className="mt-1 block text-[11px] text-slate-500">{tx("Leistungen legt der Inhaber unter „Einstellungen“ an.")}</span>}
          </label>
          {data.settings.industry !== "care" && (
            <label className="block"><span className={lbl}>{tx("Material")}</span>
              <select className={inp} value={f.material} onChange={(e) => set("material", e.target.value)}>{MATERIAL.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></label>
          )}
          <label className="block"><span className={lbl}>{tx("Anzahl Personal")}</span><input type="number" min="1" max="50" className={inp} value={f.staff_needed} onChange={(e) => set("staff_needed", e.target.value)} /></label>
          <label className="block"><span className={lbl}>{tx("Quelle")}</span>
            <select className={inp} value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></label>
          {editing && job.status !== "cancelled" && (
            <label className="block"><span className={lbl}>{tx("Status")}</span>
              <select className={inp} value={f.status} onChange={(e) => set("status", e.target.value)}>{["new", "accepted", "done"].map((k) => <option key={k} value={k}>{tx(STATUS[k].label)}</option>)}</select></label>
          )}
        </div>
      </section>

      {!editing && <section className="mb-4"><RepeatFields value={rep} onChange={setRep} date={f.work_date} /></section>}

      <section className="mb-2 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={lbl}>{tx("Hinweise für Mitarbeitende")}</span><textarea rows={3} className={inp} value={f.notes_staff} onChange={(e) => set("notes_staff", e.target.value)} placeholder={tx("z. B. Schlüssel beim Pförtner, Parken in der Tiefgarage")} /></label>
        <label className="block"><span className={lbl}>{tx("Interne Notiz (nur Büro und Leitung)")}</span><textarea rows={3} className={inp} value={f.notes_internal} onChange={(e) => set("notes_internal", e.target.value)} /></label>
      </section>
      {jobFields.length > 0 && <section className="mb-2"><ExtraInputs fields={jobFields} values={f.extra} onChange={(v) => set("extra", v)} /></section>}
      {showIst && (
        <section className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">{tx("Ist-Zeiten (aus der Mitarbeiter-App)")}</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className={lbl}>{tx("Angekommen um")}</span><input type="time" className={`${inpBase} w-32`} value={ist.arr} onChange={(e) => setIst({ ...ist, arr: e.target.value })} /></label>
            <label className="block"><span className={lbl}>{tx("Fertig um")}</span><input type="time" className={`${inpBase} w-32`} value={ist.fin} onChange={(e) => setIst({ ...ist, fin: e.target.value })} /></label>
            {ist.arr && ist.fin && ist.fin > ist.arr && <span className="pb-2 text-sm text-slate-600">{tx("= {0} Std. (geplant {1})", hm(toMin(ist.fin) - toMin(ist.arr)), hm(job.duration_min))}</span>}
          </div>
          {(job.outcome === "partial" || job.outcome === "completed" || job.overrun_reason) && <p className="mt-2 text-xs text-slate-600">{job.outcome === "partial" ? tx("Nicht fertig – Fortsetzung angelegt.") + " " : job.outcome === "completed" ? tx("Am ersten Tag nicht fertig – mit der Fortsetzung abgeschlossen.") + " " : ""}{job.overrun_reason ? tx("Grund: {0}", tx(job.overrun_reason)) : ""}</p>}
        </section>
      )}

      {closeOpen && (
        <section data-office-close className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="mb-1 text-sm font-semibold text-slate-800">{tx("Einsatz abschließen")}</div>
          <p className="mb-2 text-xs text-slate-600">{tx("Für Mitarbeitende, die nicht mit der App arbeiten: das Büro trägt das Ergebnis selbst ein.")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className={lbl}>{tx("Angekommen um")} <span className="font-normal text-slate-400">{tx("(optional)")}</span></span><input type="time" className={`${inpBase} w-32`} value={cl.arr} onChange={(e) => setCl({ ...cl, arr: e.target.value })} /></label>
            <label className="block"><span className={lbl}>{tx("Fertig um")} <span className="font-normal text-slate-400">{tx("(optional)")}</span></span><input type="time" className={`${inpBase} w-32`} value={cl.fin} onChange={(e) => setCl({ ...cl, fin: e.target.value })} /></label>
            {cl.arr && cl.fin && cl.fin > cl.arr && <span className="pb-2 text-sm text-slate-600">{tx("= {0} Std. (geplant {1})", hm(toMin(cl.fin) - toMin(cl.arr)), hm(job.duration_min))}</span>}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[["done", tx("Alles erledigt")], ["partial", tx("Nicht fertig – muss weitergehen")]].map(([k, t]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${cl.outcome === k ? (k === "done" ? "border-emerald-500 bg-white font-semibold" : "border-amber-500 bg-white font-semibold") : "border-slate-200 bg-white"}`}>
                <input type="radio" name="office-outcome" checked={cl.outcome === k} onChange={() => setCl({ ...cl, outcome: k })} />{t}
              </label>
            ))}
          </div>
          {cl.outcome === "partial" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <span className="pb-2 text-sm text-slate-700">{tx("Wie lange dauert es noch?")}</span>
              <label className="block"><span className={lbl}>{tx("Stunden")}</span><select className={`${inpBase} w-20`} value={cl.rh} onChange={(e) => setCl({ ...cl, rh: +e.target.value })}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>
              <label className="block"><span className={lbl}>{tx("Minuten")}</span><select className={`${inpBase} w-20`} value={cl.rm} onChange={(e) => setCl({ ...cl, rm: +e.target.value })}>{[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            </div>
          )}
          <label className="mt-3 block"><span className={lbl}>{cl.outcome === "partial" ? tx("Grund") : tx("Es hat länger gedauert – warum?")} <span className="font-normal text-slate-400">{tx("(optional)")}</span></span><input className={inp} maxLength={200} value={cl.reason} onChange={(e) => setCl({ ...cl, reason: e.target.value })} /></label>
          {cl.outcome === "partial" && <p className="mt-2 text-xs text-slate-600">{tx("Dienstigo legt eine Fortsetzung an. Sie erscheint unter „Bitte prüfen“ – dort den Termin mit dem Kunden einplanen.")}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={officeClose} disabled={busy}>{busy ? tx("Speichert …") : tx("Abschließen")}</button>
            <button type="button" className="text-sm text-slate-600 underline" onClick={() => setCloseOpen(false)}>{tx("Zurück")}</button>
          </div>
        </section>
      )}
      <Msg msg={msg} />
      <div className="tv-actions mt-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          {editing && job.status !== "cancelled" && !cancelOpen && <button type="button" className="text-sm text-rose-700 underline" onClick={() => setCancelOpen(true)}>{tx("Auftrag stornieren …")}</button>}
          {editing && job.status !== "cancelled" && job.status !== "done" && !cancelOpen && onAssign && <button type="button" className="ml-3 text-sm text-teal-700 underline" onClick={() => onAssign(job)}>{tx("Personal zuteilen")}</button>}
          {editing && ["new", "accepted"].includes(job.status) && !job.needs_confirm && job.work_date <= isoOf(new Date()) && !cancelOpen && !closeOpen && <button type="button" data-office-close-btn className="ml-3 text-sm font-semibold text-emerald-700 underline" onClick={() => { setCloseOpen(true); setMsg(null); }}>{tx("Einsatz abschließen …")}</button>}
          {editing && ["new", "accepted"].includes(job.status) && !cancelOpen && <button type="button" className="ml-3 text-sm text-slate-500 underline" onClick={() => deleteJob()} disabled={busy}>{tx("Löschen")}</button>}
          {cancelOpen && (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${inpBase} w-64`} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={tx("Grund, z. B. Kunde hat abgesagt")} autoFocus />
              <button type="button" className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={() => cancelJob()} disabled={busy}>{tx("Stornieren")}</button>
              <button type="button" className="text-sm text-slate-600 underline" onClick={() => setCancelOpen(false)}>{tx("Zurück")}</button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button>
          <button type="button" className={btnPrimary} onClick={() => save()} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button>
        </div>
      </div>
      {scopeFor && <ScopeModal kind={scopeFor} date={job.work_date} onClose={() => setScopeFor(null)} onPick={(v) => { const k = scopeFor; setScopeFor(null); if (k === "save") save(v); else if (k === "cancel") cancelJob(v); else deleteJob(v); }} />}
    </Modal>
  );
}

// ---------- D3c-2: regelmäßige Aufträge ----------
function RepeatFields({ value: r, onChange, date, anchor, noNone, noEnd, noTeam }) {
  const set = (k, v) => onChange({ ...r, [k]: v });
  const modes = [["none", "Nein"], ["week", "Jede Woche"], ["week2", "Alle 2 Wochen"], ["month", "Jeden Monat"]].filter(([k]) => !(noNone && k === "none"));
  const s = r.mode === "none" || !date ? null : { ...repRule(r), start_date: anchor || date, end_date: r.untilOn && r.until ? r.until : null };
  const next = s && (s.freq === "month" || s.weekdays.length) ? seriesNext(s, date, 4) : [];
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">🔁 {tx("Wiederholen")}</div>
      <div role="radiogroup" aria-label={tx("Wiederholen")} className="inline-flex flex-wrap overflow-hidden rounded-lg border border-slate-300 text-sm">
        {modes.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={r.mode === k} onClick={() => onChange({ ...r, mode: k, days: r.days.length ? r.days : [isoDow(date || isoOf(new Date()))] })} className={`px-3 py-1.5 ${r.mode === k ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{tx(l)}</button>)}
      </div>
      {r.mode !== "none" && (
        <div>
          {r.mode !== "month" && (
            <div className="mt-3"><div className={lbl}>{tx("An welchen Tagen?")}</div>
              <div className="flex flex-wrap gap-1.5">{WD_ISO.map((n) => { const on = r.days.includes(n); return <button key={n} type="button" aria-pressed={on} onClick={() => set("days", on ? r.days.filter((x) => x !== n) : [...r.days, n])} className={`h-9 min-w-[42px] rounded-full px-2 text-sm ${on ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{wdShort(n % 7)}</button>; })}</div>
            </div>
          )}
          {r.mode === "month" && <p className="mt-2 text-xs text-slate-600">{tx("Jeden Monat am selben Tag wie der erste Termin.")}</p>}
          {!noEnd && (
            <div className="mt-3"><div className={lbl}>{tx("Bis wann?")}</div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-1.5"><input type="radio" checked={!r.untilOn} onChange={() => onChange({ ...r, untilOn: false, until: "" })} />{tx("Ohne Ende")}</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={!!r.untilOn} onChange={() => set("untilOn", true)} />{tx("bis")}</label>
                {r.untilOn && <input type="date" className={inpBase} value={r.until} min={date} onChange={(e) => set("until", e.target.value)} aria-label={tx("bis")} />}
              </div>
            </div>
          )}
          {!noTeam && <label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!r.same} onChange={(e) => set("same", e.target.checked)} />{tx("Immer dasselbe Personal (wie beim ersten Termin)")}</label>}
          {next.length > 0 && <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{tx("Nächste Termine: {0}", next.map(dayLbl).join(", "))}{next.length === 4 ? " …" : ""}</div>}
        </div>
      )}
    </div>
  );
}

function ScopeModal({ kind, date, onPick, onClose }) {
  const [v, setV] = useState("one");
  const title = kind === "delete" ? tx("Regelmäßiger Termin – was löschen?") : kind === "cancel" ? tx("Regelmäßiger Termin – was absagen?") : tx("Regelmäßiger Termin – was ändern?");
  const card = (k, t, sub) => (
    <button type="button" role="radio" aria-checked={v === k} onClick={() => setV(k)} className={`block w-full rounded-xl p-3 text-left text-sm ${v === k ? "border-2 border-teal-500 bg-teal-50" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>
      <div className="font-semibold text-slate-800">{t}</div><div className="mt-0.5 text-xs text-slate-600">{sub}</div>
    </button>
  );
  return (
    <Modal title={title} onClose={onClose}>
      <div role="radiogroup" className="space-y-2">
        {card("one", tx("Nur diesen Termin"), tx("{0} – die anderen bleiben.", dayLbl(date)))}
        {card("all", tx("Diesen und alle folgenden"), tx("ab {0}", dayLbl(date)))}
      </div>
      <div className="tv-actions mt-4 flex justify-end gap-2">
        <button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button>
        <button type="button" className={btnPrimary} onClick={() => onPick(v)}>{tx("OK")}</button>
      </div>
    </Modal>
  );
}

function InformDialog({ title, phone, text: text0, onClose }) {
  const [text, setText] = useState(text0);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-600">{tx("Kunden kurz informieren (Text kann geändert werden):")}</p>
      <textarea rows={5} className={inp} value={text} onChange={(e) => setText(e.target.value)} aria-label={tx("Nachricht")} />
      {!phone && <p className="mt-2 text-sm text-slate-500">{tx("Für diesen Kunden ist keine Telefonnummer gespeichert.")}</p>}
      <div className="tv-actions mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={btnLight} onClick={onClose}>{tx("Schließen")}</button>
        {phone && <a href={`https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${btn} min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700`}>WhatsApp</a>}
      </div>
    </Modal>
  );
}

function SeriesDialog({ org, data, series: s, customer, onClose, onSaved }) {
  const today = isoOf(new Date());
  const [rep, setRep] = useState(() => repOf(s));
  const [f, setF] = useState({ start_time: hhmm(s.start_time), dh: Math.floor(s.duration_min / 60), dm: s.duration_min % 60, service_type_id: s.service_type_id || "", staff_needed: s.staff_needed, notes_staff: s.notes_staff || "" });
  const [team, setTeam] = useState(() => [...(s.staff_ids || [])]);
  const [from, setFrom] = useState(() => seriesNext(s, today)[0] || today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const old = repRule(repOf(s)); const nu = repRule(rep);
  const ruleChanged = old.freq !== nu.freq || old.every !== nu.every || old.weekdays.join() !== nu.weekdays.join();
  const duration = (+f.dh || 0) * 60 + (+f.dm || 0);
  const staff = data.staffList || [];
  async function save() {
    setMsg(null);
    if (!from) return setMsg({ kind: "err", text: tx("Bitte ein Datum wählen.") });
    if (nu.freq === "week" && !nu.weekdays.length) return setMsg({ kind: "err", text: tx("Bitte mindestens einen Tag wählen.") });
    if (!/^\d{2}:\d{2}$/.test(f.start_time)) return setMsg({ kind: "err", text: tx("Bitte die Uhrzeit für den Beginn eintragen.") });
    if (duration < 5) return setMsg({ kind: "err", text: tx("Bitte die Dauer eintragen.") });
    const p = {};
    if (ruleChanged) Object.assign(p, nu);
    if (f.start_time !== hhmm(s.start_time)) p.start_time = f.start_time;
    if (duration !== s.duration_min) p.duration_min = duration;
    if ((f.service_type_id || "") !== (s.service_type_id || "")) p.service_type_id = f.service_type_id || "";
    const st = Math.max(1, Math.min(50, parseInt(f.staff_needed, 10) || 1)); if (st !== s.staff_needed) p.staff_needed = st;
    if ((clean(f.notes_staff) || "") !== (s.notes_staff || "")) p.notes_staff = clean(f.notes_staff) || "";
    if ([...team].sort().join() !== [...(s.staff_ids || [])].sort().join()) p.staff_ids = team;
    if (!Object.keys(p).length) { onClose(); return; }
    setBusy(true);
    const res = await org.supabase.rpc("touren_series_change", { p_series: s.id, p_from: from, p });
    if (res.error) { setBusy(false); setMsg({ kind: "err", text: errText(res.error) }); return; }
    const ns = { ...s, ...nu, start_time: f.start_time, duration_min: duration, start_date: ruleChanged ? from : s.start_date };
    const first = seriesNext(ns, from)[0];
    const inform = (ruleChanged || p.start_time) && first ? tx("Hallo {0}, ab {1} finden Ihre Termine {2} um {3} Uhr statt (bisher {4} um {5} Uhr). Passt das für Sie?", customer.name, dmy(dateOf(first)), ruleSentence(ns), f.start_time, ruleSentence(s), hhmm(s.start_time)) : null;
    onSaved(tx("Regelmäßiger Termin geändert ✓"), inform);
  }
  return (
    <Modal title={tx("Regelmäßigen Termin bearbeiten")} onClose={onClose} wide>
      <RepeatFields value={rep} onChange={setRep} date={from} anchor={ruleChanged ? from : s.start_date} noNone noEnd noTeam />
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="block"><span className={lbl}>{tx("Beginn")}</span><input type="time" className={inp} value={f.start_time} onChange={(e) => set("start_time", e.target.value)} step="300" /></label>
        <div><span className={lbl}>{tx("Dauer")}</span>
          <div className="flex gap-1">
            <select className={inp} value={f.dh} onChange={(e) => set("dh", +e.target.value)} aria-label={tx("Stunden")}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{getLang() === "en" ? `${i} h` : `${i} Std.`}</option>)}</select>
            <select className={inp} value={f.dm} onChange={(e) => set("dm", +e.target.value)} aria-label={tx("Minuten")}>{[0, 15, 30, 45].map((m) => <option key={m} value={m}>{getLang() === "en" ? `${m} min` : `${m} Min.`}</option>)}</select>
          </div>
        </div>
        <label className="block"><span className={lbl}>{tx("Leistung")}</span>
          <select className={inp} value={f.service_type_id} onChange={(e) => set("service_type_id", e.target.value)}><option value="">{tx("– keine Angabe –")}</option>{data.services.filter((x) => x.active || x.id === f.service_type_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="block"><span className={lbl}>{tx("Anzahl Personal")}</span><input type="number" min="1" max="50" className={inp} value={f.staff_needed} onChange={(e) => set("staff_needed", e.target.value)} /></label>
      </div>
      <div className="mt-4"><div className={lbl}>{tx("Festes Personal")}</div>
        <div className="flex flex-wrap gap-1.5">{staff.map((x) => { const on = team.includes(x.id); return <button key={x.id} type="button" aria-pressed={on} onClick={() => setTeam(on ? team.filter((y) => y !== x.id) : [...team, x.id])} className={`rounded-full px-3 py-1.5 text-sm ${on ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{x.name}</button>; })}</div>
        <p className="mt-1 text-[11px] text-slate-500">{tx("Ohne Auswahl wird das Personal bei jedem Termin einzeln zugeteilt.")}</p>
      </div>
      <label className="mt-4 block"><span className={lbl}>{tx("Hinweise für Mitarbeitende")}</span><textarea rows={2} className={inp} value={f.notes_staff} onChange={(e) => set("notes_staff", e.target.value)} /></label>
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <label className="block"><span className={lbl}>{tx("Gilt ab")}</span><input type="date" className={inpBase} value={from} min={today} onChange={(e) => setFrom(e.target.value)} /></label>
        <p className="mt-1 text-[11px] text-slate-500">{tx("Frühere und schon begonnene Termine bleiben, wie sie sind.")}</p>
      </div>
      <Msg msg={msg} />
      <div className="tv-actions mt-4 flex justify-end gap-2">
        <button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button>
        <button type="button" className={btnPrimary} onClick={save} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button>
      </div>
    </Modal>
  );
}

function SeriesSection({ org, data, customer, onChanged, onNew }) {
  const today = isoOf(new Date());
  const [list, setList] = useState(null);
  const [nextOf, setNextOf] = useState({});
  const [form, setForm] = useState(null); // { id, kind: pause|end, from, until, reason, last }
  const [edit, setEdit] = useState(null);
  const [inform, setInform] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const sb = org.supabase;
  const load = useCallback(async () => {
    const r = await sb.from("job_series").select("*").eq("org_id", org.orgId).eq("customer_id", customer.id).order("created_at");
    const rows = r.error ? [] : r.data || [];
    setList(rows);
    if (rows.length) {
      const j = await sb.from("jobs").select("series_id, work_date, start_time").in("series_id", rows.map((x) => x.id)).gte("work_date", today).neq("status", "cancelled").order("work_date").order("start_time");
      const m = {}; (j.data || []).forEach((x) => { if (!m[x.series_id]) m[x.series_id] = x.work_date; }); setNextOf(m);
    }
  }, [sb, org.orgId, customer.id, today]);
  useEffect(() => { load(); }, [load]);
  const nameOf = (id) => ((data.staffList || []).find((x) => x.id === id) || {}).name || "?";
  const done = async (text, inf) => { setForm(null); setEdit(null); setBusy(false); await load(); onChanged(text); if (inf) setInform(inf); };
  async function run(rpc, args, text, inf) {
    setBusy(true); setMsg(null);
    const r = await sb.rpc(rpc, args);
    if (r.error) { setBusy(false); setMsg({ kind: "err", text: errText(r.error) }); return; }
    await done(text, inf);
  }
  function savePause(s) {
    if (!form.from || !form.until || form.until < form.from) return setMsg({ kind: "err", text: tx("Bitte den Zeitraum prüfen.") });
    const nx = seriesNext({ ...s, pause_from: null, pause_until: null }, addDays(form.until, 1))[0];
    const t = nx ? tx("Hallo {0}, wie besprochen pausieren wir Ihre regelmäßigen Termine bis {1}. Der nächste Termin ist dann am {2} um {3} Uhr. Bei Fragen melden Sie sich gern.", customer.name, dmy(dateOf(form.until)), `${wdLong(dateOf(nx).getDay())}, ${dmy(dateOf(nx))}`, hhmm(s.start_time)) : null;
    return run("touren_series_pause", { p_series: s.id, p_from: form.from, p_until: form.until, p_reason: clean(form.reason) }, tx("Pausiert bis {0} ✓", dmy(dateOf(form.until))), t && { title: tx("Pausiert"), text: t });
  }
  function saveEnd(s) {
    if (!form.last) return setMsg({ kind: "err", text: tx("Bitte ein Datum wählen.") });
    const last = seriesLast(s, form.last);
    return run("touren_series_end", { p_series: s.id, p_last: form.last }, tx("Regelmäßiger Termin beendet ✓"),
      { title: tx("Beendet"), text: tx("Hallo {0}, wie besprochen ist Ihr letzter regelmäßiger Termin am {1}. Vielen Dank für Ihr Vertrauen – wir sind jederzeit gern wieder für Sie da.", customer.name, dmy(dateOf(last))) });
  }
  const small = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50";
  return (
    <section className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-700">🔁 {tx("Regelmäßige Termine")}</h3><button type="button" className={btnLight} onClick={onNew}><Plus size={15} />{tx("Regelmäßiger Termin")}</button></div>
      {list === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : list.length === 0 ? <p className="text-sm text-slate-500">{tx("Noch keine regelmäßigen Termine.")}</p> : (
        <div className="space-y-2">
          {list.map((s) => {
            const ended = s.end_date && s.end_date < today; const paused = !ended && s.pause_from && s.pause_until && s.pause_until >= today;
            const svc = data.services.find((x) => x.id === s.service_type_id);
            const info = [svc && svc.name, (s.staff_ids || []).length ? (s.staff_ids || []).map(nameOf).join(", ") : null].filter(Boolean).join(" · ");
            return (
              <div key={s.id} className={`rounded-xl p-3 ${ended ? "border border-slate-200 bg-slate-50 opacity-60" : paused ? "border border-dashed border-slate-300 bg-slate-50" : "border border-slate-200 bg-white"}`}>
                <div className={`text-sm font-medium ${paused ? "text-slate-500" : "text-slate-800"}`}>{ruleText(s)}</div>
                {info && <div className="text-xs text-slate-500">{info}</div>}
                <div className="mt-0.5 text-xs">
                  {ended ? <span className="text-slate-500">{tx("beendet am {0}", isoDmy(s.end_date))}</span>
                    : paused ? <span className="font-medium text-amber-700">{tx("pausiert bis {0}", isoDmy(s.pause_until))}{s.pause_reason ? ` (${s.pause_reason})` : ""}{s.end_date ? ` · ${tx("endet am {0}", isoDmy(s.end_date))}` : ""}</span>
                    : <span className="text-slate-600">{nextOf[s.id] ? tx("nächster Termin: {0}", dayLbl(nextOf[s.id])) : ""}{s.end_date ? `${nextOf[s.id] ? " · " : ""}${tx("endet am {0}", isoDmy(s.end_date))}` : ""}</span>}
                </div>
                {!ended && (!form || form.id !== s.id) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {paused ? <button type="button" className={`${small} border-teal-300 text-teal-700`} disabled={busy} onClick={() => run("touren_series_pause", { p_series: s.id, p_from: null, p_until: null, p_reason: null }, tx("Pause aufgehoben ✓"))}>▶ {tx("Fortsetzen")}</button>
                      : <button type="button" className={`${small} border-slate-300 text-slate-700`} onClick={() => { setMsg(null); setForm({ id: s.id, kind: "pause", from: addDays(today, 1), until: "", reason: "" }); }}>⏸ {tx("Pausieren")}</button>}
                    <button type="button" className={`${small} border-slate-300 text-slate-700`} onClick={() => setEdit(s)}>{tx("Bearbeiten")}</button>
                    <button type="button" className={`${small} border-rose-200 text-rose-700`} onClick={() => { setMsg(null); setForm({ id: s.id, kind: "end", last: today }); }}>{tx("Beenden")}</button>
                  </div>
                )}
                {form && form.id === s.id && form.kind === "pause" && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block"><span className={lbl}>{tx("Von")}</span><input type="date" className={inpBase} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
                      <label className="block"><span className={lbl}>{tx("Bis")}</span><input type="date" className={inpBase} value={form.until} min={form.from} onChange={(e) => setForm({ ...form, until: e.target.value })} /></label>
                      <label className="block flex-1"><span className={lbl}>{tx("Grund (optional)")}</span><input className={inp} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={tx("z. B. Urlaub")} maxLength={200} /></label>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">{tx("Die Termine in dieser Zeit werden entfernt. Danach geht es automatisch weiter.")}</p>
                    <div className="mt-2 flex gap-2"><button type="button" className={btnPrimary} disabled={busy} onClick={() => savePause(s)}>{tx("Pausieren")}</button><button type="button" className={btnLight} onClick={() => setForm(null)}>{tx("Abbrechen")}</button></div>
                  </div>
                )}
                {form && form.id === s.id && form.kind === "end" && (
                  <div className="mt-2 rounded-lg bg-rose-50/60 p-2.5">
                    <label className="block"><span className={lbl}>{tx("Letzter Tag")}</span><input type="date" className={inpBase} value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} /></label>
                    <p className="mt-1.5 text-[11px] text-slate-500">{tx("Spätere Termine werden entfernt. Frühere bleiben in der Liste des Kunden.")}</p>
                    <div className="mt-2 flex gap-2"><button type="button" className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} disabled={busy} onClick={() => saveEnd(s)}>{tx("Beenden")}</button><button type="button" className={btnLight} onClick={() => setForm(null)}>{tx("Abbrechen")}</button></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Msg msg={msg} />
      {edit && <SeriesDialog org={org} data={data} series={edit} customer={customer} onClose={() => setEdit(null)} onSaved={(t, inf) => done(t, inf && { title: tx("Geändert"), text: inf })} />}
      {inform && <InformDialog title={inform.title} phone={customer.phone} text={inform.text} onClose={() => setInform(null)} />}
    </section>
  );
}

// ---------- Personal zuteilen (D3b) ----------
function AssignPanel({ org, job, data, onClose, onChanged, onTeamAll }) {
  const sb = org.supabase;
  const [ctx, setCtx] = useState(null);
  const [dayJobs, setDayJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const [c, j] = await Promise.all([
      sb.rpc("touren_day_context", { p_org: org.orgId, p_day: job.work_date }),
      sb.from("jobs").select("*").eq("org_id", org.orgId).eq("work_date", job.work_date).order("start_time"),
    ]);
    if (c.error || j.error) { setMsg({ kind: "err", text: errText(c.error || j.error) }); setCtx({ staff: [], assign: [], history: [], settings: DEFAULT_SETTINGS }); return; }
    setCtx(c.data); setDayJobs(j.data || []);
  }, [sb, org.orgId, job.work_date]);
  useEffect(() => { load(); }, [load]);

  const cur = dayJobs.find((x) => x.id === job.id) || job;
  const required = data.serviceSkills.filter((x) => x.service_type_id === cur.service_type_id).map((x) => x.skill_id);
  const skillName = (id) => (data.skills.find((k) => k.id === id) || {}).name || "?";
  const custOf = (id) => custName(data.customers.find((c) => c.id === id));
  const rows = ctx ? suggestStaff({ job: cur, dayJobs, assign: ctx.assign || [], staff: ctx.staff || [], settings: ctx.settings, history: ctx.history || [], prefs: data.prefs, requiredSkills: required }) : [];
  const have = rows.filter((r) => r.here && !(r.blocked && r.blocked.kind === "absent")).length;
  const firstFree = rows.find((r) => !r.here && !r.blocked);

  async function add(r) {
    setBusy(true); setMsg(null);
    const res = await sb.from("job_staff").insert({ job_id: cur.id, staff_id: r.staff.id, org_id: org.orgId });
    setBusy(false);
    if (res.error) return setMsg({ kind: "err", text: errText(res.error) });
    setMsg({ kind: "ok", text: tx("{0} zugeteilt ✓", r.staff.name) });
    await load(); onChanged();
  }
  async function remove(r) {
    setBusy(true); setMsg(null);
    const res = await sb.from("job_staff").delete().eq("job_id", cur.id).eq("staff_id", r.staff.id);
    setBusy(false);
    if (res.error) return setMsg({ kind: "err", text: errText(res.error) });
    setMsg({ kind: "ok", text: tx("{0} entfernt", r.staff.name) });
    await load(); onChanged();
  }
  const fromTxt = (r) => {
    if (!r.from) return tx("ohne Startpunkt");
    if (r.from.kind === "job") return tx("ab {0} (bis {1})", custOf(r.from.job.customer_id), r.from.until);
    return tx("ab {0}", r.from.label === "home" ? tx("Zuhause") : r.from.label);
  };
  return (
    <Modal title={tx("Personal zuteilen")} onClose={onClose} wide>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <div className="font-semibold text-slate-800">{wdShort(dateOf(cur.work_date).getDay())} {isoDmy(cur.work_date)} · {hhmm(cur.start_time)}–{endOf(cur.start_time, cur.duration_min)} · {custOf(cur.customer_id)}</div>
        <div className="text-xs text-slate-600">{cur.address_text}</div>
        <div className={`mt-1 text-sm font-medium ${have >= cur.staff_needed ? "text-emerald-700" : "text-rose-700"}`}>{tx("Personal: {0}/{1}", have, cur.staff_needed)}{required.length ? <span className="ml-2 text-xs font-normal text-slate-500">{tx("nötig: {0}", required.map(skillName).join(", "))}</span> : null}</div>
      </div>
      {!ctx ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : rows.length === 0 ? <p className="text-sm text-slate-500">{tx("Noch keine Mitarbeitenden. Inhaber oder Leitung legt sie unter „Mitarbeitende“ an.")}</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.staff.id} className={`rounded-xl border px-3 py-2 ${r.here ? "border-emerald-300 bg-emerald-50/60" : r.blocked ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{r.staff.name}
                    {r === firstFree && have < cur.staff_needed ? <span className="ml-2 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">{tx("Vorschlag")}</span> : null}
                    {r.preferred ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">{tx("vom Kunden bevorzugt")}</span> : null}
                  </div>
                  {r.blocked ? (
                    <div className="text-xs text-slate-600">{r.blocked.kind === "absent" ? tx("abwesend") : r.blocked.kind === "excluded" ? tx("Kunde: bitte nicht") : tx("schon eingeteilt {0}–{1} ({2})", r.blocked.from, r.blocked.to, custOf(r.blocked.job.customer_id))}</div>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 text-xs text-slate-600">
                      <span>{r.km === null ? tx("Entfernung unbekannt") : tx("{0} km", String(r.km).replace(".", getLang() === "en" ? "." : ","))} · {fromTxt(r)}</span>
                      <span>{r.pct === null ? tx("ohne Vertragsstunden") : tx("{0} % der Vertragsstunden", Math.round(r.pct))}{r.staff.hours !== null && r.staff.hours !== undefined && r.staff.target ? ` (${dec(r.staff.hours)} / ${dec(r.staff.target)} ${tx("Std.")})` : ""}</span>
                      {r.visits > 0 && <span>{tx("schon {0}× bei diesem Kunden", r.visits)}</span>}
                      {r.braked && <span className="text-amber-700">{tx("nah, aber schon mehr gearbeitet als andere")}</span>}
                    </div>
                  )}
                  {r.warns.map((w, i) => (
                    <div key={i} className="text-xs text-amber-700">⚠ {w.kind === "skill" ? tx("Fähigkeit fehlt: {0}", w.missing.map(skillName).join(", ")) : w.kind === "tight" ? tx("knapp: nur {0} Min. nach dem Einsatz davor", w.minutes) : tx("knapp: nur {0} Min. bis zum nächsten Einsatz", w.minutes)}</div>
                  ))}
                </div>
                {r.here ? <button type="button" className={btnLight} onClick={() => remove(r)} disabled={busy}>{tx("Entfernen")}</button>
                  : !r.blocked ? <button type="button" className={btnPrimary} onClick={() => add(r)} disabled={busy}>{tx("Zuteilen")}</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Msg msg={msg} />
      <p className="mt-3 text-[11px] text-slate-500">{tx("Reihenfolge: vom Kunden bevorzugt → in der Nähe (erster Einsatz ab Startpunkt, sonst ab dem Einsatz davor), solange die Person nicht schon deutlich mehr gearbeitet hat → wer im Verhältnis zu den Vertragsstunden weniger gearbeitet hat. Sie entscheiden.")}</p>
      {job.__team && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">🔁 {tx("Dieses Personal gilt dann für alle Termine dieser Reihe.")}</p>}
      <div className="tv-actions mt-4 flex flex-wrap items-center justify-end gap-2">
        {job.series_id && !job.__team && onTeamAll && <button type="button" className="mr-auto text-sm text-teal-700 underline" onClick={onTeamAll}>🔁 {tx("Für alle folgenden Termine übernehmen")}</button>}
        <button type="button" className={btnPrimary} onClick={onClose}>{tx("Fertig")}</button>
      </div>
    </Modal>
  );
}

// ---------- Abwesend: betroffene Aufträge (Krankmeldung aus der App oder von der Leitung eingetragen) ----------
function ConflictBox({ items, onReplace, onReplaceAll, busy, attention, onOpenJob, onPlan }) {
  const over = (attention && attention.overrun) || [], conf = (attention && attention.confirm) || [];
  if (!items.length && !over.length && !conf.length) return null;
  const n = items.length + over.length + conf.length;
  const row = "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-sm text-rose-900";
  return (
    <div role="alert" className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-3">
      <div className="mb-1.5 text-sm font-semibold text-rose-800">⚠ {tx("Bitte prüfen ({0})", n)}</div>
      <ul className="space-y-1.5">
        {over.map((o) => (
          <li key={"o" + o.job_id} className={row}>
            <span><b>{(o.staff || []).join(", ")}</b> · {o.customer} · {tx("läuft länger (+{0})", hm(o.over_min))}{o.next ? ` · ${tx("danach {0} {1} – wird knapp", o.next.start, o.next.customer)}` : ""}</span>
            <button type="button" className={btnPrimary} onClick={() => onOpenJob(o.job_id)}>{tx("Ansehen")}</button>
          </li>
        ))}
        {conf.map((c) => (
          <li key={"c" + c.job_id} className={row}>
            <span><b>{c.customer}</b> · {tx("nicht fertig – Fortsetzung ({0}) braucht einen Termin", durTxt(c.duration_min).trim())}</span>
            <button type="button" className={btnPrimary} onClick={() => onPlan(c.job_id)}>{tx("Einplanen")}</button>
          </li>
        ))}
        {[...new Set(items.map((c) => c.staff_id))].map((sid) => { const g = items.filter((c) => c.staff_id === sid); return (
          <React.Fragment key={sid}>
            {g.length > 1 && onReplaceAll && (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm text-rose-900">
                <span><b>{g[0].staff_name}</b> {tx("abwesend – {0} Aufträge ({1} – {2})", g.length, dayLbl(g[0].work_date), dayLbl(g[g.length - 1].work_date))}</span>
                <button type="button" className={btnPrimary} onClick={() => onReplaceAll(g)} disabled={busy}>{tx("Ersatz für alle Tage")}</button>
              </li>
            )}
            {g.map((c) => (
              <li key={`${c.job_id}|${c.staff_id}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-sm text-rose-900 ${g.length > 1 && onReplaceAll ? "ml-4" : ""}`}>
                <span>{g.length > 1 && onReplaceAll ? null : <b>{c.staff_name} </b>}{g.length > 1 && onReplaceAll ? null : `${tx("abwesend – Ersatz nötig")} · `}{wdShort(dateOf(c.work_date).getDay())} {dm(dateOf(c.work_date))} {c.start_time} · {c.customer}</span>
                <button type="button" className={g.length > 1 && onReplaceAll ? btnLight : btnPrimary} onClick={() => onReplace(c)} disabled={busy}>{tx("Ersatz finden")}</button>
              </li>
            ))}
          </React.Fragment>
        ); })}
      </ul>
      {items.length > 0 && <p className="mt-1.5 text-[11px] text-rose-700">{tx("„Ersatz finden“ nimmt die Person aus dem Auftrag und zeigt gleich die besten Vorschläge.")}</p>}
    </div>
  );
}

// ---------- Abwesend mehrere Tage: einen Ersatz für alle betroffenen Aufträge (24.11.2026) ----------
function BulkReplaceDialog({ org, data, person, items, onClose, onDone, onReplaceOne }) {
  const sb = org.supabase;
  const [cands, setCands] = useState(null); // [{ staff, free: [job_id], warn }]
  const [pick, setPick] = useState(null);
  const [result, setResult] = useState(null); // { ok: [item], fail: [item] }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const days = [...new Set(items.map((c) => c.work_date))].sort();
  useEffect(() => {
    let alive = true;
    (async () => {
      const ctxs = await Promise.all(days.map((d) => Promise.all([
        sb.rpc("touren_day_context", { p_org: org.orgId, p_day: d }),
        sb.from("jobs").select("*").eq("org_id", org.orgId).eq("work_date", d).order("start_time"),
      ])));
      const agg = {};
      ctxs.forEach(([c, j], i) => {
        if (c.error || j.error) return;
        const dayJobs = j.data || [];
        items.filter((it) => it.work_date === days[i]).forEach((it) => {
          const job = dayJobs.find((x) => x.id === it.job_id); if (!job) return;
          const required = data.serviceSkills.filter((x) => x.service_type_id === job.service_type_id).map((x) => x.skill_id);
          suggestStaff({ job, dayJobs, assign: c.data.assign || [], staff: c.data.staff || [], settings: c.data.settings, history: c.data.history || [], prefs: data.prefs, requiredSkills: required })
            .forEach((r, rank) => {
              if (r.staff.id === person.staff_id) return;
              const a = agg[r.staff.id] || (agg[r.staff.id] = { staff: r.staff, free: [], rank: 0, warn: {} });
              a.rank += rank;
              if (!r.blocked && !r.here) { a.free.push(it.job_id); r.warns.forEach((w) => { a.warn[w.kind === "skill" ? "skill" : "tight"] = 1; }); }
            });
        });
      });
      const list = Object.values(agg).filter((a) => a.free.length).sort((a, b) => b.free.length - a.free.length || a.rank - b.rank);
      if (alive) { setCands(list); setPick(list.length ? list[0].staff.id : null); }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    const c = cands.find((x) => x.staff.id === pick); if (!c) return;
    setBusy(true); setMsg(null);
    const ok = [], fail = [];
    for (const it of items) {
      if (!c.free.includes(it.job_id)) { fail.push(it); continue; }
      const ins = await sb.from("job_staff").insert({ job_id: it.job_id, staff_id: c.staff.id, org_id: org.orgId });
      if (ins.error) { fail.push(it); continue; }
      await sb.from("job_staff").delete().eq("job_id", it.job_id).eq("staff_id", person.staff_id);
      ok.push(it);
    }
    setBusy(false);
    setResult({ name: c.staff.name, ok, fail });
    onDone();
  }
  const when = (it) => `${dayLbl(it.work_date)} ${it.start_time} · ${it.customer}`;
  return (
    <Modal title={tx("Ersatz für {0}", person.staff_name)} onClose={onClose}>
      {result ? (
        <div className="space-y-3">
          {result.ok.length > 0 && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><b>✓ {tx("{0} übernimmt {1} Aufträge:", result.name, result.ok.length)}</b><ul className="mt-1 list-disc pl-5 text-xs">{result.ok.map((it) => <li key={it.job_id}>{when(it)}</li>)}</ul></div>}
          {result.fail.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><b>⚠ {tx("Hier hat {0} keine Zeit – bitte einzeln wählen:", result.name)}</b>
              <ul className="mt-2 space-y-1.5">{result.fail.map((it) => <li key={it.job_id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{when(it)}</span><button type="button" className={btnLight} onClick={() => onReplaceOne(it)}>{tx("Ersatz finden")}</button></li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-500">{tx("Nach der Abwesenheit ist {0} automatisch wieder eingeteilt (bei regelmäßigen Terminen).", person.staff_name)}</p>
          <div className="tv-actions flex justify-end"><button type="button" className={btnPrimary} onClick={onClose}>{tx("Fertig")}</button></div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-slate-600">{tx("{0} ist abwesend und hat {1} Aufträge ({2} – {3}). Wer übernimmt alle?", person.staff_name, items.length, dayLbl(days[0]), dayLbl(days[days.length - 1]))}</p>
          {cands === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : cands.length === 0 ? <p className="text-sm text-slate-500">{tx("Niemand ist an diesen Tagen frei – bitte einzeln wählen.")}</p> : (
            <div role="radiogroup" className="space-y-1.5">
              {cands.slice(0, 8).map((c) => { const all = c.free.length === items.length; return (
                <button key={c.staff.id} type="button" role="radio" aria-checked={pick === c.staff.id} onClick={() => setPick(c.staff.id)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${pick === c.staff.id ? "border-2 border-teal-500 bg-teal-50" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <span className="font-medium text-slate-800">{c.staff.name}</span>
                  <span className={`text-xs ${all ? "text-emerald-700" : "text-amber-700"}`}>{all ? tx("frei für alle {0}", items.length) : tx("frei für {0} von {1}", c.free.length, items.length)}{Object.keys(c.warn).map((k) => ` · ⚠ ${k === "skill" ? tx("Fähigkeit fehlt") : tx("knappe Zeit")}`).join("")}</span>
                </button>
              ); })}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">{tx("Reihenfolge wie bei „Personal zuteilen“. Wo die Person keine Zeit hat, bleibt der Auftrag in „Bitte prüfen“.")}</p>
          <Msg msg={msg} />
          <div className="tv-actions mt-4 flex justify-end gap-2">
            <button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button>
            <button type="button" className={btnPrimary} onClick={apply} disabled={busy || !pick}>{busy ? tx("Speichert …") : tx("Für alle übernehmen")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AbsenceDialog({ org, person, onClose, onSaved }) {
  const today = isoOf(new Date());
  const [types, setTypes] = useState(null);
  const [f, setF] = useState({ type: "", from: today, to: today, note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let alive = true;
    org.supabase.from("request_types").select("key, label, active, sort_order").eq("org_id", org.orgId).order("sort_order").then(({ data: rows }) => {
      if (!alive) return;
      const list = (rows || []).filter((x) => x.active);
      setTypes(list);
      const def = list.find((x) => x.key === "krank_ohne") || list.find((x) => x.key === "krank") || list[0];
      setF((p) => ({ ...p, type: def ? def.key : "" }));
    });
    return () => { alive = false; };
  }, [org]);
  async function save() {
    setMsg(null);
    if (!f.type) return setMsg({ kind: "err", text: tx("Bitte einen Grund wählen.") });
    if (!f.from || !f.to || f.to < f.from) return setMsg({ kind: "err", text: tx("Bitte den Zeitraum prüfen.") });
    setBusy(true);
    const r = await org.supabase.rpc("touren_report_absence", { p_org: org.orgId, p_staff: person.id, p_type: f.type, p_from: f.from, p_to: f.to, p_note: f.note });
    setBusy(false);
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    onSaved(tx("{0}: abwesend eingetragen ✓", person.name));
  }
  return (
    <Modal title={tx("Abwesend melden – {0}", person.name)} onClose={onClose}>
      {types === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : (
        <div className="space-y-3">
          <label className="block"><span className={lbl}>{tx("Grund")}</span>
            <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {types.map((t) => <option key={t.key} value={t.key}>{tx(t.label)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>{tx("Von")}</span><input type="date" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /></label>
            <label className="block"><span className={lbl}>{tx("Bis")}</span><input type="date" className={inp} value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          </div>
          <label className="block"><span className={lbl}>{tx("Notiz (optional)")}</span><input className={inp} value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={tx("z. B. hat angerufen")} /></label>
          <p className="text-[11px] text-slate-500">{tx("Gilt sofort. Betroffene Aufträge erscheinen unter „Aufträge“ mit „Ersatz finden“. Die Person sieht es in ihrer App unter „Anträge“. Den Grund sehen nur Inhaber und Leitung. Rückgängig: „Anträge“ → „Stornieren“.")}</p>
          <Msg msg={msg} />
          <div className="tv-actions flex justify-end gap-2"><button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button><button type="button" className={btnPrimary} onClick={save} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button></div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Fortsetzung einplanen (D3c-1): eigenes Fenster – erst mit dem Kunden klären, dann bestätigen ----------
function ContinuationDialog({ org, data, job, onClose, onSaved, onAssign }) {
  const sb = org.supabase;
  const c = data.customers.find((x) => x.id === job.customer_id);
  const [parent, setParent] = useState(null);
  const [teamIds, setTeamIds] = useState([]);
  const [dayJobs, setDayJobs] = useState(null); // Aufträge des Teams am gewählten Tag: [{ id, start, dur, customer_id, staff: [ids] }]
  const [f, setF] = useState({ work_date: job.work_date, start_time: hhmm(job.start_time), duration_min: job.duration_min });
  const [who, setWho] = useState(null); // "team" | "other" | "free" | "shift"
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [moved, setMoved] = useState(null); // nach „Folgendes verschieben“: Kunden zum Benachrichtigen
  const nameOf = (id) => (data.staffList.find((s) => s.id === id) || {}).name || "?";
  useEffect(() => {
    let alive = true;
    if (job.parent_job_id) {
      sb.from("jobs").select("job_no, work_date, start_time, duration_min").eq("id", job.parent_job_id).maybeSingle().then((r) => { if (alive && !r.error) setParent(r.data); });
      sb.from("job_staff").select("staff_id").eq("job_id", job.parent_job_id).then((r) => { if (alive && !r.error) setTeamIds((r.data || []).map((x) => x.staff_id)); });
    }
    return () => { alive = false; };
  }, [sb, job]);
  // Aufträge des Teams am gewählten Tag (ohne diese Fortsetzung)
  useEffect(() => {
    let alive = true;
    if (!teamIds.length || !f.work_date) { setDayJobs([]); return undefined; }
    (async () => {
      const js = await sb.from("jobs").select("id, start_time, duration_min, customer_id, status").eq("org_id", org.orgId).eq("work_date", f.work_date);
      const list = ((!js.error && js.data) || []).filter((j) => j.id !== job.id && j.status !== "cancelled");
      const xs = list.length ? await sb.from("job_staff").select("job_id, staff_id").in("job_id", list.map((j) => j.id)) : { data: [] };
      if (!alive) return;
      const by = {}; ((xs && xs.data) || []).forEach((x) => { (by[x.job_id] = by[x.job_id] || []).push(x.staff_id); });
      setDayJobs(list.map((j) => ({ id: j.id, start: toMin(j.start_time), dur: j.duration_min, customer_id: j.customer_id, staff: by[j.id] || [] }))
        .filter((j) => j.staff.some((s) => teamIds.includes(s))).sort((a, b) => a.start - b.start));
    })();
    return () => { alive = false; };
  }, [sb, org.orgId, job.id, teamIds, f.work_date]);

  const S = toMin(f.start_time || "0:0"), D = Number(f.duration_min) || 0;
  const overlaps = (a, b) => a.start < b.start + b.dur && b.start < a.start + a.dur;
  const clash = (dayJobs || []).filter((j) => overlaps(j, { start: S, dur: D }));
  const teamFree = teamIds.length > 0 && dayJobs !== null && clash.length === 0;
  // erste freie Zeit für das ganze Team ab der gewünschten Uhrzeit (bis 22:00, 15-Min.-Schritte)
  const firstFree = (() => { if (!dayJobs) return null; for (let t = S; t + D <= 22 * 60; t += 15) if (!dayJobs.some((j) => overlaps(j, { start: t, dur: D }))) return t; return null; })();
  // „Folgendes verschieben“: Fortsetzung bleibt, spätere Aufträge des Teams rücken nach hinten
  const shiftPlan = (() => {
    if (!dayJobs) return [];
    let cursor = S + D; const out = [];
    dayJobs.filter((j) => j.start + j.dur > S).forEach((j) => { if (j.start < cursor) { out.push({ ...j, to: cursor }); cursor += j.dur; } else cursor = Math.max(cursor, j.start + j.dur); });
    return out;
  })();
  const mm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  useEffect(() => { if (dayJobs !== null) setWho((w) => (w && (w === "other" || (w === "team" && teamFree) || (w !== "team" && !teamFree)) ? w : teamFree ? "team" : "other")); }, [dayJobs, teamFree]);

  const d = dateOf(f.work_date || job.work_date);
  const text = tx("Hallo {0}, die Arbeit konnte am {1} nicht ganz fertig werden. Passt es Ihnen, wenn wir am {2} um {3} Uhr weitermachen (ca. {4})?",
    c ? c.name : "", parent ? dmy(dateOf(parent.work_date)) : "", `${wdLong(d.getDay())}, ${dmy(d)}`, who === "free" && firstFree !== null ? mm(firstFree) : f.start_time, durTxt(D).trim());
  const durOpts = []; for (let m = 15; m <= 600; m += 15) durOpts.push(m); if (!durOpts.includes(D)) durOpts.push(D);

  async function assignTeam(jobId) {
    for (const sid of teamIds) {
      const r = await sb.from("job_staff").insert({ org_id: org.orgId, job_id: jobId, staff_id: sid });
      if (r.error) return r.error;
    }
    return null;
  }
  async function save(confirm) {
    setMsg(null);
    if (!f.work_date || !f.start_time) return setMsg({ kind: "err", text: tx("Bitte Datum und Uhrzeit angeben.") });
    if (confirm && who === "free" && firstFree === null) return setMsg({ kind: "err", text: tx("An diesem Tag ist das Team nicht mehr frei – bitte einen anderen Tag oder „Jemand anderes“ wählen.") });
    setBusy(true);
    const start = confirm && who === "free" ? mm(firstFree) : f.start_time;
    const row = { work_date: f.work_date, start_time: start, duration_min: D };
    if (confirm) Object.assign(row, { needs_confirm: false, status: "accepted" });
    let err = null; const movedList = [];
    if (confirm && who === "shift") { // spätere zuerst verschieben, dann die Fortsetzung
      for (const j of [...shiftPlan].reverse()) {
        const r = await sb.from("jobs").update({ start_time: mm(j.to) }).eq("id", j.id);
        if (r.error) { err = r.error; break; }
        const cu = data.customers.find((x) => x.id === j.customer_id);
        movedList.unshift({ id: j.id, cust: cu, from: mm(j.start), to: mm(j.to) });
      }
    }
    let up = null;
    if (!err) { up = await sb.from("jobs").update(row).eq("id", job.id).select().single(); err = up.error; }
    if (!err && confirm && ["team", "free", "shift"].includes(who)) err = await assignTeam(job.id);
    setBusy(false);
    if (err) return setMsg({ kind: "err", text: errText(err) });
    if (!confirm) return onSaved(tx("Gespeichert – Termin noch offen."), f.work_date);
    if (who === "other") { onSaved(tx("Termin bestätigt ✓"), f.work_date); if (onAssign) onAssign(up.data); return; }
    if (who === "shift" && movedList.length) { setMoved(movedList); return; } // erst Kunden benachrichtigen
    onSaved(tx("Termin bestätigt ✓ – Team eingeteilt."), f.work_date);
  }
  async function remove() {
    if (!ask(tx("Fortsetzung wirklich löschen?"))) return;
    setBusy(true);
    const r = await sb.from("jobs").delete().eq("id", job.id);
    setBusy(false);
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    onSaved(tx("Fortsetzung gelöscht."), null);
  }
  const phone = c && c.phone;
  const cbtn = "inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold";
  const step = "mb-1.5 text-sm font-semibold text-slate-700";

  if (moved) return ( // nach dem Verschieben: Kunden kurz informieren
    <Modal title={tx("Termine verschoben")} onClose={() => onSaved(tx("Termin bestätigt ✓ – Team eingeteilt."), f.work_date)}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{tx("Diese Kunden haben jetzt eine andere Uhrzeit. Bitte kurz Bescheid geben:")}</p>
        {moved.map((m) => { const ph = m.cust && m.cust.phone; const t2 = tx("Hallo {0}, wir müssen Ihren Termin am {1} von {2} auf {3} Uhr verschieben. Passt das für Sie?", m.cust ? m.cust.name : "", dmy(d), m.from, m.to); return (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
            <span><b>{custName(m.cust)}</b> · {m.from} → <b>{m.to}</b></span>
            {ph ? <a href={`https://wa.me/${digits(ph)}?text=${encodeURIComponent(t2)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center rounded-lg bg-emerald-600 px-3 font-semibold text-white">WhatsApp</a> : <span className="text-xs text-slate-500">{tx("keine Telefonnummer")}</span>}
          </div>); })}
        <div className="tv-actions flex justify-end"><button type="button" className={btnPrimary} onClick={() => onSaved(tx("Termin bestätigt ✓ – Team eingeteilt."), f.work_date)}>{tx("Fertig")}</button></div>
      </div>
    </Modal>
  );

  const card = (val, color, title, sub, disabled) => (
    <button type="button" role="radio" aria-checked={who === val} disabled={disabled} onClick={() => setWho(val)}
      className={`w-full rounded-xl border-2 p-2.5 text-left text-sm ${who === val ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"} ${disabled ? "opacity-40" : ""}`}>
      <div className="font-semibold text-slate-800">{color} {title}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-600">{sub}</div>}
    </button>
  );
  return (
    <Modal title={tx("Fortsetzung einplanen")} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
          <div className="font-semibold">{custName(c)} · {job.address_text}</div>
          <div className="mt-0.5">{parent ? tx("Fortsetzung von Auftrag Nr. {0} ({1}) – noch ca. {2}", parent.job_no, dmy(dateOf(parent.work_date)), durTxt(job.duration_min).trim()) : tx("Fortsetzung")}</div>
          {teamIds.length > 0 && <div className="mt-0.5 text-violet-800">{tx("Team beim ersten Termin: {0}", teamIds.map(nameOf).join(", "))}</div>}
        </div>
        <div>
          <div className={step}>① {tx("Mit dem Kunden klären")}</div>
          {phone ? (
            <div className="flex gap-2">
              <a href={`tel:${phone}`} className={`${cbtn} border-slate-300 bg-white text-slate-700`}><Phone size={16} />{tx("Anrufen")}</a>
              <a href={`https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${cbtn} border-emerald-600 bg-emerald-600 text-white`}>WhatsApp</a>
            </div>
          ) : <p className="text-sm text-slate-500">{tx("Für diesen Kunden ist keine Telefonnummer gespeichert.")}</p>}
          {phone && <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{text}</p>}
        </div>
        <div>
          <div className={step}>② {tx("Termin")}</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className={lbl}>{tx("Datum")}</span><input type="date" className={inp} value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></label>
            <label className="block"><span className={lbl}>{tx("Beginn")}</span><input type="time" className={inp} value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></label>
            <label className="block"><span className={lbl}>{tx("Dauer")}</span><select className={inp} value={D} onChange={(e) => setF({ ...f, duration_min: e.target.value })}>{durOpts.sort((a, b) => a - b).map((m) => <option key={m} value={m}>{durTxt(m).trim()}</option>)}</select></label>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">{tx("Solange der Termin offen ist, sehen die Mitarbeitenden ihn nicht.")}</p>
        </div>
        <div>
          <div className={step}>③ {tx("Wer macht weiter?")}</div>
          {dayJobs === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : (
            <div role="radiogroup" className="space-y-2">
              {teamIds.length > 0 && dayJobs.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  <b>{tx("Team an diesem Tag:")}</b> {dayJobs.map((j) => `${mm(j.start)}–${mm(j.start + j.dur)} ${custName(data.customers.find((x) => x.id === j.customer_id))} (${j.staff.filter((s) => teamIds.includes(s)).map(nameOf).join(", ")})`).join(" · ")}
                </div>
              )}
              {teamFree
                ? card("team", "🟢", tx("Gleiches Team"), tx(teamIds.length === 1 ? "{0} ist um {1} frei – nichts wird verschoben." : "{0} sind um {1} frei – nichts wird verschoben.", teamIds.map(nameOf).join(", "), f.start_time))
                : teamIds.length > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">⚠ {tx("Das Team hat um {0} schon andere Aufträge.", f.start_time)}</div>}
              {card("other", "🟢", tx("Jemand anderes"), tx("Danach öffnet sich „Personal zuteilen“ mit den besten Vorschlägen. Kein anderer Auftrag wird verschoben."))}
              {!teamFree && teamIds.length > 0 && card("free", "🔵", tx("Gleiches Team – erste freie Zeit"), firstFree !== null ? tx("um {0} Uhr – die anderen Aufträge bleiben.", mm(firstFree)) : tx("An diesem Tag ist keine Zeit mehr frei."), firstFree === null)}
              {!teamFree && teamIds.length > 0 && card("shift", "🟠", tx("Gleiches Team – Folgendes verschieben"),
                shiftPlan.length ? shiftPlan.map((j) => `${custName(data.customers.find((x) => x.id === j.customer_id))} ${mm(j.start)} → ${mm(j.to)}`).join(" · ") : tx("Nichts zu verschieben."))}
            </div>
          )}
        </div>
        <Msg msg={msg} />
        <div className="tv-actions flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm text-slate-500 underline" onClick={remove} disabled={busy}>{tx("Fortsetzung löschen")}</button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnLight} onClick={() => save(false)} disabled={busy}>{tx("Speichern (noch offen)")}</button>
            <button type="button" className={btnPrimary} onClick={() => save(true)} disabled={busy || !who}>✓ {tx("Kunde hat zugestimmt")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Aufträge: Tag / Woche ----------
function JobCard({ j, data, onOpen, compact, assign = [], onAssign, absent }) {
  const isAbs = (sid) => !!(absent && absent.has(`${j.id}|${sid}`));
  const c = data.customers.find((x) => x.id === j.customer_id);
  const s = data.services.find((x) => x.id === j.service_type_id);
  const live = liveStatus(j); const st = live || { label: tx((STATUS[j.status] || STATUS.new).label), cls: (STATUS[j.status] || STATUS.new).cls };
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm hover:border-teal-400 hover:shadow ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} ${j.status === "cancelled" ? "opacity-60" : ""}`}>
    <button type="button" onClick={() => onOpen(j)} className="block w-full text-left">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={`font-semibold text-slate-800 ${compact ? "text-xs" : "text-sm"}`}>{hhmm(j.start_time)}–{endOf(j.start_time, j.duration_min)}{!compact && <span className="ml-2 font-normal text-slate-500">{durTxt(j.duration_min)}</span>}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
      </div>
      <div className={`mt-0.5 truncate ${compact ? "text-xs" : "text-sm"} text-slate-800`}>{custName(c)}{!compact && c ? <span className="ml-1 text-slate-400">#{c.customer_no}</span> : null}{j.series_id ? <span className="ml-1 text-[11px]" title={tx("Regelmäßiger Termin")}>🔁</span> : null}{j.parent_job_id ? <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{tx("Fortsetzung")}</span> : null}</div>
      {!compact && <div className="mt-0.5 truncate text-xs text-slate-600">{j.address_text}</div>}
      <div className={`mt-0.5 flex flex-wrap gap-x-3 text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {s ? <span>{s.name}</span> : null}
        {(() => { const n = assign.filter((a) => a.job_id === j.id && !isAbs(a.staff_id)).length; const full = n >= j.staff_needed;
          return <span className={j.status === "cancelled" ? "" : full ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>{tx("Personal: {0}/{1}", n, j.staff_needed)}</span>; })()}
        {j.material ? <span>{j.material === "ours" ? tx("Material: von uns") : tx("Material: vom Kunden")}</span> : null}
        {!compact && <span>{tx("Nr. {0}", j.job_no)}</span>}
      </div>
    </button>
    {(() => { const mine = assign.filter((a) => a.job_id === j.id);
      return mine.length ? <div className={compact ? "mt-0.5 text-[10px] leading-tight text-slate-700" : "mt-1 text-xs text-slate-700"}>👤 {mine.map((a, i) => { const nm = (data.staffList.find((x) => x.id === a.staff_id) || {}).name || "?";
        return <span key={a.staff_id}>{i ? ", " : ""}{isAbs(a.staff_id) ? <span className="font-medium text-rose-700">⚠ {nm} ({tx("abwesend")})</span> : nm}</span>; })}</div> : null; })()}
    {!compact && j.status !== "cancelled" && j.status !== "done" && onAssign && (
      <button type="button" onClick={() => onAssign(j)} className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 sm:w-auto">👥 {tx("Personal zuteilen")}</button>
    )}
    {!compact && j.status !== "cancelled" && <div className="sm:hidden"><ContactButtons phone={c && c.phone} map={j} /></div>}
    </div>
  );
}

function JobsView({ org, data, jobs, assign, absent, day, setDay, mode, setMode, showCancelled, setShowCancelled, onNew, onOpen, onAssign, onPrint }) {
  const visible = jobs.filter((j) => showCancelled || j.status !== "cancelled");
  const today = isoOf(new Date());
  const step = mode === "week" ? 7 : 1;
  const move = (n) => setDay(mode === "month" ? addMonths(day, n) : addDays(day, n * step));
  const weekStart = mondayOf(day);
  const days = mode === "month" ? monthGrid(day) : mode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [day];
  const inMonth = (d) => mode !== "month" || d.slice(0, 7) === day.slice(0, 7);
  const head = mode === "month" ? `${monthName(dateOf(day).getMonth())} ${dateOf(day).getFullYear()}` : mode === "week" ? `${dm(dateOf(days[0]))} – ${dmy(dateOf(days[6]))}` : `${wdLong(dateOf(day).getDay())}, ${dmy(dateOf(day))}`;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className={btnLight} onClick={() => move(-1)} aria-label={tx("Zurück")}><ChevronLeft size={16} /></button>
          <button type="button" className={btnLight} onClick={() => setDay(today)}>{tx("Heute")}</button>
          <button type="button" className={btnLight} onClick={() => move(1)} aria-label={tx("Weiter")}><ChevronRight size={16} /></button>
        </div>
        <input type="date" className={inpBase} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={tx("Datum")} />
        <div role="radiogroup" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {[["day", "Tag"], ["week", "Woche"], ["month", "Monat"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`px-3 py-1.5 ${mode === k ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{tx(l)}</button>)}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{tx("Stornierte zeigen")}</label>
        <div className="flex-1" />
        {onPrint && <button type="button" className={btnLight} onClick={onPrint}><Printer size={16} />{tx("Drucken")}</button>}
        <button type="button" className={btnPrimary} onClick={() => onNew(mode === "day" ? day : (days.includes(today) ? today : days[0]))}><Plus size={16} />{tx("Auftrag")}</button>
      </div>
      <h2 className="mb-2 text-base font-semibold text-slate-700">{head}</h2>
      {mode === "day" ? (
        <div className="space-y-2">
          {visible.filter((j) => j.work_date === day).length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{tx("Keine Aufträge an diesem Tag.")}</p>}
          {visible.filter((j) => j.work_date === day).map((j) => <JobCard key={j.id} j={j} data={data} onOpen={onOpen} assign={assign} onAssign={onAssign} absent={absent} />)}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {mode === "month" && !visible.some((j) => inMonth(j.work_date)) && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 sm:hidden">{tx("Keine Aufträge in diesem Monat.")}</p>}
          {days.map((d) => {
            const list = visible.filter((j) => j.work_date === d);
            if (mode === "month" && !inMonth(d) && !list.length) return <div key={d} className="hidden min-h-[60px] rounded-xl border border-dashed border-slate-200 lg:block" aria-hidden="true"><div className="px-2 py-1 text-xs text-slate-300">{dm(dateOf(d))}</div></div>;
            return (
              <div key={d} className={`min-h-[120px] rounded-xl border p-1.5 ${d === today ? "border-teal-400 bg-teal-50/40" : "border-slate-200 bg-slate-50/60"} ${inMonth(d) ? "" : "opacity-60"} ${mode === "month" && !list.length ? "hidden sm:block" : ""}`}>
                <button type="button" onClick={() => { setDay(d); setMode("day"); }} className="mb-1 flex w-full items-baseline justify-between px-1 text-left text-xs font-semibold text-slate-700 hover:text-teal-700">
                  <span>{wdShort(dateOf(d).getDay())} {dm(dateOf(d))}</span><span className="font-normal text-slate-500">{list.length || ""}</span>
                </button>
                <div className="space-y-1">{list.map((j) => <JobCard key={j.id} j={j} data={data} onOpen={onOpen} compact assign={assign} absent={absent} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ---------- Drucken (23.11.2026): Einsatzplan für Büro / Inhaber – Tag, Woche oder Monat ----------
// Zwei Ansichten: „Übersicht“ (alle Einsätze nach Tag) und „Pro Mitarbeiter:in“ (Blatt zum Mitgeben).
// Telefon der Kunden nur auf Wunsch (Mitarbeitende sollen es nicht sehen).
const PRINT_CSS = `
#dg-print { position: fixed; inset: 0; z-index: 100; overflow: auto; background: #e9edf3; }
#dg-print .dgp-sheet { background: #fff; width: 210mm; max-width: 100%; margin: 16px auto; padding: 14mm 12mm; box-shadow: 0 2px 14px rgba(15,23,42,.15); color: #0f172a; font-size: 10.5pt; line-height: 1.35; }
#dgp-bar { position: sticky; top: 0; z-index: 2; }
#dg-print table { width: 100%; border-collapse: collapse; table-layout: fixed; }
#dg-print td { overflow-wrap: break-word; hyphens: auto; }
#dg-print th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #475569; font-weight: 600; padding: 4px 6px; border-bottom: 1.5px solid #0f172a; }
#dg-print td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
#dg-print tr:nth-child(even) td { background: #f8fafc; }
#dg-print .dgp-band { background: #1e293b; color: #fff; padding: 5px 8px; border-radius: 6px; margin: 14px 0 4px; display: flex; justify-content: space-between; font-weight: 600; font-size: 10pt; }
#dg-print .dgp-person { border: 1.5px solid #1e293b; border-radius: 10px; padding: 8px 10px; margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: baseline; }
#dg-print .dgp-chip { display: inline-block; border: 1px solid #cbd5e1; border-radius: 999px; padding: 2px 10px; margin: 0 6px 4px 0; font-size: 9pt; }
#dg-print .dgp-warn { color: #b91c1c; font-weight: 600; }
#dg-print .dgp-muted { color: #64748b; font-size: 8.5pt; }
#dg-print .dgp-time { white-space: nowrap; font-weight: 600; }
@media print {
  body > *:not(#dg-print) { display: none !important; }
  #dg-print { position: static !important; overflow: visible !important; background: #fff !important; }
  #dg-print .dgp-sheet { box-shadow: none; margin: 0; padding: 0; width: auto; }
  #dg-print .dgp-noprint { display: none !important; }
  #dg-print .dgp-break { break-before: page; }
  #dg-print tr, #dg-print .dgp-person, #dg-print .dgp-band { break-inside: avoid; break-after: avoid; }
  #dg-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 12mm; }
}`;

function printRange(kind, day, o) {
  if (kind === "custom") return [o.from, o.to];
  if (kind === "week") { const a = mondayOf(day); return [a, addDays(a, 6)]; }
  if (kind === "month") { const d = dateOf(day); const a = isoOf(new Date(d.getFullYear(), d.getMonth(), 1, 12)); const b = isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); return [a, b]; }
  return [day, day];
}

function PrintDialog({ org, data, day, mode, onClose }) {
  const [o, setO] = useState({ range: mode === "month" ? "month" : mode === "week" ? "week" : "day", date: day, from: mode === "month" ? monthFirst(day) : mode === "week" ? mondayOf(day) : day, to: mode === "month" ? monthLast(day) : mode === "week" ? addDays(mondayOf(day), 6) : day, layout: "overview", pages: true, phone: false, notes: true, back: true });
  const [sheet, setSheet] = useState(null); // geladene Daten → Vorschau
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));
  async function preview() {
    setBusy(true); setMsg(null);
    if (o.range === "custom" ? !o.from || !o.to : !o.date) { setBusy(false); return setMsg({ kind: "err", text: tx("Bitte ein Datum wählen.") }); }
    const [from, to] = printRange(o.range, o.date, o);
    if (to < from) { setBusy(false); return setMsg({ kind: "err", text: tx("„Bis“ liegt vor „Von“.") }); }
    const maxDays = o.layout === "transport" ? 31 : 62;
    if ((dateOf(to) - dateOf(from)) / 86400000 >= maxDays) { setBusy(false); return setMsg({ kind: "err", text: tx("Höchstens {0} Tage auf einmal.", maxDays) }); }
    const sb = org.supabase;
    if (o.layout === "transport") {
      const t = await sb.rpc("touren_transport", { p_org: org.orgId, p_from: from, p_to: to });
      setBusy(false);
      if (t.error) return setMsg({ kind: "err", text: errText(t.error) });
      return setSheet({ from, to, jobs: [], assign: [], names: {}, absent: new Set(), transport: t.data, opts: { ...o } });
    }
    const r = await sb.from("jobs").select("*").eq("org_id", org.orgId).gte("work_date", from).lte("work_date", to).order("work_date").order("start_time");
    if (r.error) { setBusy(false); return setMsg({ kind: "err", text: errText(r.error) }); }
    const jobs = (r.data || []).filter((j) => j.status !== "cancelled");
    const ids = jobs.map((j) => j.id);
    const [js, st, cf] = await Promise.all([
      ids.length ? sb.from("job_staff").select("job_id, staff_id").in("job_id", ids) : Promise.resolve({ data: [] }),
      sb.from("staff").select("id, name").eq("org_id", org.orgId),
      sb.rpc("touren_absence_conflicts", { p_org: org.orgId, p_from: from, p_to: to }),
    ]);
    setBusy(false);
    const names = {}; (data.staffList || []).forEach((x) => { names[x.id] = x.name; }); ((st && st.data) || []).forEach((x) => { names[x.id] = x.name; });
    const absent = new Set(((cf && !cf.error && cf.data) || []).map((c) => `${c.job_id}|${c.staff_id}`));
    setSheet({ from, to, jobs, assign: (js && js.data) || [], names, absent, opts: { ...o } });
  }
  if (sheet) return <PrintSheet org={org} data={data} sheet={sheet} onBack={() => setSheet(null)} onClose={onClose} onReload={preview} />;
  const opt = (k, v, label) => <button type="button" role="radio" aria-checked={o[k] === v} onClick={() => set(k, v)} className={`px-3 py-1.5 ${o[k] === v ? "bg-teal-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>;
  return (
    <Modal title={tx("Drucken")} onClose={onClose}>
      <div className="space-y-4">
        <div><span className={lbl}>{tx("Zeitraum")}</span>
          <div role="radiogroup" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">{opt("range", "day", tx("Tag"))}{opt("range", "week", tx("Woche"))}{opt("range", "month", tx("Monat"))}{opt("range", "custom", tx("Von – bis"))}</div>
          {o.range === "custom" ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-600">{tx("Von")}<input type="date" className={`${inpBase} ml-2`} value={o.from} onChange={(e) => setO((p) => ({ ...p, from: e.target.value, to: p.to && p.to < e.target.value ? e.target.value : p.to }))} /></label>
            <label className="text-xs text-slate-600">{tx("Bis")}<input type="date" className={`${inpBase} ml-2`} value={o.to} min={o.from} onChange={(e) => set("to", e.target.value)} /></label>
            {o.from && o.to && o.to >= o.from && <p className="w-full text-xs font-medium text-slate-700">{dmy(dateOf(o.from))} – {dmy(dateOf(o.to))} · {tx("{0} Tage", Math.round((dateOf(o.to) - dateOf(o.from)) / 86400000) + 1)}</p>}
          </div>
          ) : (<>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">{o.range === "day" ? tx("Tag") : o.range === "week" ? tx("Ein Tag in der Woche") : tx("Ein Tag im Monat")}
              <input type="date" className={`${inpBase} ml-2`} value={o.date} onChange={(e) => set("date", e.target.value)} /></label>
            <div className="inline-flex gap-1">
              <button type="button" className={btnLight} aria-label={tx("Zurück")} onClick={() => o.date && set("date", o.range === "month" ? isoOf(new Date(dateOf(o.date).getFullYear(), dateOf(o.date).getMonth() - 1, 1, 12)) : addDays(o.date, o.range === "week" ? -7 : -1))}><ChevronLeft size={16} /></button>
              <button type="button" className={btnLight} aria-label={tx("Weiter")} onClick={() => o.date && set("date", o.range === "month" ? isoOf(new Date(dateOf(o.date).getFullYear(), dateOf(o.date).getMonth() + 1, 1, 12)) : addDays(o.date, o.range === "week" ? 7 : 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
          {o.date && <p className="mt-1 text-xs font-medium text-slate-700">{(() => { const [a, b] = printRange(o.range, o.date); return o.range === "month" ? `${monthName(dateOf(a).getMonth())} ${dateOf(a).getFullYear()}` : a === b ? `${wdLong(dateOf(a).getDay())}, ${dmy(dateOf(a))}` : `${dmy(dateOf(a))} – ${dmy(dateOf(b))}`; })()}</p>}
          </>)}
        </div>
        <div><span className={lbl}>{tx("Ansicht")}</span>
          <div role="radiogroup" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">{opt("layout", "overview", tx("Alle Aufträge"))}{opt("layout", "staff", tx("Pro Mitarbeiter:in"))}{opt("layout", "transport", tx("Transport"))}</div>
          <p className="mt-1 text-xs text-slate-500">{o.layout === "overview" ? tx("Alle Aufträge nach Tag und Uhrzeit, mit dem eingeteilten Personal – für Büro und Inhaber.") : o.layout === "staff" ? tx("Für jede Person ihre eigenen Aufträge – zum Mitgeben oder Aushängen.") : tx("Für den Fahrer: wann wer wo abgeholt wird (Unterkunft oder Zuhause), wohin es geht und wann es weitergeht.")}</p>
        </div>
        {o.layout === "transport" ? (
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={o.back} onChange={(e) => set("back", e.target.checked)} />{tx("Rückfahrt nach dem letzten Auftrag")}</label>
          <p className="text-xs text-slate-500">{tx("Wer mit derselben Fahrer:in zum selben Auftrag fährt, kommt in eine Fahrt mit mehreren Haltestellen. Die Zeiten werden aus der Entfernung geschätzt (ohne Kartenpunkt: Fahrzeit aus den Einstellungen). Startpunkt je Person: „Mitarbeitende“ → „Bearbeiten“.")}</p>
          <p className="text-xs text-amber-700">{tx("Enthält Wohnadressen und Telefonnummern des Personals – nur dem Fahrer geben.")}</p>
        </div>
        ) : (
        <div className="space-y-1.5 text-sm">
          {o.layout === "staff" && <label className="flex items-center gap-2"><input type="checkbox" checked={o.pages} onChange={(e) => set("pages", e.target.checked)} />{tx("Jede Person auf einer eigenen Seite")}</label>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={o.notes} onChange={(e) => set("notes", e.target.checked)} />{tx("Hinweise für das Personal drucken")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={o.phone} onChange={(e) => set("phone", e.target.checked)} />{tx("Telefon der Kunden drucken")}</label>
          {o.phone && <p className="ml-6 text-xs text-amber-700">{tx("Nur für Büro und Inhaber – diese Blätter nicht dem Personal geben.")}</p>}
        </div>
        )}
        <Msg msg={msg} />
        <div className="tv-actions flex justify-end gap-2"><button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button><button type="button" className={btnPrimary} onClick={preview} disabled={busy}><Printer size={16} />{busy ? tx("Lädt …") : tx("Vorschau")}</button></div>
      </div>
    </Modal>
  );
}

function PrintSheet({ org, data, sheet, onBack, onClose, onReload }) {
  const { from, to, jobs, assign, names, absent, opts } = sheet;
  const custOf = (id) => data.customers.find((c) => c.id === id);
  const svcOf = (id) => (data.services.find((x) => x.id === id) || {}).name || "";
  const staffOf = (j) => assign.filter((a) => a.job_id === j.id).map((a) => ({ id: a.staff_id, name: names[a.staff_id] || "?", absent: absent.has(`${j.id}|${a.staff_id}`) })).sort((a, b) => a.name.localeCompare(b.name));
  const present = (j) => staffOf(j).filter((x) => !x.absent).length;
  const short = jobs.filter((j) => present(j) < j.staff_needed);
  const hours = jobs.reduce((a, j) => a + (j.duration_min || 0), 0) / 60;
  const title = from === to ? `${wdLong(dateOf(from).getDay())}, ${dmy(dateOf(from))}`
    : opts.range === "month" ? `${monthName(dateOf(from).getMonth())} ${dateOf(from).getFullYear()}` : `${dmy(dateOf(from))} – ${dmy(dateOf(to))}`;
  const dates = [...new Set(jobs.map((j) => j.work_date))];
  const nJobs = (n) => (n === 1 ? tx("1 Auftrag") : tx("{0} Aufträge", n));
  const cols = (ws) => <colgroup>{ws.filter(Boolean).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
  const dayHead = (d) => `${wdLong(dateOf(d).getDay())}, ${dmy(dateOf(d))}`;
  const timeCell = (j) => <td className="dgp-time">{hhmm(j.start_time)}–{endOf(j.start_time, j.duration_min)}</td>;
  const custCell = (j) => { const c = custOf(j.customer_id); return (
    <td><div style={{ fontWeight: 600 }}>{custName(c)}</div><div>{j.address_text}</div>{opts.phone && c && c.phone ? <div className="dgp-muted">☎ {c.phone}</div> : null}</td>); };
  const noteCell = (j) => opts.notes ? <td style={{ maxWidth: "48mm" }}>{j.notes_staff || ""}</td> : null;
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const people = useMemo(() => {
    const m = {}; assign.forEach((a) => { const j = jobs.find((x) => x.id === a.job_id); if (!j) return; (m[a.staff_id] = m[a.staff_id] || []).push(j); });
    return Object.entries(m).map(([id, list]) => ({ id, name: names[id] || "?", list: list.sort((a, b) => (a.work_date + a.start_time).localeCompare(b.work_date + b.start_time)) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [assign, jobs, names]);
  const printedAt = `${dmy(new Date())} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const header = (sub) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2.5px solid #0f172a", paddingBottom: 8, marginBottom: 10 }}>
      <div><div style={{ fontSize: "9pt", color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>{org.orgName}</div>
        <div style={{ fontSize: "17pt", fontWeight: 700 }}>{sub}</div><div style={{ fontSize: "11pt" }}>{title}</div></div>
      <div className="dgp-muted" style={{ textAlign: "right" }}>{tx("Gedruckt {0}", printedAt)}<br />Dienstigo</div>
    </div>
  );
  // Transport: Fahrten aus den Aufträgen bauen – Abholung am Startpunkt, Weiterfahrt, Rückfahrt; gleiche Fahrt = eine Zeile
  const trips = useMemo(() => buildTrips(sheet.transport, { back: opts.back, homeLabel: tx("Zuhause") }), [sheet.transport, opts.back]); // eslint-disable-line react-hooks/exhaustive-deps
  const drivers = (sheet.transport && sheet.transport.drivers) || [];
  const [drvBusy, setDrvBusy] = useState(false);
  const [drvErr, setDrvErr] = useState(null);
  // Zuteilung B: Person(en) dieser Fahrt für den ganzen Tag einer Fahrerin geben ("" = automatisch nach Bereich)
  async function setDriver(day, row, driverId) {
    setDrvBusy(true); setDrvErr(null);
    const sb = org.supabase; let err = null;
    for (const w of row.who) {
      const r = driverId
        ? await sb.from("touren_trip_driver").upsert({ org_id: org.orgId, work_date: day, staff_id: w.id, driver_id: driverId }, { onConflict: "work_date,staff_id" })
        : await sb.from("touren_trip_driver").delete().eq("org_id", org.orgId).eq("work_date", day).eq("staff_id", w.id);
      if (r.error) { err = r.error; break; }
    }
    setDrvBusy(false);
    if (err) { setDrvErr(errText(err)); return; }
    if (onReload) onReload();
  }
  const KIND = { pick: tx("Abholen"), next: tx("Weiterfahrt"), back: tx("Rückfahrt"), out: tx("Weiter- und Rückfahrt") };
  const WARN = { overlap: tx("⚠ Überschneidung – andere Fahrer:in wählen"), self: tx("⚠ Fahrer:in arbeitet zu dieser Zeit selbst"), late: tx("⚠ Zeit reicht knapp nicht") };
  const body = opts.layout === "transport" ? (
    <>
      {drvErr && <div className="dgp-noprint" role="alert" style={{ color: "#b91c1c", marginBottom: 8 }}>{drvErr}</div>}
      {trips.length === 0 && <>{header(tx("Transport"))}<p style={{ marginTop: 20 }}>{tx("Keine Fahrten – niemand eingeteilt.")}</p></>}
      {(() => { let page = 0; return trips.map((t) => {
        // pro Tag: eine Gruppe je Fahrer:in (ohne Fahrer:innen: eine Gruppe)
        const groups = drivers.length ? [...drivers.map((d) => ({ d, rows: t.rows.filter((r) => r.driverId === d.id) })), { d: null, rows: t.rows.filter((r) => !r.driverId || !drivers.some((d) => d.id === r.driverId)) }].filter((g) => g.rows.length) : [{ d: null, rows: t.rows }];
        return groups.map((g) => (
          <div key={t.day + (g.d ? g.d.id : "-")} className={page++ > 0 ? "dgp-break" : ""}>
            {header(tx("Transport"))}
            <div className="dgp-band"><span>{dayHead(t.day)}</span><span>{g.rows.length === 1 ? tx("1 Fahrt") : tx("{0} Fahrten", g.rows.length)}</span></div>
            {drivers.length > 0 && <div className="dgp-person"><span style={{ fontSize: "13pt", fontWeight: 700 }}>{g.d ? `${tx("Fahrer:in")}: ${g.d.name}` : tx("Noch ohne Fahrer:in")}</span><span>{g.d && g.d.phone ? `☎ ${g.d.phone}` : ""}</span></div>}
            <table>{cols(["11%", "23%", "23%", "28%", "15%"])}
              <thead><tr><th>{tx("Abfahrt")}</th><th>{tx("Von")}</th><th>{tx("Wer")}</th><th>{tx("Nach")}</th><th>{tx("Beginn")}</th></tr></thead>
              <tbody>{g.rows.map((r) => (
                <tr key={r.key}>
                  <td><div className="dgp-time" style={{ fontSize: "12pt" }}>{r.time}</div><div className="dgp-muted">{KIND[r.kind]}</div>
                    {r.warn.map((w) => <div key={w} className="dgp-warn" style={{ fontSize: "8.5pt", marginTop: 3 }}>{WARN[w]}</div>)}</td>
                  <td>{r.kind === "pick" ? r.stops.map((st, i) => <div key={i} style={{ marginBottom: 4 }}>{r.stops.length > 1 && <span className="dgp-time">{st.time} </span>}<span style={{ fontWeight: 600 }}>{st.place.label}</span><div>{st.place.addr}</div></div>)
                    : <><div style={{ fontWeight: 600 }}>{r.from.label}</div><div>{r.from.addr}</div></>}</td>
                  <td>{r.stops.map((st, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>{r.stops.length > 1 && <div className="dgp-muted">{st.time} · {st.place.label}</div>}
                      {st.who.map((w) => <div key={w.id} style={{ marginBottom: 2 }}><span style={{ fontWeight: 600 }}>{w.name}</span>{w.phone ? <div className="dgp-muted">☎ {w.phone}</div> : null}</div>)}</div>))}</td>
                  <td>{r.kind !== "pick" ? r.stops.map((st, i) => <div key={i} style={{ marginBottom: 4 }}><span className="dgp-time">{st.time} </span><span style={{ fontWeight: 600 }}>{st.place.label}</span><div>{st.place.addr}</div>{st.deadline && <div className="dgp-muted">{tx("Beginn {0}", st.deadline)}</div>}</div>)
                    : <><div style={{ fontWeight: 600 }}>{r.to.label}</div><div>{r.to.addr}</div></>}</td>
                  <td><div className="dgp-time">{r.arrive || "–"}</div>
                    {drivers.length > 0 && (
                      <select className="dgp-noprint" aria-label={tx("Fahrer:in")} disabled={drvBusy} value={r.manual ? r.driverId || "" : ""} onChange={(e) => setDriver(t.day, r, e.target.value)} style={{ marginTop: 4, width: "100%", fontSize: "9pt", border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 4px" }}>
                        <option value="">{tx("automatisch")}</option>
                        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>)}</td>
                </tr>))}</tbody></table>
            {!g.d && t.missing.length > 0 && <p className="dgp-warn" style={{ marginTop: 6 }}>{tx("Ohne Startpunkt (Abholung bitte klären): {0}", t.missing.map((m) => m.name).join(", "))}</p>}
            {drivers.length > 0 && <p className="dgp-noprint dgp-muted" style={{ marginTop: 6 }}>{tx("„automatisch“ = nach dem Bereich der Fahrer:in (Mitarbeitende → Bearbeiten). Eine Auswahl gilt für die Person den ganzen Tag.")}</p>}
            {!g.d && <div style={{ marginTop: 18, display: "flex", gap: 30 }} className="dgp-muted"><span>{tx("Fahrer:in")}: ____________________</span><span>{tx("Fahrzeug")}: ______________</span></div>}
          </div>));
      }); })()}
    </>
  ) : opts.layout === "overview" ? (
    <>
      {header(tx("Einsatzplan"))}
      {jobs.length > 0 && <div><span className="dgp-chip">{nJobs(jobs.length)}</span><span className="dgp-chip">{tx("{0} Std.", dec(Math.round(hours * 10) / 10))}</span>
        {short.length ? <span className="dgp-chip dgp-warn">{tx("{0} ohne volles Personal", short.length)}</span> : <span className="dgp-chip">{tx("Personal vollständig ✓")}</span>}</div>}
      {jobs.length === 0 && <p style={{ marginTop: 20 }}>{tx("Keine Aufträge in diesem Zeitraum.")}</p>}
      {dates.map((d) => { const list = jobs.filter((j) => j.work_date === d); return (
        <div key={d}>
          <div className="dgp-band"><span>{dayHead(d)}</span><span>{nJobs(list.length)}</span></div>
          <table>{cols(["15%", opts.notes ? "32%" : "42%", "17%", "17%", opts.notes && "19%"])}<thead><tr><th>{tx("Zeit")}</th><th>{tx("Kunde / Adresse")}</th><th>{tx("Leistung")}</th><th>{tx("Personal")}</th>{opts.notes && <th>{tx("Hinweis")}</th>}</tr></thead>
            <tbody>{list.map((j) => { const ss = staffOf(j); const n = present(j); return (
              <tr key={j.id}>{timeCell(j)}{custCell(j)}<td>{svcOf(j.service_type_id)}</td>
                <td>{ss.map((x) => <div key={x.id} className={x.absent ? "dgp-warn" : ""}>{x.absent ? `⚠ ${x.name} (${tx("abwesend")})` : x.name}</div>)}
                  {n < j.staff_needed && <div className="dgp-warn">{tx("fehlt: {0}", j.staff_needed - n)}</div>}</td>
                {noteCell(j)}</tr>); })}</tbody></table>
        </div>); })}
    </>
  ) : (
    <>
      {people.length === 0 && <>{header(tx("Einsatzplan"))}<p>{tx("Noch niemand eingeteilt.")}</p></>}
      {people.map((p, i) => { const h = p.list.reduce((a, j) => a + (j.duration_min || 0), 0) / 60; return (
        <div key={p.id} className={opts.pages && i > 0 ? "dgp-break" : ""}>
          {(i === 0 || opts.pages) && header(tx("Einsatzplan"))}
          <div className="dgp-person"><span style={{ fontSize: "14pt", fontWeight: 700 }}>{p.name}</span><span>{nJobs(p.list.length)} · {tx("{0} Std.", dec(Math.round(h * 10) / 10))}</span></div>
          <table>{cols(["11%", "15%", opts.notes ? "28%" : "38%", "15%", "12%", opts.notes && "19%"])}<thead><tr><th>{tx("Tag")}</th><th>{tx("Zeit")}</th><th>{tx("Kunde / Adresse")}</th><th>{tx("Leistung")}</th><th>{tx("Mit")}</th>{opts.notes && <th>{tx("Hinweis")}</th>}</tr></thead>
            <tbody>{p.list.map((j) => (
              <tr key={j.id}><td style={{ whiteSpace: "nowrap" }}>{wdShort(dateOf(j.work_date).getDay())} {dm(dateOf(j.work_date))}{absent.has(`${j.id}|${p.id}`) ? <div className="dgp-warn">⚠ {tx("abwesend")}</div> : null}</td>{timeCell(j)}{custCell(j)}<td>{svcOf(j.service_type_id)}</td>
                <td>{staffOf(j).filter((x) => x.id !== p.id).map((x) => x.name).join(", ") || "–"}</td>{noteCell(j)}</tr>))}</tbody></table>
        </div>); })}
      {short.length > 0 && !opts.pages && (
        <div><div className="dgp-band" style={{ background: "#b91c1c" }}><span>{tx("Ohne volles Personal")}</span><span>{short.length}</span></div>
          <table>{cols(["11%", "15%", "54%", "20%"])}<tbody>{short.map((j) => <tr key={j.id}><td style={{ whiteSpace: "nowrap" }}>{wdShort(dateOf(j.work_date).getDay())} {dm(dateOf(j.work_date))}</td>{timeCell(j)}{custCell(j)}<td className="dgp-warn">{tx("fehlt: {0}", j.staff_needed - present(j))}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
  return createPortal(
    <div id="dg-print" lang={getLang()} role="dialog" aria-modal="true" aria-label={tx("Druckvorschau")}>
      <style>{PRINT_CSS}</style>
      <div id="dgp-bar" className="dgp-noprint flex flex-wrap items-center justify-center gap-2 border-b border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
        <button type="button" className={btnLight} onClick={onBack}><ChevronLeft size={16} />{tx("Zurück")}</button>
        <button type="button" className={btnPrimary} onClick={() => window.print()}><Printer size={16} />{tx("Drucken / als PDF speichern")}</button>
        <button type="button" className={btnLight} onClick={onClose}>{tx("Schließen")}</button>
      </div>
      <div className="dgp-sheet">{body}</div>
    </div>, document.body);
}

// ---------- Kunden ----------
function CustomerDialog({ org, data, customer, onClose, onSaved, onNewJob }) {
  const editing = !!customer;
  const custFields = data.fields.filter((f) => f.entity === "customer" && f.active);
  const [c, setC] = useState(() => customer ? { ...customer, company: customer.company || "", phone: customer.phone || "", email: customer.email || "", notes_staff: customer.notes_staff || "", notes_internal: customer.notes_internal || "", extra: customer.extra || {} }
    : { kind: "person", name: "", company: "", phone: "", email: "", notes_staff: "", notes_internal: "", source: "phone", active: true, extra: {} });
  const [firstAddr, setFirstAddr] = useState(emptyAddr());
  const [addrEdit, setAddrEdit] = useState(null); // { id|null, ...fields }
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const addrs = editing ? data.addresses.filter((a) => a.customer_id === customer.id) : [];

  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    org.supabase.from("jobs").select("id, job_no, work_date, start_time, duration_min, service_type_id, status, address_text, series_id").eq("org_id", org.orgId).eq("customer_id", customer.id).order("work_date", { ascending: false }).limit(120)
      .then(({ data: rows }) => { const t = isoOf(new Date()); if (alive) setHistory((rows || []).filter((h) => !(h.series_id && h.work_date > t)).slice(0, 20)); }); // künftige Termine einer Reihe stehen unter „Regelmäßige Termine“
    return () => { alive = false; };
  }, [editing, customer, org]);

  async function save() {
    setMsg(null);
    if (blank(c.name)) return setMsg({ kind: "err", text: tx("Bitte den Namen eintragen.") });
    const miss = missingRequired(custFields, c.extra || {});
    if (miss.length) return setMsg({ kind: "err", text: tx("Bitte ausfüllen: {0}", miss.join(", ")) });
    setBusy(true);
    const row = { kind: c.kind, name: c.name.trim(), company: c.kind === "company" ? clean(c.company) : null, phone: normPhone(c.phone, org.country), email: clean(c.email), notes_staff: clean(c.notes_staff), notes_internal: clean(c.notes_internal), source: c.source, active: !!c.active, extra: c.extra || {} };
    try {
      if (editing) {
        const up = await org.supabase.from("customers").update(row).eq("id", customer.id).select().single();
        if (up.error) throw up.error;
        onSaved(tx("Kunde gespeichert ✓"), up.data, true);
      } else {
        const ins = await org.supabase.from("customers").insert({ org_id: org.orgId, ...row }).select().single();
        if (ins.error) throw ins.error;
        if (!blank(firstAddr.address)) {
          const ia = await org.supabase.from("customer_addresses").insert({ org_id: org.orgId, customer_id: ins.data.id, ...(await withCoords(org, addrRow(firstAddr))) });
          if (ia.error) throw ia.error;
        }
        onSaved(tx("Kunde Nr. {0} angelegt ✓", ins.data.customer_no), ins.data, false);
      }
    } catch (e) { setMsg({ kind: "err", text: errText(e) }); setBusy(false); }
  }

  async function saveAddr() {
    if (blank(addrEdit.address)) return setMsg({ kind: "err", text: tx("Bitte die Adresse eintragen.") });
    setBusy(true); setMsg(null);
    const q = addrEdit.id
      ? org.supabase.from("customer_addresses").update(await withCoords(org, addrRow(addrEdit))).eq("id", addrEdit.id)
      : org.supabase.from("customer_addresses").insert({ org_id: org.orgId, customer_id: customer.id, ...(await withCoords(org, addrRow(addrEdit))) });
    const r = await q;
    setBusy(false);
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    setAddrEdit(null);
    onSaved(tx("Adresse gespeichert ✓"), customer, true, true);
  }
  async function deleteAddr(a) {
    if (!ask(tx("Adresse „{0}“ löschen?\n\nFrühere Aufträge behalten den Adresstext.", a.address))) return;
    const r = await removeRow(org.supabase.from("customer_addresses").delete().eq("id", a.id));
    if (r.error || r.blocked) return setMsg({ kind: "err", text: r.error ? errText(r.error) : tx("Konnte nicht gelöscht werden.") });
    onSaved(tx("Adresse gelöscht"), customer, true, true);
  }
  async function deleteCustomer() {
    if (!ask(tx("Kunde „{0}“ wirklich löschen?\n\nDas geht nicht rückgängig. Adressen werden mit gelöscht.", custName(customer)))) return;
    setBusy(true);
    const r = await removeRow(org.supabase.from("customers").delete().eq("id", customer.id));
    setBusy(false);
    if (r.error || r.blocked) return setMsg({ kind: "err", text: r.error ? errText(r.error) : tx("Dieser Kunde hat schon Aufträge und kann nicht gelöscht werden – bitte „Aktiv“ ausschalten.") });
    onSaved(tx("Kunde gelöscht"), customer, true);
  }
  async function toggleAddr(a) {
    const r = await org.supabase.from("customer_addresses").update({ active: !a.active }).eq("id", a.id);
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    onSaved(a.active ? tx("Adresse inaktiv gesetzt") : tx("Adresse wieder aktiv"), customer, true, true);
  }

  return (
    <Modal title={editing ? tx("Kunde Nr. {0}", customer.customer_no) : tx("Neuer Kunde")} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={lbl}>{tx("Art")}</span>
          <select className={inp} value={c.kind} onChange={(e) => set("kind", e.target.value)}><option value="person">{tx("Privatperson")}</option><option value="company">{tx("Firma")}</option></select></label>
        {c.kind === "company" ? <label className="block"><span className={lbl}>{tx("Firmenname")}</span><input className={inp} value={c.company} onChange={(e) => set("company", e.target.value)} /></label> : <div className="hidden sm:block" />}
        <label className="block"><span className={lbl}>{c.kind === "company" ? tx("Ansprechperson") : tx("Name")} *</span><input className={inp} value={c.name} onChange={(e) => set("name", e.target.value)} autoFocus={!editing} /></label>
        <label className="block"><span className={lbl}>{tx("Mobil / WhatsApp")}</span><input className={inp} value={c.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+971 50 123 4567" inputMode="tel" /></label>
        <label className="block"><span className={lbl}>{tx("E-Mail")}</span><input className={inp} type="email" value={c.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="block"><span className={lbl}>{tx("Quelle")}</span>
          <select className={inp} value={c.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></label>
        <label className="block"><span className={lbl}>{tx("Hinweise für Mitarbeitende")}</span><textarea rows={3} className={inp} value={c.notes_staff} onChange={(e) => set("notes_staff", e.target.value)} placeholder={tx("z. B. Zugang, Parken, Haustiere")} /></label>
        <label className="block"><span className={lbl}>{tx("Interne Notiz (nur Büro und Leitung)")}</span><textarea rows={3} className={inp} value={c.notes_internal} onChange={(e) => set("notes_internal", e.target.value)} /></label>
      </div>
      {custFields.length > 0 && <div className="mt-3"><ExtraInputs fields={custFields} values={c.extra || {}} onChange={(v) => set("extra", v)} /></div>}
      {editing && <label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!c.active} onChange={(e) => set("active", e.target.checked)} />{tx("Aktiv (inaktive Kunden erscheinen nicht in der Suche)")}</label>}

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{tx("Adressen")}</h3>
        {!editing ? (
          <div className="rounded-lg border border-slate-200 p-3"><p className="mb-2 text-xs text-slate-500">{tx("Erste Adresse (optional) – weitere nach dem Speichern.")}</p><AddressFields value={firstAddr} onChange={setFirstAddr} org={org} /></div>
        ) : (
          <div className="space-y-1.5">
            {addrs.length === 0 && <p className="text-sm text-slate-500">{tx("Noch keine Adresse gespeichert.")}</p>}
            {addrs.map((a) => (addrEdit && addrEdit.id === a.id ? null : (
              <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm ${a.active ? "" : "opacity-60"}`}>
                <span className="flex-1">{a.label ? <b>{a.label}: </b> : null}{a.address}{a.lat !== null && a.lat !== undefined ? <span className="ml-1 text-[11px] text-emerald-700">{tx("✓ Standort")}</span> : <span className="ml-1 text-[11px] text-amber-700">{tx("ohne Standort")}</span>}</span>
                <MapLink a={a} />
                <button type="button" className="text-xs text-teal-700 underline" onClick={() => setAddrEdit({ ...a, maps_url: a.maps_url || "", label: a.label || "", coordState: a.lat !== null && a.lat !== undefined ? "ok" : "none" })}>{tx("Bearbeiten")}</button>
                <button type="button" className="text-xs text-slate-600 underline" onClick={() => toggleAddr(a)}>{a.active ? tx("inaktiv setzen") : tx("wieder aktivieren")}</button>
                <button type="button" className="text-xs text-slate-500 underline" onClick={() => deleteAddr(a)}>{tx("löschen")}</button>
              </div>
            )))}
            {addrEdit && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-3">
                <AddressFields value={addrEdit} onChange={setAddrEdit} org={org} />
                <div className="mt-2 flex gap-2"><button type="button" className={btnPrimary} onClick={saveAddr} disabled={busy}>{tx("Adresse speichern")}</button><button type="button" className={btnLight} onClick={() => setAddrEdit(null)}>{tx("Abbrechen")}</button></div>
              </div>
            )}
            {!addrEdit && <button type="button" className={btnLight} onClick={() => setAddrEdit({ id: null, ...emptyAddr() })}><Plus size={15} />{tx("Adresse")}</button>}
          </div>
        )}
      </section>

      {editing && <PrefsSection org={org} data={data} customer={customer} onChanged={(t) => onSaved(t, customer, true, true)} />}
      {editing && <SeriesSection org={org} data={data} customer={customer} onChanged={(t) => onSaved(t, customer, true, true)} onNew={() => onNewJob(customer, { repeat: true })} />}

      {editing && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">{tx("Letzte Aufträge")}</h3><button type="button" className={btnLight} onClick={() => onNewJob(customer)}><Plus size={15} />{tx("Auftrag für diesen Kunden")}</button></div>
          {history === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : history.length === 0 ? <p className="text-sm text-slate-500">{tx("Noch keine Aufträge.")}</p> : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {history.map((h) => { const s = data.services.find((x) => x.id === h.service_type_id); return (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5"><span className="w-24 text-slate-700">{isoDmy(h.work_date)}</span><span className="w-24 text-slate-600">{hhmm(h.start_time)}–{endOf(h.start_time, h.duration_min)}{h.series_id ? " 🔁" : ""}</span><span className="flex-1 truncate text-slate-600">{s ? s.name : ""}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${(STATUS[h.status] || STATUS.new).cls}`}>{tx((STATUS[h.status] || STATUS.new).label)}</span></li>
              ); })}
            </ul>
          )}
        </section>
      )}

      <Msg msg={msg} />
      <div className="tv-actions mt-4 flex flex-wrap items-center justify-end gap-2">
        {editing && <button type="button" className="mr-auto text-sm text-slate-500 underline" onClick={deleteCustomer} disabled={busy}>{tx("Kunde löschen")}</button>}
        <button type="button" className={btnLight} onClick={onClose}>{tx("Schließen")}</button>
        <button type="button" className={btnPrimary} onClick={save} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button>
      </div>
    </Modal>
  );
}

// ---------- Kunde: bevorzugt / bitte nicht (D3b) ----------
function PrefsSection({ org, data, customer, onChanged }) {
  const [pick, setPick] = useState({ preferred: "", excluded: "" });
  const [msg, setMsg] = useState(null);
  const mine = data.prefs.filter((x) => x.customer_id === customer.id);
  const nameOf = (id) => (data.staffList.find((x) => x.id === id) || {}).name || "?";
  const add = async (kind) => {
    const sid = pick[kind]; if (!sid) return;
    const exists = mine.find((x) => x.staff_id === sid);
    const r = exists ? await org.supabase.from("customer_staff_pref").update({ kind }).eq("customer_id", customer.id).eq("staff_id", sid)
      : await org.supabase.from("customer_staff_pref").insert({ customer_id: customer.id, staff_id: sid, org_id: org.orgId, kind });
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    setPick({ ...pick, [kind]: "" }); onChanged(tx("Gespeichert ✓"));
  };
  const remove = async (sid) => {
    const r = await org.supabase.from("customer_staff_pref").delete().eq("customer_id", customer.id).eq("staff_id", sid);
    if (r.error) return setMsg({ kind: "err", text: errText(r.error) });
    onChanged(tx("Gespeichert ✓"));
  };
  if (!data.staffList.length) return null;
  return (
    <section className="mt-5">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">{tx("Personal für diesen Kunden")}</h3>
      <p className="mb-2 text-[11px] text-slate-500">{tx("„Bevorzugt“ steht bei der Zuteilung oben; „bitte nicht“ wird nicht vorgeschlagen und kann nicht zugeteilt werden.")}</p>
      {[["preferred", "Bevorzugt"], ["excluded", "Bitte nicht"]].map(([kind, label]) => (
        <div key={kind} className="mb-2">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-sm">
            <span className={`w-24 text-xs font-medium ${kind === "excluded" ? "text-rose-700" : "text-emerald-700"}`}>{tx(label)}:</span>
            {mine.filter((x) => x.kind === kind).map((x) => (
              <span key={x.staff_id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${kind === "excluded" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {nameOf(x.staff_id)}<button type="button" onClick={() => remove(x.staff_id)} aria-label={tx("Entfernen")} className="px-0.5">×</button>
              </span>
            ))}
            {mine.filter((x) => x.kind === kind).length === 0 && <span className="text-xs text-slate-400">–</span>}
          </div>
          <div className="flex gap-2 pl-0 sm:pl-[6.5rem]">
            <select className={`${inp} max-w-xs`} value={pick[kind]} onChange={(e) => setPick({ ...pick, [kind]: e.target.value })} aria-label={tx(label)}>
              <option value="">{tx("– Person wählen –")}</option>
              {data.staffList.filter((x) => !mine.some((m) => m.staff_id === x.id && m.kind === kind)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button type="button" className={btnLight} onClick={() => add(kind)} disabled={!pick[kind]}>{tx("Hinzufügen")}</button>
          </div>
        </div>
      ))}
      <Msg msg={msg} />
    </section>
  );
}

function CustomersView({ data, onNew, onOpen }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase(); const sd = digits(s);
    return data.customers.filter((c) => (showInactive || c.active) && (!s || c.name.toLowerCase().includes(s) || String(c.company || "").toLowerCase().includes(s) || (sd.length >= 3 && digits(c.phone).includes(sd)) || String(c.customer_no) === s));
  }, [q, showInactive, data.customers]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inp} max-w-sm`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Suchen: Name, Telefon oder Nr.")} aria-label={tx("Kunde suchen")} />
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{tx("Inaktive zeigen")}</label>
        <div className="flex-1" />
        <button type="button" className={btnPrimary} onClick={onNew}><Plus size={16} />{tx("Kunde")}</button>
      </div>
      {data.customers.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{tx("Noch keine Kunden. Mit „+ Kunde“ oder direkt beim ersten Auftrag anlegen.")}</p> : (
        <>
        <ul className="space-y-2 sm:hidden">
          {list.map((c) => {
            const first = data.addresses.find((a) => a.customer_id === c.id && a.active);
            return (
              <li key={c.id} className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm ${c.active ? "" : "opacity-60"}`}>
                <button type="button" className="block w-full text-left" onClick={() => onOpen(c)}>
                  <div className="font-medium text-slate-800">{custName(c)} <span className="text-xs font-normal text-slate-400">#{c.customer_no}</span>{!c.active ? <span className="ml-1 text-xs font-normal text-slate-400">{tx("(inaktiv)")}</span> : null}</div>
                  {c.phone && <div className="text-xs text-slate-600">{c.phone}</div>}
                  {first && <div className="truncate text-xs text-slate-500">{first.label ? `${first.label}: ` : ""}{first.address}</div>}
                </button>
                <ContactButtons phone={c.phone} map={first} />
              </li>
            );
          })}
          {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">{tx("Kein Kunde gefunden.")}</li>}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">{tx("Nr.")}</th><th className="px-3 py-2">{tx("Name")}</th><th className="px-3 py-2">{tx("Mobil / WhatsApp")}</th><th className="px-3 py-2">{tx("Adressen")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((c) => {
                const n = data.addresses.filter((a) => a.customer_id === c.id && a.active).length;
                return (
                  <tr key={c.id} className={`cursor-pointer hover:bg-teal-50/40 ${c.active ? "" : "opacity-60"}`} onClick={() => onOpen(c)}>
                    <td className="px-3 py-2 text-slate-500">{c.customer_no}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{custName(c)}{!c.active ? <span className="ml-1 text-xs font-normal text-slate-400">{tx("(inaktiv)")}</span> : null}</td>
                    <td className="px-3 py-2 text-slate-700">{c.phone ? <a href={`https://wa.me/${digits(c.phone)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:underline"><Phone size={13} aria-hidden="true" />{c.phone}</a> : "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{n}</td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">{tx("Kein Kunde gefunden.")}</td></tr>}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ---------- Mitarbeitende (Inhaber / Leitung) – gleiche Tabelle „staff“ wie Dienstplaner und Zeiterfassung ----------
const staffForm = (x, starts, skillMap, drivers = {}, areaMap = {}) => {
  const t = starts[x.id]; const dv = drivers[x.id];
  return { ...x, phone: x.phone || "", personnel_no: x.personnel_no || "",
    start: !t ? "" : t.start_kind === "home" ? "home" : t.start_kind === "place" && t.place_id ? `place:${t.place_id}` : "",
    home: t && t.start_kind === "home" ? { address: t.home_address || "", maps_url: t.home_maps_url || "", lat: t.home_lat, lng: t.home_lng, coordState: t.home_lat !== null && t.home_lat !== undefined ? "ok" : "none" } : emptyAddr(),
    skills: skillMap[x.id] || [],
    driver: dv ? { on: true, all: dv.scope_all, places: dv.places || [], home: !!dv.home, areas: (areaMap[x.id] || []).map(areaForm) } : { on: false, all: true, places: [], home: false, areas: [] } };
};
// Gebiet einer Fahrer:in (53): Mittelpunkt + Radius
const RADII = [2, 5, 10, 15, 20, 30, 50];
const areaForm = (a) => ({ id: a.id, address: a.address || "", maps_url: a.maps_url || "", label: "", lat: a.lat, lng: a.lng, coordState: "ok", radius_km: Number(a.radius_km) || 10 });
const emptyStaff = (country) => ({ name: "", phone: "", personnel_no: "", weekly_hours: country === "AE" ? 48 : 40, active: true });
function StaffView({ org, data, onChanged, onAbsence }) {
  const sb = org.supabase;
  const [rows, setRows] = useState(null);
  const [starts, setStarts] = useState({}); // staff_id → staff_touren
  const [skillMap, setSkillMap] = useState({}); // staff_id → [skill_id]
  const [drivers, setDrivers] = useState({}); // staff_id → touren_drivers (Fahrer:in)
  const [areaMap, setAreaMap] = useState({}); // staff_id → [touren_driver_areas]
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null); // { id|null, ... }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const [r, t, k, dq, aq] = await Promise.all([
      sb.from("staff").select("id, name, phone, personnel_no, weekly_hours, active, email").eq("org_id", org.orgId).order("name"),
      sb.from("staff_touren").select("*").eq("org_id", org.orgId),
      sb.from("staff_skills").select("staff_id, skill_id").eq("org_id", org.orgId),
      sb.from("touren_drivers").select("*").eq("org_id", org.orgId),
      sb.from("touren_driver_areas").select("*").eq("org_id", org.orgId).order("created_at"),
    ]);
    if (r.error) { setMsg({ kind: "err", text: errText(r.error) }); setRows([]); return; }
    setRows(r.data || []);
    setStarts(Object.fromEntries((t.data || []).map((x) => [x.staff_id, x])));
    const m = {}; (k.data || []).forEach((x) => { (m[x.staff_id] = m[x.staff_id] || []).push(x.skill_id); }); setSkillMap(m);
    setDrivers(Object.fromEntries(((dq && !dq.error && dq.data) || []).map((x) => [x.staff_id, x]))); // ohne Tabelle: einfach keine Fahrer:innen
    const am = {}; ((aq && !aq.error && aq.data) || []).forEach((a) => { (am[a.driver_id] = am[a.driver_id] || []).push(a); }); setAreaMap(am);
  }, [sb, org.orgId]);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setMsg(null);
    if (blank(form.name)) return setMsg({ kind: "err", text: tx("Bitte den Namen eintragen.") });
    const h = form.weekly_hours === "" || form.weekly_hours === null ? null : Number(form.weekly_hours);
    if (h !== null && (!Number.isFinite(h) || h < 0 || h > 84)) return setMsg({ kind: "err", text: tx("Bitte die Wochenstunden zwischen 0 und 84 eintragen.") });
    const same = (rows || []).find((x) => x.id !== form.id && x.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    if (same) return setMsg({ kind: "err", text: tx("„{0}“ gibt es schon. Bitte Namen unterscheidbar machen (z. B. mit Nachnamen).", same.name) });
    if (form.driver && form.driver.on && !form.driver.all && (form.driver.areas || []).some((a) => blank(a.address) && (a.lat === null || a.lat === undefined))) return setMsg({ kind: "err", text: tx("Bitte für jedes Gebiet eine Adresse oder einen Kartenlink eintragen – oder das Gebiet entfernen.") });
    if (form.driver && form.driver.on && !form.driver.all && !(form.driver.places || []).length && !form.driver.home && !(form.driver.areas || []).length) return setMsg({ kind: "err", text: tx("Bitte für die Fahrer:in mindestens einen Bereich wählen – oder „Alle Fahrten“.") });
    setBusy(true);
    const row = { name: form.name.trim(), phone: normPhone(form.phone, org.country), personnel_no: clean(form.personnel_no), weekly_hours: h, active: !!form.active };
    const r = form.id ? await sb.from("staff").update(row).eq("id", form.id).select("id").single() : await sb.from("staff").insert({ org_id: org.orgId, ...row }).select("id").single();
    if (!r.error && r.data) {
      // Startpunkt und Fähigkeiten (Touren)
      const sid = r.data.id;
      const home = form.start === "home";
      const placeId = form.start && form.start.startsWith("place:") ? form.start.slice(6) : null;
      const st = await sb.from("staff_touren").upsert(await withCoords(org, { staff_id: sid, org_id: org.orgId, start_kind: home ? "home" : placeId ? "place" : "none", place_id: placeId,
        home_address: home ? clean(form.home.address) : null, home_maps_url: home ? clean(form.home.maps_url) : null, home_lat: home ? form.home.lat ?? null : null, home_lng: home ? form.home.lng ?? null : null }, "home_address", "home_lat", "home_lng"), { onConflict: "staff_id" });
      const before = skillMap[sid] || [], after = form.skills || [];
      const del = before.filter((x) => !after.includes(x)), ins = after.filter((x) => !before.includes(x));
      const d = del.length ? await sb.from("staff_skills").delete().eq("staff_id", sid).in("skill_id", del) : { error: null };
      const i = ins.length ? await sb.from("staff_skills").insert(ins.map((skill_id) => ({ staff_id: sid, skill_id, org_id: org.orgId }))) : { error: null };
      // Fahrer:in (Transport): an / aus, Bereich
      const dv = form.driver || { on: false };
      const dr = dv.on
        ? await sb.from("touren_drivers").upsert({ staff_id: sid, org_id: org.orgId, scope_all: !!dv.all, places: dv.all ? [] : dv.places || [], home: dv.all ? false : !!dv.home }, { onConflict: "staff_id" })
        : drivers[sid] ? await sb.from("touren_drivers").delete().eq("staff_id", sid) : { error: null };
      // Gebiete: alte löschen, aktuelle neu anlegen (Ort wird bei Bedarf aus der Adresse gesucht)
      let ar = { error: null };
      if (!dr.error && dv.on) {
        const old = (areaMap[sid] || []).map((a) => a.id);
        if (old.length) ar = await sb.from("touren_driver_areas").delete().in("id", old);
        const want = dv.all ? [] : dv.areas || [];
        if (!ar.error && want.length) {
          const rowsA = [];
          for (const a of want) {
            const g = await withCoords(org, { address: clean(a.address), maps_url: clean(a.maps_url), lat: a.lat ?? null, lng: a.lng ?? null });
            if (g.lat === null || g.lat === undefined) { ar = { error: { message: tx("Für „{0}“ wurde kein Ort gefunden. Bitte einen Google-Maps-Link einfügen oder „📍 Mein Standort hier“ nutzen.", a.address || "?") } }; break; }
            rowsA.push({ org_id: org.orgId, driver_id: sid, address: g.address, maps_url: g.maps_url, lat: g.lat, lng: g.lng, radius_km: Number(a.radius_km) || 10 });
          }
          if (!ar.error) ar = await sb.from("touren_driver_areas").insert(rowsA);
        }
      }
      const e2 = st.error || d.error || i.error || dr.error || ar.error;
      if (e2) { setBusy(false); return setMsg({ kind: "err", text: errText(e2) }); }
    }
    setBusy(false);
    if (r.error) {
      const m = r.error.message || "";
      return setMsg({ kind: "err", text: /personnel_no/.test(m) ? tx("Diese Personalnummer ist in Ihrer Firma schon vergeben.") : /staff_phone_check/.test(m) ? tx("Bitte eine gültige Telefonnummer eingeben (nur Ziffern, am Anfang + erlaubt).") : errText(r.error) });
    }
    setMsg({ kind: "ok", text: form.id ? tx("„{0}“ gespeichert ✓", row.name) : tx("„{0}“ angelegt ✓", row.name) });
    setForm(null); load(); if (onChanged) onChanged();
  }

  if (rows === null) return <p className="text-sm text-slate-500">{tx("Lädt …")}</p>;
  const list = rows.filter((x) => showInactive || x.active);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{tx("Inaktive zeigen")}</label>
        <div className="flex-1" />
        <button type="button" className={btnPrimary} onClick={() => { setMsg(null); setForm({ id: null, ...emptyStaff(org.country), start: "", home: emptyAddr(), skills: [], driver: { on: false, all: true, places: [], home: false, areas: [] } }); }}><Plus size={16} />{tx("Mitarbeiter:in")}</button>
      </div>
      {form && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{form.id ? tx("Mitarbeiter:in bearbeiten") : tx("Neue Mitarbeiter:in")}</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block sm:col-span-2"><span className={lbl}>{tx("Name")} *</span><input className={inp} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></label>
            <label className="block sm:col-span-2"><span className={lbl}>{tx("Mobil / WhatsApp")}</span><input className={inp} value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="+971 50 123 4567" inputMode="tel" /></label>
            <label className="block"><span className={lbl}>{tx("Personalnummer")}</span><input className={inp} value={form.personnel_no || ""} onChange={(e) => set("personnel_no", e.target.value)} /></label>
            <label className="block"><span className={lbl}>{tx("Vertragsstunden pro Woche")}</span><input type="number" min="0" max="84" step="0.5" className={inp} value={form.weekly_hours ?? ""} onChange={(e) => set("weekly_hours", e.target.value)} /></label>
            {form.id && <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={!!form.active} onChange={(e) => set("active", e.target.checked)} />{tx("Aktiv (inaktive erscheinen nicht mehr in Plänen und Listen)")}</label>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{tx("Die Vertragsstunden helfen beim fairen Verteilen: wer im Verhältnis weniger gearbeitet hat, kommt zuerst dran.")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lbl}>{tx("Startpunkt (erster Einsatz des Tages)")}</span>
              <select className={inp} value={form.start || ""} onChange={(e) => set("start", e.target.value)}>
                <option value="">{tx("– keiner –")}</option>
                {data.places.filter((pl) => pl.active || form.start === `place:${pl.id}`).map((pl) => <option key={pl.id} value={`place:${pl.id}`}>{pl.name}</option>)}
                <option value="home">{tx("Eigene Wohnadresse")}</option>
              </select>
              {data.places.length === 0 && <span className="mt-1 block text-[11px] text-slate-500">{tx("Orte wie Unterkunft oder Büro unter „Einstellungen“ anlegen.")}</span>}
            </label>
            {data.skills.filter((k) => k.active).length > 0 && (
              <div><span className={lbl}>{tx("Fähigkeiten")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.skills.filter((k) => k.active).map((k) => { const on = (form.skills || []).includes(k.id); return (
                    <button key={k.id} type="button" aria-pressed={on} onClick={() => set("skills", on ? form.skills.filter((x) => x !== k.id) : [...(form.skills || []), k.id])} className={`min-h-[36px] rounded-full border px-3 text-sm ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{k.name}</button>
                  ); })}
                </div>
              </div>
            )}
          </div>
          {(() => { const dv = form.driver || { on: false, all: true, places: [], home: false }; const setDv = (k, v) => set("driver", { ...dv, [k]: v }); return (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!dv.on} onChange={(e) => setDv("on", e.target.checked)} />🚐 {tx("Fahrer:in – fährt das Personal")}</label>
              {dv.on && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] text-slate-500">{tx("Sieht in der Mitarbeiter-App unter „Fahrten“ für heute und morgen, wen er/sie wann wo abholt und wohin es geht. Braucht einen Zugang zur App („Zugänge“).")}</p>
                  <div role="radiogroup" aria-label={tx("Bereich")} className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
                    {[[true, tx("Alle Fahrten")], [false, tx("Nur bestimmte")]].map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={dv.all === v} onClick={() => setDv("all", v)} className={`px-3 py-1.5 ${dv.all === v ? "bg-teal-600 text-white" : "bg-white text-slate-700"}`}>{l}</button>)}
                  </div>
                  {!dv.all && (
                    <div className="flex flex-wrap gap-1.5">
                      {data.places.filter((pl) => pl.active || (dv.places || []).includes(pl.id)).map((pl) => { const on = (dv.places || []).includes(pl.id); return (
                        <button key={pl.id} type="button" aria-pressed={on} onClick={() => setDv("places", on ? dv.places.filter((x) => x !== pl.id) : [...(dv.places || []), pl.id])} className={`min-h-[36px] rounded-full border px-3 text-sm ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{pl.name}</button>); })}
                      <button type="button" aria-pressed={!!dv.home} onClick={() => setDv("home", !dv.home)} className={`min-h-[36px] rounded-full border px-3 text-sm ${dv.home ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{tx("Personal mit eigener Wohnadresse")}</button>
                    </div>
                  )}
                  {!dv.all && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                      <div className="mb-1 text-sm font-medium text-slate-700">🗺 {tx("Gebiete auf der Karte")}</div>
                      <p className="mb-2 text-[11px] text-slate-500">{tx("Mittelpunkt + Umkreis. Wer innerhalb abgeholt wird (Unterkunft oder Zuhause), fährt mit dieser Fahrer:in. Liegt jemand in zwei Gebieten, zählt der nähere Mittelpunkt.")}</p>
                      {(dv.areas || []).map((a, i) => (
                        <div key={a.id || i} className="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-600">{tx("Gebiet {0}", i + 1)}</span>
                            <span className="flex items-center gap-2">
                              <label className="text-xs text-slate-600">{tx("Umkreis")}
                                <select className={`${inpBase} ml-1 py-1`} value={a.radius_km} onChange={(e) => setDv("areas", dv.areas.map((x, k) => (k === i ? { ...x, radius_km: Number(e.target.value) } : x)))}>
                                  {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
                                </select>
                              </label>
                              <button type="button" className="text-xs text-rose-700 underline" onClick={() => setDv("areas", dv.areas.filter((_, k) => k !== i))}>{tx("entfernen")}</button>
                            </span>
                          </div>
                          <AddressFields value={a} onChange={(v) => setDv("areas", dv.areas.map((x, k) => (k === i ? { ...x, ...v } : x)))} org={org} optional noLabel />
                        </div>
                      ))}
                      <button type="button" className={btnLight} onClick={() => setDv("areas", [...(dv.areas || []), { ...emptyAddr(), radius_km: 10 }])}><Plus size={16} />{tx("Gebiet")}</button>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">{tx("Einzelne Personen kann das Büro auf dem Transport-Blatt für einen Tag einer anderen Fahrer:in geben.")}</p>
                </div>
              )}
            </div>); })()}
          {form.start === "home" && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-[11px] text-slate-500">{tx("Nur Inhaber und Leitung sehen die Wohnadresse – das Büro nur auf dem Transport-Blatt, Fahrer:innen nur bei ihren Fahrten.")}</p>
              <AddressFields value={form.home || emptyAddr()} onChange={(v) => set("home", v)} org={org} optional noLabel />
            </div>
          )}
          <div className="mt-3 flex gap-2"><button type="button" className={btnPrimary} onClick={save} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button><button type="button" className={btnLight} onClick={() => setForm(null)}>{tx("Abbrechen")}</button></div>
        </div>
      )}
      <Msg msg={msg} />
      {rows.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{tx("Noch keine Mitarbeitenden. Mit „+ Mitarbeiter:in“ anlegen.")}</p> : (
        <>
        <ul className="mt-3 space-y-2 sm:hidden">
          {list.map((x) => (
            <li key={x.id} className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm ${x.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-medium text-slate-800">{x.name}{!x.active ? <span className="ml-1 text-xs font-normal text-slate-400">{tx("(inaktiv)")}</span> : null}</div>
                  <div className="text-xs text-slate-500">{x.personnel_no ? `${tx("Personalnummer")} ${x.personnel_no} · ` : ""}{x.weekly_hours ?? "–"} {tx("Std./Woche")}</div></div>
                <div className="flex flex-col items-end">
                  <button type="button" className="min-h-[36px] rounded-lg px-2 text-sm text-teal-700 underline" onClick={() => { setMsg(null); setForm(staffForm(x, starts, skillMap, drivers, areaMap)); window.scrollTo(0, 0); }}>{tx("Bearbeiten")}</button>
                  {x.active && onAbsence && <button type="button" className="min-h-[36px] rounded-lg px-2 text-sm text-rose-700 underline" onClick={() => onAbsence(x)}>🤒 {tx("Abwesend melden")}</button>}
                </div>
              </div>
              <ContactButtons phone={x.phone} />
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">{tx("Name")}</th><th className="px-3 py-2">{tx("Mobil / WhatsApp")}</th><th className="px-3 py-2">{tx("Personalnummer")}</th><th className="px-3 py-2">{tx("Std./Woche")}</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((x) => (
                <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                  <td className="px-3 py-2 font-medium text-slate-800">{x.name}{!x.active ? <span className="ml-1 text-xs font-normal text-slate-400">{tx("(inaktiv)")}</span> : null}</td>
                  <td className="px-3 py-2 text-slate-700">{x.phone ? <a href={`https://wa.me/${digits(x.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline"><Phone size={13} aria-hidden="true" />{x.phone}</a> : "–"}</td>
                  <td className="px-3 py-2 text-slate-600">{x.personnel_no || "–"}</td>
                  <td className="px-3 py-2 text-slate-600">{x.weekly_hours ?? "–"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{x.active && onAbsence && <button type="button" className="mr-3 text-xs text-rose-700 underline" onClick={() => onAbsence(x)}>🤒 {tx("Abwesend melden")}</button>}<button type="button" className="text-xs text-teal-700 underline" onClick={() => { setMsg(null); setForm(staffForm(x, starts, skillMap, drivers, areaMap)); }}>{tx("Bearbeiten")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ---------- Einstellungen D3b: Regeln, Orte, Fähigkeiten ----------
function RulesSection({ org, data, done }) {
  const st = data.settings;
  const [v, setV] = useState({ near_km: st.near_km, fairness_pp: st.fairness_pp, travel_min: st.travel_min });
  useEffect(() => { setV({ near_km: st.near_km, fairness_pp: st.fairness_pp, travel_min: st.travel_min }); }, [st.near_km, st.fairness_pp, st.travel_min]);
  const save = async () => {
    const row = { org_id: org.orgId, near_km: Number(v.near_km), fairness_pp: Number(v.fairness_pp), travel_min: Math.round(Number(v.travel_min)) };
    if (![row.near_km, row.fairness_pp, row.travel_min].every((x) => Number.isFinite(x) && x >= 0) || row.near_km > 100 || row.fairness_pp > 100 || row.travel_min > 240) return done({ error: { message: tx("Bitte gültige Zahlen eintragen (Entfernung bis 100 km, Fairness bis 100 %, Fahrzeit bis 240 Min.).") } });
    await done(await org.supabase.from("touren_settings").upsert(row, { onConflict: "org_id" }), tx("Regeln gespeichert ✓"));
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-800">{tx("Regeln für Vorschläge")}</h2>
      <p className="mb-3 text-xs text-slate-500">{tx("Branche: {0} (wird von Dienstigo eingestellt).", tx(INDUSTRY[st.industry] || INDUSTRY.general))}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className={lbl}>{tx("„In der Nähe“ bis (km)")}</span><input type="number" min="0" max="100" step="0.5" className={inp} value={v.near_km} onChange={(e) => setV({ ...v, near_km: e.target.value })} /></label>
        <label className="block"><span className={lbl}>{tx("Fairness-Bremse (Prozentpunkte)")}</span><input type="number" min="0" max="100" step="1" className={inp} value={v.fairness_pp} onChange={(e) => setV({ ...v, fairness_pp: e.target.value })} /></label>
        <label className="block"><span className={lbl}>{tx("Fahrzeit zwischen zwei Einsätzen (Min.)")}</span><input type="number" min="0" max="240" step="5" className={inp} value={v.travel_min} onChange={(e) => setV({ ...v, travel_min: e.target.value })} /></label>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{tx("Wer näher ist, wird zuerst vorgeschlagen – außer er hat in diesem Monat schon so viele Prozentpunkte mehr gearbeitet als der Durchschnitt. Die Fahrzeit ist nur ein Hinweis („knapp“).")}</p>
      <button type="button" className={`${btnPrimary} mt-3`} onClick={save}>{tx("Speichern")}</button>
    </section>
  );
}

const PLACE_KINDS = [["accommodation", "Unterkunft"], ["office", "Büro"], ["depot", "Lager"], ["other", "Sonstiges"]];
function PlacesSection({ org, data, done }) {
  const [form, setForm] = useState(null);
  const save = async () => {
    if (blank(form.name)) return done({ error: { message: tx("Bitte einen Namen eintragen.") } });
    const row = await withCoords(org, { name: form.name.trim(), kind: form.kind, address: clean(form.address), maps_url: clean(form.maps_url), lat: form.lat ?? null, lng: form.lng ?? null });
    const q = form.id ? org.supabase.from("touren_places").update(row).eq("id", form.id) : org.supabase.from("touren_places").insert({ org_id: org.orgId, ...row });
    if (await done(await q, tx("„{0}“ gespeichert ✓", row.name))) setForm(null);
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-800">{tx("Orte der Firma (Startpunkte)")}</h2>
      <p className="mb-3 text-xs text-slate-500">{tx("Z. B. Unterkunft, Büro oder Lager. Von hier wird der erste Einsatz des Tages berechnet. Wer von zu Hause startet, bekommt seine Adresse unter „Mitarbeitende“.")}</p>
      <ul className="space-y-1.5">
        {data.places.map((pl) => (
          <li key={pl.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm ${pl.active ? "" : "opacity-60"}`}>
            <b>{pl.name}</b><span className="text-xs text-slate-500">{tx((PLACE_KINDS.find((k) => k[0] === pl.kind) || PLACE_KINDS[3])[1])}</span>
            <span className="flex-1 truncate text-xs text-slate-600">{pl.address || ""}</span>
            {pl.lat !== null && pl.lat !== undefined ? <span className="text-[11px] text-emerald-700">{tx("✓ Standort")}</span> : <span className="text-[11px] text-amber-700">{tx("ohne Standort")}</span>}
            <button type="button" className="text-xs text-teal-700 underline" onClick={() => setForm({ ...pl, address: pl.address || "", maps_url: pl.maps_url || "", coordState: pl.lat !== null && pl.lat !== undefined ? "ok" : "none" })}>{tx("Bearbeiten")}</button>
            <button type="button" className="text-xs text-slate-600 underline" onClick={async () => done(await org.supabase.from("touren_places").update({ active: !pl.active }).eq("id", pl.id), pl.active ? tx("„{0}“ ist inaktiv.", pl.name) : tx("„{0}“ ist wieder aktiv ✓", pl.name))}>{pl.active ? tx("inaktiv setzen") : tx("wieder aktivieren")}</button>
            <button type="button" className="text-xs text-slate-500 underline" onClick={async () => { if (!ask(tx("„{0}“ löschen?", pl.name))) return; done(await delOrHint(org.supabase.from("touren_places").delete().eq("id", pl.id), tx("Hier starten noch Mitarbeitende – bitte zuerst deren Startpunkt ändern oder „inaktiv setzen“.")), tx("„{0}“ gelöscht", pl.name)); }}>{tx("löschen")}</button>
          </li>
        ))}
        {data.places.length === 0 && <p className="text-sm text-slate-500">{tx("Noch kein Ort angelegt.")}</p>}
      </ul>
      {form ? (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lbl}>{tx("Name")} *</span><input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tx("z. B. Unterkunft Al Quoz")} /></label>
            <label className="block"><span className={lbl}>{tx("Art")}</span><select className={inp} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{PLACE_KINDS.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></label>
          </div>
          <AddressFields value={form} onChange={setForm} org={org} optional noLabel />
          <div className="mt-3 flex gap-2"><button type="button" className={btnPrimary} onClick={save}>{tx("Speichern")}</button><button type="button" className={btnLight} onClick={() => setForm(null)}>{tx("Abbrechen")}</button></div>
        </div>
      ) : <button type="button" className={`${btnLight} mt-3`} onClick={() => setForm({ id: null, name: "", kind: "accommodation", ...emptyAddr() })}><Plus size={15} />{tx("Ort")}</button>}
    </section>
  );
}

function SkillsSection({ org, data, done }) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState({});
  const list = [...data.skills].sort((a, b) => a.sort_order - b.sort_order);
  const add = async () => { if (blank(name)) return; if (await done(await org.supabase.from("skills").insert({ org_id: org.orgId, name: name.trim(), sort_order: (list.length ? list[list.length - 1].sort_order : 0) + 1 }), tx("„{0}“ angelegt ✓", name.trim()))) setName(""); };
  const rename = async (k) => { const n = edit[k.id]; if (blank(n) || n === k.name) return; await done(await org.supabase.from("skills").update({ name: n.trim() }).eq("id", k.id), tx("„{0}“ gespeichert ✓", n.trim())); };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-800">{tx("Fähigkeiten / Qualifikationen")}</h2>
      <p className="mb-3 text-xs text-slate-500">{tx("Z. B. Pflegefachkraft, Führerschein, Glasreinigung. Bei den Mitarbeitenden ankreuzen, bei den Leistungen als „nötig“ markieren – dann wird nur vorgeschlagen, wer es kann.")}</p>
      <div className="space-y-1.5">
        {list.map((k) => (
          <div key={k.id} className={`flex flex-wrap items-center gap-2 ${k.active ? "" : "opacity-60"}`}>
            <input className={`${inp} max-w-xs`} value={edit[k.id] ?? k.name} onChange={(e) => setEdit({ ...edit, [k.id]: e.target.value })} onBlur={() => rename(k)} aria-label={tx("Name der Fähigkeit")} />
            <button type="button" className="text-xs text-slate-600 underline" onClick={async () => done(await org.supabase.from("skills").update({ active: !k.active }).eq("id", k.id), k.active ? tx("„{0}“ ist inaktiv.", k.name) : tx("„{0}“ ist wieder aktiv ✓", k.name))}>{k.active ? tx("inaktiv setzen") : tx("wieder aktivieren")}</button>
            <button type="button" className="text-xs text-slate-500 underline" onClick={async () => { if (!ask(tx("„{0}“ löschen?", k.name))) return; done(await delOrHint(org.supabase.from("skills").delete().eq("id", k.id), tx("Diese Fähigkeit ist bei Mitarbeitenden oder Leistungen eingetragen – bitte dort entfernen oder „inaktiv setzen“.")), tx("„{0}“ gelöscht", k.name)); }}>{tx("löschen")}</button>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-slate-500">{tx("Noch keine Fähigkeit angelegt.")}</p>}
      </div>
      <div className="mt-3 flex gap-2"><input className={`${inp} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder={tx("z. B. Führerschein")} aria-label={tx("Neue Fähigkeit")} /><button type="button" className={btnPrimary} onClick={add}><Plus size={15} />{tx("Fähigkeit")}</button></div>
    </section>
  );
}

// ---------- Einstellungen (Inhaber / Leitung) ----------
function SettingsView({ org, data, reload }) {
  const [msg, setMsg] = useState(null);
  const [newSvc, setNewSvc] = useState("");
  const [nf, setNf] = useState({ entity: "customer", name: "", kind: "text", options: "", required: false, staff_visible: false });
  const [edit, setEdit] = useState({});
  const sb = org.supabase;
  const done = async (r, okText) => { if (r.error) { setMsg({ kind: "err", text: errText(r.error) }); return false; } setMsg({ kind: "ok", text: okText }); await reload(); return true; };

  const services = [...data.services].sort((a, b) => a.sort_order - b.sort_order);
  const addSvc = async () => { if (blank(newSvc)) return; if (await done(await sb.from("service_types").insert({ org_id: org.orgId, name: newSvc.trim(), sort_order: (services.length ? services[services.length - 1].sort_order : 0) + 1 }), tx("„{0}“ angelegt ✓", newSvc.trim()))) setNewSvc(""); };
  const renameSvc = async (s) => { const name = edit["s" + s.id]; if (blank(name) || name === s.name) return; await done(await sb.from("service_types").update({ name: name.trim() }).eq("id", s.id), tx("„{0}“ gespeichert ✓", name.trim())); };
  const moveSvc = async (i, d) => { const a = services[i], b = services[i + d]; if (!a || !b) return; await sb.from("service_types").update({ sort_order: b.sort_order }).eq("id", a.id); await done(await sb.from("service_types").update({ sort_order: a.sort_order }).eq("id", b.id), tx("Reihenfolge gespeichert ✓")); };

  const addField = async () => {
    if (blank(nf.name)) return setMsg({ kind: "err", text: tx("Bitte einen Namen für das Feld eintragen.") });
    const options = nf.kind === "select" ? nf.options.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (nf.kind === "select" && options.length < 2) return setMsg({ kind: "err", text: tx("Bitte mindestens zwei Auswahlwerte eintragen (mit Komma getrennt).") });
    const same = data.fields.filter((f) => f.entity === nf.entity);
    if (await done(await sb.from("custom_fields").insert({ org_id: org.orgId, entity: nf.entity, name: nf.name.trim(), kind: nf.kind, options, required: nf.required, staff_visible: nf.staff_visible, sort_order: (same.length ? Math.max(...same.map((f) => f.sort_order)) : 0) + 1 }), tx("Feld „{0}“ angelegt ✓", nf.name.trim()))) setNf({ ...nf, name: "", options: "", required: false, staff_visible: false });
  };
  const patchField = async (f, patch, okText) => done(await sb.from("custom_fields").update(patch).eq("id", f.id), okText);

  const activeSkills = data.skills.filter((k) => k.active);
  const needs = (svcId, skId) => data.serviceSkills.some((x) => x.service_type_id === svcId && x.skill_id === skId);
  const toggleNeed = async (svc, sk) => {
    const q = needs(svc.id, sk.id)
      ? sb.from("service_skills").delete().eq("service_type_id", svc.id).eq("skill_id", sk.id)
      : sb.from("service_skills").insert({ service_type_id: svc.id, skill_id: sk.id, org_id: org.orgId });
    await done(await q, tx("Gespeichert ✓"));
  };
  return (
    <div className="space-y-6">
      <RulesSection org={org} data={data} done={done} />
      <PlacesSection org={org} data={data} done={done} />
      <SkillsSection org={org} data={data} done={done} />
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-800">{tx("Leistungen")}</h2>
        <p className="mb-3 text-xs text-slate-500">{tx("Die Liste, aus der beim Auftrag gewählt wird – z. B. Grundreinigung, Fensterreinigung, Wartung. Jede Firma legt ihre eigene an.")}</p>
        <div className="space-y-1.5">
          {services.map((s, i) => (
            <div key={s.id} className={`flex flex-wrap items-center gap-2 ${s.active ? "" : "opacity-60"}`}>
              <input className={`${inp} max-w-xs`} value={edit["s" + s.id] ?? s.name} onChange={(e) => setEdit({ ...edit, ["s" + s.id]: e.target.value })} onBlur={() => renameSvc(s)} aria-label={tx("Name der Leistung")} />
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => moveSvc(i, -1)} aria-label={tx("nach oben")}>↑</button>
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === services.length - 1} onClick={() => moveSvc(i, 1)} aria-label={tx("nach unten")}>↓</button>
              <button type="button" className="text-xs text-slate-600 underline" onClick={async () => done(await sb.from("service_types").update({ active: !s.active }).eq("id", s.id), s.active ? tx("„{0}“ ist inaktiv.", s.name) : tx("„{0}“ ist wieder aktiv ✓", s.name))}>{s.active ? tx("inaktiv setzen") : tx("wieder aktivieren")}</button>
              <button type="button" className="text-xs text-slate-500 underline" onClick={async () => { if (!ask(tx("„{0}“ löschen?", s.name))) return; done(await delOrHint(sb.from("service_types").delete().eq("id", s.id), tx("Diese Leistung wird schon in Aufträgen benutzt – bitte „inaktiv setzen“.")), tx("„{0}“ gelöscht", s.name)); }}>{tx("löschen")}</button>
              {activeSkills.length > 0 && (
                <span className="flex w-full flex-wrap items-center gap-1 pl-1 text-[11px] text-slate-500">{tx("nötig:")}
                  {activeSkills.map((k) => <button key={k.id} type="button" aria-pressed={needs(s.id, k.id)} onClick={() => toggleNeed(s, k)} className={`rounded-full border px-2 py-0.5 ${needs(s.id, k.id) ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}>{k.name}</button>)}
                </span>
              )}
            </div>
          ))}
          {services.length === 0 && <p className="text-sm text-slate-500">{tx("Noch keine Leistung angelegt.")}</p>}
        </div>
        <div className="mt-3 flex gap-2"><input className={`${inp} max-w-xs`} value={newSvc} onChange={(e) => setNewSvc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSvc(); }} placeholder={tx("z. B. Grundreinigung")} aria-label={tx("Neue Leistung")} /><button type="button" className={btnPrimary} onClick={addSvc}><Plus size={15} />{tx("Leistung")}</button></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-800">{tx("Zusatzfelder")}</h2>
        <p className="mb-3 text-xs text-slate-500">{tx("Eigene Angaben für Kunden oder Aufträge, z. B. „Haustier“, „Gerätenummer“, „Etage“. „Für Mitarbeitende sichtbar“ gilt ab der Mitarbeiter-Ansicht „My jobs“; sonst sehen es nur Büro und Leitung. Ein inaktives Feld wird ausgeblendet, die Werte bleiben gespeichert.")}</p>
        {["customer", "job"].map((ent) => {
          const list = data.fields.filter((f) => f.entity === ent).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={ent} className="mb-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-700">{ent === "customer" ? tx("Bei Kunden") : tx("Bei Aufträgen")}</h3>
              {list.length === 0 && <p className="text-sm text-slate-500">{tx("Keine Zusatzfelder.")}</p>}
              <ul className="space-y-1">
                {list.map((f) => (
                  <li key={f.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm ${f.active ? "" : "opacity-60"}`}>
                    <b className="min-w-[8rem]">{f.name}</b>
                    <span className="text-slate-500">{tx((FIELD_KINDS.find((k) => k[0] === f.kind) || FIELD_KINDS[0])[1])}{f.kind === "select" ? `: ${(f.options || []).join(", ")}` : ""}</span>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => patchField(f, { required: e.target.checked }, tx("Gespeichert ✓"))} />{tx("Pflichtfeld")}</label>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.staff_visible} onChange={(e) => patchField(f, { staff_visible: e.target.checked }, tx("Gespeichert ✓"))} />{tx("Für Mitarbeitende sichtbar")}</label>
                    <button type="button" className="text-xs text-slate-600 underline" onClick={() => patchField(f, { active: !f.active }, f.active ? tx("„{0}“ ist inaktiv.", f.name) : tx("„{0}“ ist wieder aktiv ✓", f.name))}>{f.active ? tx("inaktiv setzen") : tx("wieder aktivieren")}</button>
                    <button type="button" className="text-xs text-slate-500 underline" onClick={async () => { if (!ask(tx("Feld „{0}“ löschen?\n\nAlle dort eingetragenen Werte werden auch gelöscht. Nur ausblenden: „inaktiv setzen“.", f.name))) return; done(await delOrHint(sb.from("custom_fields").delete().eq("id", f.id), tx("Konnte nicht gelöscht werden.")), tx("Feld „{0}“ gelöscht", f.name)); }}>{tx("löschen")}</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block"><span className={lbl}>{tx("Für")}</span><select className={inp} value={nf.entity} onChange={(e) => setNf({ ...nf, entity: e.target.value })}><option value="customer">{tx("Kunden")}</option><option value="job">{tx("Aufträge")}</option></select></label>
            <label className="block"><span className={lbl}>{tx("Name des Feldes")}</span><input className={inp} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder={tx("z. B. Haustier")} /></label>
            <label className="block"><span className={lbl}>{tx("Art")}</span><select className={inp} value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value })}>{FIELD_KINDS.map(([k, l]) => <option key={k} value={k}>{tx(l)}</option>)}</select></label>
            {nf.kind === "select" ? <label className="block"><span className={lbl}>{tx("Auswahlwerte (mit Komma)")}</span><input className={inp} value={nf.options} onChange={(e) => setNf({ ...nf, options: e.target.value })} placeholder={tx("z. B. klein, mittel, groß")} /></label> : <div />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={nf.required} onChange={(e) => setNf({ ...nf, required: e.target.checked })} />{tx("Pflichtfeld")}</label>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={nf.staff_visible} onChange={(e) => setNf({ ...nf, staff_visible: e.target.checked })} />{tx("Für Mitarbeitende sichtbar")}</label>
            <button type="button" className={btnPrimary} onClick={addField}><Plus size={15} />{tx("Feld anlegen")}</button>
          </div>
        </div>
      </section>
      <Msg msg={msg} />
    </div>
  );
}

// ---------- Seite ----------
export default function TourenView() {
  useLang();
  const org = useContext(OrgContext);
  const isLeader = ["owner", "supervisor"].includes(org.role);
  const [tab, setTab] = useState("jobs");
  const [data, setData] = useState({ customers: [], addresses: [], services: [], fields: [], settings: DEFAULT_SETTINGS, skills: [], places: [], serviceSkills: [], prefs: [], staffList: [] });
  const [jobs, setJobs] = useState([]);
  const [assign, setAssign] = useState([]); // job_staff der sichtbaren Aufträge
  const [openCount, setOpenCount] = useState(0);
  const [assignDlg, setAssignDlg] = useState(null); // Auftrag, für den Personal gewählt wird
  const [day, setDay] = useState(() => isoOf(new Date()));
  const [mode, setMode] = useState("day");
  const [showCancelled, setShowCancelled] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [jobDlg, setJobDlg] = useState(null); // { job } | { preset }
  const [custDlg, setCustDlg] = useState(null); // { customer } | {}
  const [flash, setFlash] = useState(null);
  const [zugOpen, setZugOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [conflicts, setConflicts] = useState([]); // eingeteilte Personen, die abwesend sind
  const [absentFor, setAbsentFor] = useState(null); // Mitarbeiter:in für „Abwesend melden“
  const [reqOpen, setReqOpen] = useState(false);
  const [reqCount, setReqCount] = useState(0);
  const [repBusy, setRepBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [attention, setAttention] = useState({ overrun: [], confirm: [] }); // D3c-1: läuft länger / offene Fortsetzungen
  const [contDlg, setContDlg] = useState(null);
  const sb = org.supabase;

  const loadBase = useCallback(async () => {
    const [c, a, s, f, ts, sk, pl, ss, pr, ctx, oc] = await Promise.all([
      sb.from("customers").select("*").eq("org_id", org.orgId).order("customer_no"),
      sb.from("customer_addresses").select("*").eq("org_id", org.orgId).order("created_at"),
      sb.from("service_types").select("*").eq("org_id", org.orgId).order("sort_order"),
      sb.from("custom_fields").select("*").eq("org_id", org.orgId).order("sort_order"),
      sb.from("touren_settings").select("*").eq("org_id", org.orgId).maybeSingle(),
      sb.from("skills").select("*").eq("org_id", org.orgId).order("sort_order"),
      sb.from("touren_places").select("*").eq("org_id", org.orgId).order("created_at"),
      sb.from("service_skills").select("*").eq("org_id", org.orgId),
      sb.from("customer_staff_pref").select("*").eq("org_id", org.orgId),
      sb.rpc("touren_day_context", { p_org: org.orgId, p_day: isoOf(new Date()) }),
      sb.rpc("touren_open_count", { p_org: org.orgId }),
    ]);
    const err = c.error || a.error || s.error || f.error || ts.error || sk.error || pl.error || ss.error || pr.error || ctx.error;
    if (err) { setLoadErr(errText(err)); return; }
    setData({ customers: c.data || [], addresses: a.data || [], services: s.data || [], fields: f.data || [],
      settings: { ...DEFAULT_SETTINGS, ...(ts.data || {}) }, skills: sk.data || [], places: pl.data || [], serviceSkills: ss.data || [], prefs: pr.data || [],
      staffList: ((ctx.data && ctx.data.staff) || []).map((x) => ({ id: x.id, name: x.name })) });
    setOpenCount(oc.error ? 0 : oc.data || 0);
    if (isLeader) { const rq = await sb.from("requests").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("status", "open"); setReqCount(rq.error ? 0 : rq.count || 0); }
    setLoaded(true);
  }, [sb, org.orgId, isLeader]);

  const range = mode === "month" ? (() => { const g = monthGrid(day); return [g[0], g[g.length - 1]]; })() : mode === "week" ? [mondayOf(day), addDays(mondayOf(day), 6)] : [day, day];
  const loadJobs = useCallback(async () => {
    const r = await sb.from("jobs").select("*").eq("org_id", org.orgId).gte("work_date", range[0]).lte("work_date", range[1]).order("work_date").order("start_time");
    if (r.error) { setLoadErr(errText(r.error)); return; }
    setJobs(r.data || []);
    const ids = (r.data || []).map((j) => j.id);
    const js = ids.length ? await sb.from("job_staff").select("job_id, staff_id").in("job_id", ids) : { data: [] };
    setAssign(js.data || []);
  }, [sb, org.orgId, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // betroffene Aufträge: heute bis +30 Tage (rote Box) und die sichtbaren Tage (Karten)
  const loadConflicts = useCallback(async () => {
    const today = isoOf(new Date());
    let from = range[0] < today ? range[0] : today;
    let to = addDays(today, 30) > range[1] ? addDays(today, 30) : range[1];
    if ((dateOf(to) - dateOf(from)) / 86400000 > 62) { from = range[0]; to = addDays(range[0], 62); }
    const [r, a] = await Promise.all([sb.rpc("touren_absence_conflicts", { p_org: org.orgId, p_from: from, p_to: to }), sb.rpc("touren_attention", { p_org: org.orgId })]);
    setConflicts(r.error ? [] : r.data || []);
    setAttention(!a.error && a.data ? { overrun: a.data.overrun || [], confirm: a.data.confirm || [] } : { overrun: [], confirm: [] });
  }, [sb, org.orgId, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadBase(); }, [loadBase]);
  // D3c-2: regelmäßige Aufträge bis 12 Wochen im Voraus auffüllen (einmal beim Öffnen)
  useEffect(() => { sb.rpc("touren_series_fill", { p_org: org.orgId }).then((r) => { if (r && !r.error && r.data) loadJobs(); }); }, [sb, org.orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { loadConflicts(); }, [loadConflicts]);
  // live: alle 60 s „läuft länger“ / Status neu laden, solange „Aufträge“ offen ist
  useEffect(() => { if (tab !== "jobs") return undefined; const t = setInterval(() => { loadConflicts(); loadJobs(); }, 60000); return () => clearInterval(t); }, [tab, loadConflicts, loadJobs]);
  const openJobById = async (id, cont) => { const r = await sb.from("jobs").select("*").eq("id", id).single(); if (r.error) { setFlash(errText(r.error)); return; } if (cont || r.data.needs_confirm) setContDlg(r.data); else setJobDlg({ job: r.data }); };
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); }, [flash]);

  const onJobSaved = async (text, date, extra) => { setJobDlg(null); setFlash(text); if (extra && extra.teamJob) setAssignDlg({ ...extra.teamJob, __team: true }); await loadBase(); if (date && (date < range[0] || date > range[1])) setDay(date); else await loadJobs(); };
  const onCustSaved = async (text, customer, keepOpen, addrOnly) => {
    setFlash(text); await loadBase();
    if (keepOpen && !addrOnly) setCustDlg(null);
    else if (!keepOpen) setCustDlg({ customer });
  };

  TERMS = data.settings.industry || "general";
  const afterAssign = async () => { await loadJobs(); await loadConflicts(); const oc = await sb.rpc("touren_open_count", { p_org: org.orgId }); if (!oc.error) setOpenCount(oc.data || 0); };
  const absentSet = useMemo(() => new Set(conflicts.map((c) => `${c.job_id}|${c.staff_id}`)), [conflicts]);
  const todayIso = isoOf(new Date());
  const upcoming = conflicts.filter((c) => c.work_date >= todayIso && c.work_date <= addDays(todayIso, 30)).sort((a, b) => (a.work_date + a.start_time).localeCompare(b.work_date + b.start_time));
  // „Ersatz finden“: Person aus dem Auftrag nehmen, dann gleich die Vorschläge zeigen
  const replace = async (c) => {
    setRepBusy(true);
    const d = await sb.from("job_staff").delete().eq("job_id", c.job_id).eq("staff_id", c.staff_id);
    const j = await sb.from("jobs").select("*").eq("id", c.job_id).single();
    setRepBusy(false);
    if (d.error || j.error) { setFlash(errText(d.error || j.error)); return; }
    await afterAssign();
    setAssignDlg(j.data);
  };
  const [bulkRep, setBulkRep] = useState(null); // mehrere Tage abwesend: ein Ersatz für alle
  const afterAbsence = async (text) => { setAbsentFor(null); setFlash(text); await afterAssign(); if (isLeader) { const rq = await sb.from("requests").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("status", "open"); setReqCount(rq.error ? 0 : rq.count || 0); } };
  const hasPlanner = PLANNER_ROLES.includes(org.role) && (org.products || []).some((p) => p === "generic_planner" || p === "lab_planner");
  const plannerHref = (org.products || []).includes("generic_planner") ? "/allgemein" : "/labor";
  const item = (icon, label, key, badge) => { const Icon = icon; return (
    <button type="button" className={`dg-item${badge ? " dg-item-alert" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} title={badge ? tx("{0} Aufträge ohne volles Personal (nächste 30 Tage)", badge) : undefined}><Icon size={18} strokeWidth={1.9} aria-hidden="true" /><span className="dg-item-label">{tx(label)}</span>{badge ? <span className="dg-badge">{badge}</span> : null}</button>
  ); };
  const sidebar = (
    <nav aria-label={tx("Hauptmenü")} className="dg-nav">
      <div className="dg-brand">
        <span className="dg-mark" aria-hidden="true"><MapPin size={18} strokeWidth={2} /></span>
        <span className="dg-brand-text"><span className="dg-brand-name">Dienstigo</span><span className="dg-brand-org">{org.orgName} · {tx(ROLE_LABEL[org.role] || org.role)}</span></span>
      </div>
      <div className="dg-group">
        <div className="dg-group-label">{tx("Touren")}</div>
        {item(ClipboardList, "Aufträge", "jobs", openCount)}
        {item(Users, "Kunden", "customers")}
        {isLeader && item(UserCog, "Mitarbeitende", "staff")}
        {isLeader && item(Settings, "Einstellungen", "settings")}
      </div>
      {isLeader && (
        <div className="dg-group">
          <div className="dg-group-label">{tx("Team")}</div>
          <button type="button" className={`dg-item${reqCount ? " dg-item-alert" : ""}`} onClick={() => setReqOpen(true)} title={reqCount ? tx("{0} offene Anträge", reqCount) : undefined}><FileText size={18} strokeWidth={1.9} aria-hidden="true" /><span className="dg-item-label">{tx("Anträge")}</span>{reqCount ? <span className="dg-badge">{reqCount}</span> : null}</button>
          <button type="button" className="dg-item" onClick={() => setZugOpen(true)}><KeyRound size={18} strokeWidth={1.9} aria-hidden="true" /><span className="dg-item-label">{tx("Zugänge")}</span></button>
        </div>
      )}
      {hasPlanner && (
        <div className="dg-group">
          <div className="dg-group-label">{tx("Planung")}</div>
          <a href={plannerHref} className="dg-item"><CalendarDays size={18} strokeWidth={1.9} aria-hidden="true" /><span className="dg-item-label">{tx("Dienstplan")}</span></a>
        </div>
      )}
      {flash && <div className="dg-group" role="status"><div className="dg-msg dg-msg-ok">{flash}</div></div>}
      <div className="dg-bottom">
        <button type="button" className="dg-item" onClick={() => sb.auth.signOut()}><LogOut size={18} strokeWidth={1.9} aria-hidden="true" /><span className="dg-item-label">{tx("Abmelden")}</span></button>
      </div>
    </nav>
  );

  const titles = { jobs: ["Aufträge", "Jeder Auftrag mit eigener Zeit, Adresse und Anzahl Personal – von Hand eingetragen, z. B. nach einem Anruf."], customers: ["Kunden", "Kontaktdaten, Adressen mit Standort und Hinweise für die Mitarbeitenden."], settings: ["Einstellungen", "Regeln für Vorschläge, Orte, Fähigkeiten, Leistungen und eigene Zusatzfelder für Ihre Firma."], staff: ["Mitarbeitende", "Die Personen, die beim Kunden arbeiten – gleiche Liste wie im Dienstplan und in der Zeiterfassung."] };
  const [h1, sub] = titles[tab] || titles.jobs;
  return (
    <div className="tv-root dg-root min-h-screen bg-[#F4F6FA] p-3 sm:p-5">
      <style>{MOBILE_CSS}</style>
      {/* Handy: schmale Kopfzeile statt Menü-Karte */}
      <div className="tv-only-phone mb-1 flex items-center gap-2 px-1 pt-1">
        <span className="dg-mark" aria-hidden="true"><MapPin size={16} strokeWidth={2} /></span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600"><b className="text-slate-800">Dienstigo</b> · {org.orgName} · {tx(ROLE_LABEL[org.role] || org.role)}</span>
      </div>
      <PlannerShell sidebar={sidebar}>
        <header className="dg-pagehead"><div><h1>{tx(h1)}</h1><p>{tx(sub)}</p></div></header>
        {loadErr && <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadErr}</div>}
        {!loadErr && !loaded && <p className="text-sm text-slate-500">{tx("Lädt …")}</p>}
        {!loadErr && loaded && tab === "jobs" && <ConflictBox items={upcoming} onReplace={replace} onReplaceAll={(g) => setBulkRep(g)} busy={repBusy} attention={attention} onOpenJob={(id) => openJobById(id)} onPlan={(id) => openJobById(id, true)} />}
        {!loadErr && loaded && tab === "jobs" && (
          <JobsView org={org} data={data} jobs={jobs} assign={assign} absent={absentSet} onPrint={() => setPrintOpen(true)} onAssign={(j) => setAssignDlg(j)} day={day} setDay={setDay} mode={mode} setMode={setMode} showCancelled={showCancelled} setShowCancelled={setShowCancelled}
            onNew={(d) => setJobDlg({ preset: { date: d } })} onOpen={(j) => (j.needs_confirm ? setContDlg(j) : setJobDlg({ job: j }))} />
        )}
        {!loadErr && loaded && tab === "customers" && <CustomersView data={data} onNew={() => setCustDlg({})} onOpen={(c) => setCustDlg({ customer: c })} />}
        {!loadErr && loaded && tab === "settings" && isLeader && <SettingsView org={org} data={data} reload={loadBase} />}
        {!loadErr && loaded && tab === "staff" && isLeader && <StaffView org={org} data={data} onChanged={loadBase} onAbsence={(x) => setAbsentFor(x)} />}
      </PlannerShell>
      {/* Handy: Leiste unten wie in einer App */}
      <nav className="tv-only-phone tv-tabbar" aria-label={tx("Hauptmenü")}>
        {[[ClipboardList, "Aufträge", "jobs"], [Users, "Kunden", "customers"], ...(isLeader ? [[UserCog, "Mitarbeitende", "staff"]] : [])].map(([Icon, label, key]) => (
          <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setMoreOpen(false); window.scrollTo(0, 0); }}><span className="relative"><Icon size={20} aria-hidden="true" />{key === "jobs" && openCount > 0 ? <span className="absolute -right-3 -top-2 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{openCount}</span> : null}</span><span>{tx(label)}</span></button>
        ))}
        <button type="button" aria-expanded={moreOpen} aria-current={tab === "settings" ? "page" : undefined} onClick={() => setMoreOpen((v) => !v)}><MoreHorizontal size={20} aria-hidden="true" /><span>{tx("Mehr")}</span></button>
      </nav>
      {moreOpen && (
        <div className="tv-only-phone fixed inset-0 z-40 bg-slate-900/30" onClick={() => setMoreOpen(false)}>
          <div className="tv-sheet" onClick={(e) => e.stopPropagation()}>
            {isLeader && <button type="button" onClick={() => { setTab("settings"); setMoreOpen(false); window.scrollTo(0, 0); }}><Settings size={18} aria-hidden="true" />{tx("Einstellungen")}</button>}
            {isLeader && <button type="button" onClick={() => { setReqOpen(true); setMoreOpen(false); }}><FileText size={18} aria-hidden="true" />{tx("Anträge")}{reqCount ? <span className="ml-auto rounded-full bg-rose-600 px-2 text-xs font-bold text-white">{reqCount}</span> : null}</button>}
            {isLeader && <button type="button" onClick={() => { setZugOpen(true); setMoreOpen(false); }}><KeyRound size={18} aria-hidden="true" />{tx("Zugänge")}</button>}
            {hasPlanner && <a href={plannerHref}><CalendarDays size={18} aria-hidden="true" />{tx("Dienstplan")}</a>}
            <button type="button" onClick={() => sb.auth.signOut()}><LogOut size={18} aria-hidden="true" />{tx("Abmelden")}</button>
          </div>
        </div>
      )}
      {flash && <div role="status" className="tv-only-phone tv-toast">{flash}</div>}
      {zugOpen && <ZugaengeDialog onClose={() => setZugOpen(false)} />}
      {reqOpen && <RequestsDialog onChanged={() => afterAbsence(null)} onClose={() => { setReqOpen(false); afterAbsence(null); }} />}
      {contDlg && <ContinuationDialog org={org} data={data} job={contDlg} onClose={() => setContDlg(null)}
        onSaved={async (text, date) => { setContDlg(null); await onJobSaved(text, date); await loadConflicts(); }} onAssign={(j) => setAssignDlg(j)} />}
      {printOpen && data && <PrintDialog org={org} data={data} day={day} mode={mode} onClose={() => setPrintOpen(false)} />}
      {absentFor && <AbsenceDialog org={org} person={absentFor} onClose={() => setAbsentFor(null)} onSaved={afterAbsence} />}
      {bulkRep && <BulkReplaceDialog org={org} data={data} person={{ staff_id: bulkRep[0].staff_id, staff_name: bulkRep[0].staff_name }} items={bulkRep} onClose={() => setBulkRep(null)} onDone={afterAssign} onReplaceOne={(it) => { setBulkRep(null); replace(it); }} />}
      {assignDlg && <AssignPanel org={org} job={assignDlg} data={data} onChanged={afterAssign}
        onClose={async () => { const a = assignDlg; setAssignDlg(null); if (a && a.__team) { const r = await sb.rpc("touren_series_team_from", { p_job: a.id }); if (!r.error) setFlash(tx("Personal für alle Termine der Reihe übernommen ✓")); await afterAssign(); } }}
        onTeamAll={async () => { const a = assignDlg; setAssignDlg(null); const r = await sb.rpc("touren_series_team_from", { p_job: a.id }); setFlash(r.error ? errText(r.error) : tx("Personal für alle folgenden Termine übernommen ✓")); await afterAssign(); }} />}
      {jobDlg && <JobDialog org={org} data={data} job={jobDlg.job} preset={jobDlg.preset} onClose={() => setJobDlg(null)} onSaved={async (t, d, e) => { await onJobSaved(t, d, e); await loadConflicts(); }} onAssign={(j) => { setJobDlg(null); setAssignDlg(j); }} />}
      {custDlg && <CustomerDialog key={custDlg.customer ? custDlg.customer.id : "new"} org={org} data={data} customer={custDlg.customer ? data.customers.find((x) => x.id === custDlg.customer.id) || custDlg.customer : null} onClose={() => setCustDlg(null)} onSaved={onCustSaved}
        onNewJob={(c, o) => { setCustDlg(null); setTab("jobs"); setJobDlg({ preset: { customerId: c.id, date: day, repeat: !!(o && o.repeat) } }); }} />}
    </div>
  );
}
