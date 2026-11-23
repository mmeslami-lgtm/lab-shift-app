"use client";

// Touren (Paket D3a, 21.11.2026): Kunden + Aufträge, von Hand eingetragen (Inhaber, Leitung, Büro).
// Für alle Branchen mit Arbeit beim Kunden (Reinigung, Technik, Pflege …) – nichts ist nur für eine Firma gemacht.
// Kein fester Schichtplan: Zeit, Adresse und Personenzahl sind bei jedem Auftrag anders und werden von Hand eingetragen.
// Adresse: aus den gespeicherten Adressen des Kunden wählen oder neu eintragen (Kartenlink → Koordinaten).
// Noch nicht hier (D3b): Personen zuteilen, „My jobs“, Anfragen. Kein Preis (Entscheidung Nutzer).
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { OrgContext } from "../lib/orgContext";
import PlannerShell from "./PlannerShell";
import ZugaengeDialog from "./ZugaengeDialog";
import { tx as txRaw, loc, wdShort, wdLong, dmy, dm, isoDmy, getLang, dec } from "../lib/i18n";
import { useLang } from "../lib/useLang";
import { coordsFromText, isShortMapsLink, mapsHref, normPhone } from "../lib/maps";
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
import { CalendarDays, ClipboardList, Users, Settings, LogOut, MapPin, Plus, X, ChevronLeft, ChevronRight, Phone, KeyRound, UserCog, MoreHorizontal } from "lucide-react";

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
const hhmm = (t) => String(t || "").slice(0, 5);
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":"); return (+h || 0) * 60 + (+m || 0); };
const endOf = (start, dur) => { const e = (toMin(start) + (dur || 0)) % 1440; return `${pad(Math.floor(e / 60))}:${pad(e % 60)}`; };
const durTxt = (min) => { const h = Math.floor(min / 60), m = min % 60; return getLang() === "en" ? (h ? `${h} h` : "") + (m ? ` ${m} min` : "") : (h ? `${h} Std.` : "") + (m ? ` ${m} Min.` : ""); };
const blank = (s) => !String(s || "").trim();
const clean = (s) => (blank(s) ? null : String(s).trim());
const digits = (s) => String(s || "").replace(/\D/g, "");
const custName = (c) => (c ? (c.kind === "company" && c.company ? `${c.company} – ${c.name}` : c.name) : "?");

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
        const name = <>{f.name}{f.required ? " *" : ""}{f.staff_visible ? <span className="ml-1 text-[10px] text-slate-400">{tx("(für Mitarbeitende sichtbar)")}</span> : null}</>;
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
  const set = (k, v) => onChange({ ...value, [k]: v });
  const check = async (raw) => {
    const link = linkIn(raw);
    setBusy(true); setHint(null);
    const r = await resolve(link);
    onChange({ ...value, maps_url: link, lat: r.lat, lng: r.lng, coordState: r.state });
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
        onChange({ ...value, lat, lng, maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, coordState: "ok" }); setBusy(false); },
      () => { setBusy(false); setHint(tx("Standort nicht freigegeben. Bitte in den Einstellungen des Telefons erlauben.")); },
      { enableHighAccuracy: true, timeout: 15000 });
  };
  const st = value.coordState;
  const sbtn = "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={lbl}>{tx("Adresse")}{optional ? "" : " *"}</span>
        <input className={inp} value={value.address || ""} onChange={(e) => set("address", e.target.value)} placeholder={tx("z. B. Marina Walk 12, Wohnung 804")} />
      </label>
      <label className="block sm:col-span-2">
        <span className={lbl}>{tx("Standort (freiwillig – die Adresse reicht)")}</span>
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

  async function save() {
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
      let a = manual ? addrRow(addr) : addresses.find((x) => x.id === addrChoice);
      if (manual && (saveAddr || newCust)) {
        const ia = await sb.from("customer_addresses").insert({ org_id: org.orgId, customer_id: customer.id, ...addrRow(addr) }).select().single();
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
        const up = await sb.from("jobs").update({ ...row, status: f.status }).eq("id", job.id).select().single();
        if (up.error) throw up.error;
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

  async function deleteJob() {
    if (!ask(tx("Auftrag Nr. {0} wirklich löschen?\n\nDas geht nicht rückgängig. Wenn der Kunde nur abgesagt hat, besser „Stornieren“.", job.job_no))) return;
    setBusy(true);
    const r = await removeRow(org.supabase.from("jobs").delete().eq("id", job.id));
    if (r.error || r.blocked) { setMsg({ kind: "err", text: r.error ? errText(r.error) : tx("Erledigte oder stornierte Aufträge können nicht gelöscht werden.") }); setBusy(false); return; }
    onSaved(tx("Auftrag gelöscht"), job.work_date);
  }
  async function cancelJob() {
    if (blank(cancelReason)) return setMsg({ kind: "err", text: tx("Bitte einen Grund für die Stornierung eintragen.") });
    setBusy(true);
    const up = await org.supabase.from("jobs").update({ status: "cancelled", cancel_reason: cancelReason.trim() }).eq("id", job.id);
    if (up.error) { setMsg({ kind: "err", text: errText(up.error) }); setBusy(false); return; }
    onSaved(tx("Auftrag storniert"), job.work_date);
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

      <section className="mb-2 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={lbl}>{tx("Hinweise für Mitarbeitende")}</span><textarea rows={3} className={inp} value={f.notes_staff} onChange={(e) => set("notes_staff", e.target.value)} placeholder={tx("z. B. Schlüssel beim Pförtner, Parken in der Tiefgarage")} /></label>
        <label className="block"><span className={lbl}>{tx("Interne Notiz (nur Büro und Leitung)")}</span><textarea rows={3} className={inp} value={f.notes_internal} onChange={(e) => set("notes_internal", e.target.value)} /></label>
      </section>
      {jobFields.length > 0 && <section className="mb-2"><ExtraInputs fields={jobFields} values={f.extra} onChange={(v) => set("extra", v)} /></section>}

      <Msg msg={msg} />
      <div className="tv-actions mt-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          {editing && job.status !== "cancelled" && !cancelOpen && <button type="button" className="text-sm text-rose-700 underline" onClick={() => setCancelOpen(true)}>{tx("Auftrag stornieren …")}</button>}
          {editing && job.status !== "cancelled" && job.status !== "done" && !cancelOpen && onAssign && <button type="button" className="ml-3 text-sm text-teal-700 underline" onClick={() => onAssign(job)}>{tx("Personal zuteilen")}</button>}
          {editing && ["new", "accepted"].includes(job.status) && !cancelOpen && <button type="button" className="ml-3 text-sm text-slate-500 underline" onClick={deleteJob} disabled={busy}>{tx("Löschen")}</button>}
          {cancelOpen && (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${inpBase} w-64`} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={tx("Grund, z. B. Kunde hat abgesagt")} autoFocus />
              <button type="button" className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={cancelJob} disabled={busy}>{tx("Stornieren")}</button>
              <button type="button" className="text-sm text-slate-600 underline" onClick={() => setCancelOpen(false)}>{tx("Zurück")}</button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnLight} onClick={onClose}>{tx("Abbrechen")}</button>
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Personal zuteilen (D3b) ----------
function AssignPanel({ org, job, data, onClose, onChanged }) {
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
  const have = rows.filter((r) => r.here).length;
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
      <div className="tv-actions mt-4 flex justify-end"><button type="button" className={btnPrimary} onClick={onClose}>{tx("Fertig")}</button></div>
    </Modal>
  );
}

// ---------- Aufträge: Tag / Woche ----------
function JobCard({ j, data, onOpen, compact, assign = [], onAssign }) {
  const c = data.customers.find((x) => x.id === j.customer_id);
  const s = data.services.find((x) => x.id === j.service_type_id);
  const st = STATUS[j.status] || STATUS.new;
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm hover:border-teal-400 hover:shadow ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} ${j.status === "cancelled" ? "opacity-60" : ""}`}>
    <button type="button" onClick={() => onOpen(j)} className="block w-full text-left">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={`font-semibold text-slate-800 ${compact ? "text-xs" : "text-sm"}`}>{hhmm(j.start_time)}–{endOf(j.start_time, j.duration_min)}{!compact && <span className="ml-2 font-normal text-slate-500">{durTxt(j.duration_min)}</span>}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{tx(st.label)}</span>
      </div>
      <div className={`mt-0.5 truncate ${compact ? "text-xs" : "text-sm"} text-slate-800`}>{custName(c)}{!compact && c ? <span className="ml-1 text-slate-400">#{c.customer_no}</span> : null}</div>
      {!compact && <div className="mt-0.5 truncate text-xs text-slate-600">{j.address_text}</div>}
      <div className={`mt-0.5 flex flex-wrap gap-x-3 text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {s ? <span>{s.name}</span> : null}
        {(() => { const n = assign.filter((a) => a.job_id === j.id).length; const full = n >= j.staff_needed;
          return <span className={j.status === "cancelled" ? "" : full ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>{tx("Personal: {0}/{1}", n, j.staff_needed)}</span>; })()}
        {j.material ? <span>{j.material === "ours" ? tx("Material: von uns") : tx("Material: vom Kunden")}</span> : null}
        {!compact && <span>{tx("Nr. {0}", j.job_no)}</span>}
      </div>
    </button>
    {!compact && (() => { const names = assign.filter((a) => a.job_id === j.id).map((a) => (data.staffList.find((x) => x.id === a.staff_id) || {}).name || "?");
      return names.length ? <div className="mt-1 text-xs text-slate-700">👤 {names.join(", ")}</div> : null; })()}
    {!compact && j.status !== "cancelled" && j.status !== "done" && onAssign && (
      <button type="button" onClick={() => onAssign(j)} className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white hover:bg-teal-700 sm:w-auto">👥 {tx("Personal zuteilen")}</button>
    )}
    {!compact && j.status !== "cancelled" && <div className="sm:hidden"><ContactButtons phone={c && c.phone} map={j} /></div>}
    </div>
  );
}

function JobsView({ org, data, jobs, assign, day, setDay, mode, setMode, showCancelled, setShowCancelled, onNew, onOpen, onAssign }) {
  const visible = jobs.filter((j) => showCancelled || j.status !== "cancelled");
  const today = isoOf(new Date());
  const step = mode === "week" ? 7 : 1;
  const weekStart = mondayOf(day);
  const days = mode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [day];
  const head = mode === "week" ? `${dm(dateOf(days[0]))} – ${dmy(dateOf(days[6]))}` : `${wdLong(dateOf(day).getDay())}, ${dmy(dateOf(day))}`;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className={btnLight} onClick={() => setDay(addDays(day, -step))} aria-label={tx("Zurück")}><ChevronLeft size={16} /></button>
          <button type="button" className={btnLight} onClick={() => setDay(today)}>{tx("Heute")}</button>
          <button type="button" className={btnLight} onClick={() => setDay(addDays(day, step))} aria-label={tx("Weiter")}><ChevronRight size={16} /></button>
        </div>
        <input type="date" className={inpBase} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={tx("Datum")} />
        <div role="radiogroup" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {[["day", "Tag"], ["week", "Woche"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`px-3 py-1.5 ${mode === k ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{tx(l)}</button>)}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{tx("Stornierte zeigen")}</label>
        <div className="flex-1" />
        <button type="button" className={btnPrimary} onClick={() => onNew(mode === "day" ? day : (days.includes(today) ? today : days[0]))}><Plus size={16} />{tx("Auftrag")}</button>
      </div>
      <h2 className="mb-2 text-base font-semibold text-slate-700">{head}</h2>
      {mode === "day" ? (
        <div className="space-y-2">
          {visible.filter((j) => j.work_date === day).length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{tx("Keine Aufträge an diesem Tag.")}</p>}
          {visible.filter((j) => j.work_date === day).map((j) => <JobCard key={j.id} j={j} data={data} onOpen={onOpen} assign={assign} onAssign={onAssign} />)}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d) => {
            const list = visible.filter((j) => j.work_date === d);
            return (
              <div key={d} className={`min-h-[120px] rounded-xl border p-1.5 ${d === today ? "border-teal-400 bg-teal-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                <button type="button" onClick={() => { setDay(d); setMode("day"); }} className="mb-1 flex w-full items-baseline justify-between px-1 text-left text-xs font-semibold text-slate-700 hover:text-teal-700">
                  <span>{wdShort(dateOf(d).getDay())} {dm(dateOf(d))}</span><span className="font-normal text-slate-500">{list.length || ""}</span>
                </button>
                <div className="space-y-1">{list.map((j) => <JobCard key={j.id} j={j} data={data} onOpen={onOpen} compact assign={assign} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
    org.supabase.from("jobs").select("id, job_no, work_date, start_time, duration_min, service_type_id, status, address_text").eq("org_id", org.orgId).eq("customer_id", customer.id).order("work_date", { ascending: false }).limit(20)
      .then(({ data: rows }) => { if (alive) setHistory(rows || []); });
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
          const ia = await org.supabase.from("customer_addresses").insert({ org_id: org.orgId, customer_id: ins.data.id, ...addrRow(firstAddr) });
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
      ? org.supabase.from("customer_addresses").update(addrRow(addrEdit)).eq("id", addrEdit.id)
      : org.supabase.from("customer_addresses").insert({ org_id: org.orgId, customer_id: customer.id, ...addrRow(addrEdit) });
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

      {editing && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">{tx("Letzte Aufträge")}</h3><button type="button" className={btnLight} onClick={() => onNewJob(customer)}><Plus size={15} />{tx("Auftrag für diesen Kunden")}</button></div>
          {history === null ? <p className="text-sm text-slate-500">{tx("Lädt …")}</p> : history.length === 0 ? <p className="text-sm text-slate-500">{tx("Noch keine Aufträge.")}</p> : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {history.map((h) => { const s = data.services.find((x) => x.id === h.service_type_id); return (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5"><span className="w-24 text-slate-700">{isoDmy(h.work_date)}</span><span className="w-24 text-slate-600">{hhmm(h.start_time)}–{endOf(h.start_time, h.duration_min)}</span><span className="flex-1 truncate text-slate-600">{s ? s.name : ""}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${(STATUS[h.status] || STATUS.new).cls}`}>{tx((STATUS[h.status] || STATUS.new).label)}</span></li>
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
const staffForm = (x, starts, skillMap) => {
  const t = starts[x.id];
  return { ...x, phone: x.phone || "", personnel_no: x.personnel_no || "",
    start: !t ? "" : t.start_kind === "home" ? "home" : t.start_kind === "place" && t.place_id ? `place:${t.place_id}` : "",
    home: t && t.start_kind === "home" ? { address: t.home_address || "", maps_url: t.home_maps_url || "", lat: t.home_lat, lng: t.home_lng, coordState: t.home_lat !== null && t.home_lat !== undefined ? "ok" : "none" } : emptyAddr(),
    skills: skillMap[x.id] || [] };
};
const emptyStaff = (country) => ({ name: "", phone: "", personnel_no: "", weekly_hours: country === "AE" ? 48 : 40, active: true });
function StaffView({ org, data, onChanged }) {
  const sb = org.supabase;
  const [rows, setRows] = useState(null);
  const [starts, setStarts] = useState({}); // staff_id → staff_touren
  const [skillMap, setSkillMap] = useState({}); // staff_id → [skill_id]
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null); // { id|null, ... }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const [r, t, k] = await Promise.all([
      sb.from("staff").select("id, name, phone, personnel_no, weekly_hours, active, email").eq("org_id", org.orgId).order("name"),
      sb.from("staff_touren").select("*").eq("org_id", org.orgId),
      sb.from("staff_skills").select("staff_id, skill_id").eq("org_id", org.orgId),
    ]);
    if (r.error) { setMsg({ kind: "err", text: errText(r.error) }); setRows([]); return; }
    setRows(r.data || []);
    setStarts(Object.fromEntries((t.data || []).map((x) => [x.staff_id, x])));
    const m = {}; (k.data || []).forEach((x) => { (m[x.staff_id] = m[x.staff_id] || []).push(x.skill_id); }); setSkillMap(m);
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
    setBusy(true);
    const row = { name: form.name.trim(), phone: normPhone(form.phone, org.country), personnel_no: clean(form.personnel_no), weekly_hours: h, active: !!form.active };
    const r = form.id ? await sb.from("staff").update(row).eq("id", form.id).select("id").single() : await sb.from("staff").insert({ org_id: org.orgId, ...row }).select("id").single();
    if (!r.error && r.data) {
      // Startpunkt und Fähigkeiten (Touren)
      const sid = r.data.id;
      const home = form.start === "home";
      const placeId = form.start && form.start.startsWith("place:") ? form.start.slice(6) : null;
      const st = await sb.from("staff_touren").upsert({ staff_id: sid, org_id: org.orgId, start_kind: home ? "home" : placeId ? "place" : "none", place_id: placeId,
        home_address: home ? clean(form.home.address) : null, home_maps_url: home ? clean(form.home.maps_url) : null, home_lat: home ? form.home.lat ?? null : null, home_lng: home ? form.home.lng ?? null : null }, { onConflict: "staff_id" });
      const before = skillMap[sid] || [], after = form.skills || [];
      const del = before.filter((x) => !after.includes(x)), ins = after.filter((x) => !before.includes(x));
      const d = del.length ? await sb.from("staff_skills").delete().eq("staff_id", sid).in("skill_id", del) : { error: null };
      const i = ins.length ? await sb.from("staff_skills").insert(ins.map((skill_id) => ({ staff_id: sid, skill_id, org_id: org.orgId }))) : { error: null };
      const e2 = st.error || d.error || i.error;
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
        <button type="button" className={btnPrimary} onClick={() => { setMsg(null); setForm({ id: null, ...emptyStaff(org.country), start: "", home: emptyAddr(), skills: [] }); }}><Plus size={16} />{tx("Mitarbeiter:in")}</button>
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
          {form.start === "home" && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-[11px] text-slate-500">{tx("Nur Inhaber und Leitung sehen die Wohnadresse. Das Büro sieht nur die Entfernung.")}</p>
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
                <button type="button" className="min-h-[36px] rounded-lg px-2 text-sm text-teal-700 underline" onClick={() => { setMsg(null); setForm(staffForm(x, starts, skillMap)); window.scrollTo(0, 0); }}>{tx("Bearbeiten")}</button>
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
                  <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-teal-700 underline" onClick={() => { setMsg(null); setForm(staffForm(x, starts, skillMap)); }}>{tx("Bearbeiten")}</button></td>
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
    const row = { name: form.name.trim(), kind: form.kind, address: clean(form.address), maps_url: clean(form.maps_url), lat: form.lat ?? null, lng: form.lng ?? null };
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
    setLoaded(true);
  }, [sb, org.orgId]);

  const range = mode === "week" ? [mondayOf(day), addDays(mondayOf(day), 6)] : [day, day];
  const loadJobs = useCallback(async () => {
    const r = await sb.from("jobs").select("*").eq("org_id", org.orgId).gte("work_date", range[0]).lte("work_date", range[1]).order("work_date").order("start_time");
    if (r.error) { setLoadErr(errText(r.error)); return; }
    setJobs(r.data || []);
    const ids = (r.data || []).map((j) => j.id);
    const js = ids.length ? await sb.from("job_staff").select("job_id, staff_id").in("job_id", ids) : { data: [] };
    setAssign(js.data || []);
  }, [sb, org.orgId, range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); }, [flash]);

  const onJobSaved = async (text, date) => { setJobDlg(null); setFlash(text); await loadBase(); if (date && (date < range[0] || date > range[1])) setDay(date); else await loadJobs(); };
  const onCustSaved = async (text, customer, keepOpen, addrOnly) => {
    setFlash(text); await loadBase();
    if (keepOpen && !addrOnly) setCustDlg(null);
    else if (!keepOpen) setCustDlg({ customer });
  };

  TERMS = data.settings.industry || "general";
  const afterAssign = async () => { await loadJobs(); const oc = await sb.rpc("touren_open_count", { p_org: org.orgId }); if (!oc.error) setOpenCount(oc.data || 0); };
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
        {!loadErr && loaded && tab === "jobs" && (
          <JobsView org={org} data={data} jobs={jobs} assign={assign} onAssign={(j) => setAssignDlg(j)} day={day} setDay={setDay} mode={mode} setMode={setMode} showCancelled={showCancelled} setShowCancelled={setShowCancelled}
            onNew={(d) => setJobDlg({ preset: { date: d } })} onOpen={(j) => setJobDlg({ job: j })} />
        )}
        {!loadErr && loaded && tab === "customers" && <CustomersView data={data} onNew={() => setCustDlg({})} onOpen={(c) => setCustDlg({ customer: c })} />}
        {!loadErr && loaded && tab === "settings" && isLeader && <SettingsView org={org} data={data} reload={loadBase} />}
        {!loadErr && loaded && tab === "staff" && isLeader && <StaffView org={org} data={data} onChanged={loadBase} />}
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
            {isLeader && <button type="button" onClick={() => { setZugOpen(true); setMoreOpen(false); }}><KeyRound size={18} aria-hidden="true" />{tx("Zugänge")}</button>}
            {hasPlanner && <a href={plannerHref}><CalendarDays size={18} aria-hidden="true" />{tx("Dienstplan")}</a>}
            <button type="button" onClick={() => sb.auth.signOut()}><LogOut size={18} aria-hidden="true" />{tx("Abmelden")}</button>
          </div>
        </div>
      )}
      {flash && <div role="status" className="tv-only-phone tv-toast">{flash}</div>}
      {zugOpen && <ZugaengeDialog onClose={() => setZugOpen(false)} />}
      {assignDlg && <AssignPanel org={org} job={assignDlg} data={data} onClose={() => setAssignDlg(null)} onChanged={afterAssign} />}
      {jobDlg && <JobDialog org={org} data={data} job={jobDlg.job} preset={jobDlg.preset} onClose={() => setJobDlg(null)} onSaved={onJobSaved} onAssign={(j) => { setJobDlg(null); setAssignDlg(j); }} />}
      {custDlg && <CustomerDialog key={custDlg.customer ? custDlg.customer.id : "new"} org={org} data={data} customer={custDlg.customer ? data.customers.find((x) => x.id === custDlg.customer.id) || custDlg.customer : null} onClose={() => setCustDlg(null)} onSaved={onCustSaved}
        onNewJob={(c) => { setCustDlg(null); setTab("jobs"); setJobDlg({ preset: { customerId: c.id, date: day } }); }} />}
    </div>
  );
}
