"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { OrgContext } from "../lib/orgContext";

const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { if (!ts) return "–"; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dur = (a, b) => { if (!a || !b) return "–"; const m = Math.round((new Date(b) - new Date(a)) / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };

// Popup "Anwesenheit" (Leitung / Inhaber): who is here now, today's stamps, terminals, PIN reset.
// Read only for the times – corrections come in step 2 (with reason, logged).
export default function AttendanceDialog({ onClose }) {
  const org = useContext(OrgContext);
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [devices, setDevices] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [badges, setBadges] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [newCard, setNewCard] = useState(null); // { staffId, code }
  const [needPin, setNeedPin] = useState(false);
  const [pairName, setPairName] = useState(null); // null = closed, string = form open
  const [pairCode, setPairCode] = useState(null); // { code, name, expiresAt }
  const closeRef = useRef(onClose); closeRef.current = onClose;

  const load = useCallback(async () => {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setTime(since.getTime() - 20 * 3600000); // includes night shifts from yesterday
    const s = await org.supabase.from("attendance_sessions").select("id, staff_id, check_in, check_out").eq("org_id", org.orgId).gte("check_in", since.toISOString()).order("check_in", { ascending: false });
    const st = await org.supabase.from("staff").select("id, name").eq("org_id", org.orgId);
    const dv = await org.supabase.from("devices").select("id, serial, name, active, created_at").eq("org_id", org.orgId).order("created_at");
    const bg = await org.supabase.from("badges").select("id, staff_id, badge_code, revoked_at, issued_at").eq("org_id", org.orgId);
    const og = await org.supabase.from("organizations").select("card_requires_pin").eq("id", org.orgId);
    setBadges((bg.data || []).filter((b) => !b.revoked_at));
    setNeedPin(!!(og.data && og.data[0] && og.data[0].card_requires_pin));
    setStaffList((st.data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
    const n = {}; (st.data || []).forEach((x) => { n[x.id] = x.name; });
    setNames(n); setRows(s.data || []); setDevices((dv.data || []).filter((d) => String(d.serial).startsWith("T-")));
  }, [org]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") closeRef.current(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const present = (rows || []).filter((r) => r.check_in && !r.check_out);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = (rows || []).filter((r) => new Date(r.check_in || r.check_out) >= todayStart || !r.check_out);

  async function resetPin(id) {
    if (!window.confirm(`Stempel-PIN von ${names[id] || "?"} löschen? Die Person legt danach in der App eine neue fest.`)) return;
    setBusy("pin" + id);
    const { error } = await org.supabase.rpc("reset_staff_pin", { p_org: org.orgId, p_staff: id });
    setBusy(""); setMsg(error ? error.message : `PIN von ${names[id]} gelöscht ✓`);
  }
  async function addCard() {
    const code = String(newCard.code || "").trim();
    if (!newCard.staffId || code.length < 4) { setMsg("Bitte Person wählen und die Karte an das Kartenlesegerät halten."); return; }
    setBusy("card");
    const { error } = await org.supabase.from("badges").insert({ org_id: org.orgId, staff_id: newCard.staffId, badge_code: code });
    setBusy("");
    if (error) { setMsg(/duplicate|unique/i.test(error.message) ? "Diese Karte gehört schon einer anderen Person." : error.message); return; }
    setMsg(`Karte für ${names[newCard.staffId]} gespeichert ✓`); setNewCard(null); load();
  }
  async function revokeCard(b) {
    if (!window.confirm(`Karte von ${names[b.staff_id] || "?"} entziehen? Sie funktioniert danach nicht mehr (z. B. bei Verlust).`)) return;
    setBusy("rv" + b.id);
    const { error } = await org.supabase.from("badges").update({ revoked_at: new Date().toISOString() }).eq("id", b.id);
    setBusy(""); setMsg(error ? error.message : "Karte entzogen ✓"); load();
  }
  async function toggleNeedPin(on) {
    setBusy("np");
    const { error } = await org.supabase.rpc("set_card_requires_pin", { p_org: org.orgId, p_on: on });
    setBusy(""); if (error) { setMsg(error.message); return; }
    setNeedPin(on); setMsg(on ? "Ab jetzt: Karte + PIN ✓" : "Ab jetzt: Karte allein genügt ✓");
  }
  async function createPairCode() {
    setBusy("pair"); setMsg("");
    try {
      const { data } = await org.supabase.auth.getSession();
      const res = await fetch("/api/zeit", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session ? data.session.access_token : ""}` }, body: JSON.stringify({ action: "pair-create", org_id: org.orgId, name: pairName || "Terminal" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Fehler (${res.status})`);
      setPairCode(body); setPairName(null);
    } catch (e) { setMsg(e.message); }
    setBusy("");
  }
  async function toggleDevice(d) {
    if (d.active && !window.confirm(`Terminal „${d.name}“ sperren? Es zeigt dann keinen QR-Code mehr.`)) return;
    setBusy("dev" + d.id);
    const { error } = await org.supabase.from("devices").update({ active: !d.active }).eq("id", d.id);
    setBusy(""); setMsg(error ? error.message : d.active ? "Terminal gesperrt ✓" : "Terminal wieder aktiv ✓"); load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="att-title" className="w-full max-w-2xl rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="att-title" className="text-base font-semibold">Anwesenheit</h2>
            <div className="mt-0.5 text-xs text-slate-500">Stempelzeiten nimmt der Server; sie lassen sich nicht nachträglich ändern. Aktualisiert sich alle 30 Sekunden.</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 active:translate-y-px">Schließen</button>
        </div>
        {msg && <div role="status" className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-900">{msg}</div>}
        {rows === null ? <div className="mt-4 text-xs text-slate-500">Lädt …</div> : (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Jetzt da ({present.length})</h3>
            {present.length === 0 ? <div className="mt-1 text-xs text-slate-500">Im Moment ist niemand eingestempelt.</div> : (
              <div className="mt-1 flex flex-wrap gap-2">{present.map((r) => <span key={r.id} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-900">● {names[r.staff_id] || "?"} <span className="text-emerald-700">seit {clock(r.check_in)}</span></span>)}</div>
            )}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Heute</h3>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-slate-500"><th className="py-1.5 pr-2">Name</th><th className="py-1.5 pr-2">Kommen</th><th className="py-1.5 pr-2">Gehen</th><th className="py-1.5 pr-2">Dauer</th><th /></tr></thead>
                <tbody>
                  {today.length === 0 && <tr><td colSpan={5} className="py-2 text-xs text-slate-500">Heute noch keine Stempelungen.</td></tr>}
                  {today.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 font-medium">{names[r.staff_id] || "?"}</td>
                      <td className={`py-1.5 pr-2 ${r.check_in ? "" : "text-amber-700"}`}>{r.check_in ? clock(r.check_in) : "fehlt"}</td>
                      <td className="py-1.5 pr-2">{r.check_out ? clock(r.check_out) : <span className="text-emerald-700">läuft</span>}</td>
                      <td className="py-1.5 pr-2">{dur(r.check_in, r.check_out)}</td>
                      <td className="py-1.5 text-right"><button onClick={() => resetPin(r.staff_id)} disabled={!!busy} className="text-xs text-slate-500 underline">PIN zurücksetzen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Chipkarten ({badges.length})</h3>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={needPin} disabled={!!busy} onChange={(e) => toggleNeedPin(e.target.checked)} />
              Karte + PIN erforderlich <span className="text-slate-400">(sonst genügt die Karte allein)</span>
            </label>
            <ul className="mt-1 divide-y divide-slate-100">
              {badges.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{names[b.staff_id] || "?"} <span className="text-xs text-slate-400">Karte …{String(b.badge_code).slice(-4)}</span></span>
                  <button onClick={() => revokeCard(b)} disabled={!!busy} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 active:translate-y-px">Entziehen</button>
                </li>
              ))}
            </ul>
            {newCard ? (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-600">Person
                    <select value={newCard.staffId} onChange={(e) => setNewCard((c) => ({ ...c, staffId: e.target.value }))} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">– wählen –</option>
                      {staffList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">Kartennummer
                    <input autoFocus value={newCard.code} onChange={(e) => setNewCard((c) => ({ ...c, code: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCard(); } }}
                      placeholder="Karte an das Kartenlesegerät halten …" className="mt-1 block w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono" />
                  </label>
                  <button onClick={addCard} disabled={busy === "card"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "card" ? "Moment …" : "Speichern"}</button>
                  <button onClick={() => setNewCard(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Das Kartenlesegerät an diesen Computer stecken, ins Feld klicken und die Karte oder den Chip davor halten – die Nummer erscheint von selbst.</div>
              </div>
            ) : (
              <button onClick={() => setNewCard({ staffId: "", code: "" })} className="mt-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Karte zuweisen</button>
            )}

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Terminals</h3>
            {pairCode ? (
              <div className="mt-2 rounded-xl border-2 border-teal-300 bg-teal-50 p-3 text-center">
                <div className="text-xs text-slate-600">Einrichtungs-Code für „{pairCode.name}“</div>
                <div className="my-1 font-mono text-3xl font-bold tracking-widest text-slate-900">{pairCode.code}</div>
                <div className="text-xs text-slate-600">Auf dem Tablet <b>{typeof window !== "undefined" ? window.location.origin : ""}/terminal</b> öffnen und diesen Code eingeben. Gilt einmal, 24 Stunden.<br />Sie müssen dafür nicht vor Ort sein – den Code können Sie auch telefonisch durchgeben.</div>
                <button onClick={() => setPairCode(null)} className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Fertig</button>
              </div>
            ) : pairName !== null ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                <label className="text-xs text-slate-600">Name des Terminals
                  <input autoFocus value={pairName} onChange={(e) => setPairName(e.target.value)} maxLength={60} placeholder="z. B. Terminal Eingang" className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <button onClick={createPairCode} disabled={busy === "pair"} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 active:translate-y-px">{busy === "pair" ? "Moment …" : "Code erstellen"}</button>
                <button onClick={() => setPairName(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">Abbrechen</button>
              </div>
            ) : (
              <button onClick={() => setPairName("Terminal Eingang")} className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:translate-y-px">+ Neues Terminal einrichten</button>
            )}
            <ul className="mt-1 divide-y divide-slate-100">
              {devices.length === 0 && <li className="py-2 text-xs text-slate-500">Noch kein Terminal eingerichtet.</li>}
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{d.name} <span className="text-xs text-slate-400">{d.serial}</span> {d.active ? <span className="text-xs text-emerald-700">aktiv</span> : <span className="text-xs text-rose-700">gesperrt</span>}</span>
                  <button onClick={() => toggleDevice(d)} disabled={!!busy} className={`rounded-lg border px-2.5 py-1 text-xs active:translate-y-px ${d.active ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`}>{d.active ? "Sperren" : "Entsperren"}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
