"use client";

import React, { useCallback, useEffect, useState } from "react";

const INK = "#1B2433", PRIMARY = "#243B6B", MUTED = "#6B7588", LINE = "#D9DEE7";
const pad = (n) => String(n).padStart(2, "0");
const de = (iso) => { const [y, m, d] = String(iso).split("-"); return `${d}.${m}.${y}`; };
const card = { background: "#fff", borderRadius: 20, padding: 16, marginBottom: 12, border: "1px solid #CBD8EE" };
const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 16, background: "#fff", color: INK };
const STATUS = { open: ["Offen – wartet auf die Leitung", "#7A4E00", "#FFF4D6"], approved: ["Genehmigt ✓", "#1F6347", "#DDF2E8"], denied: ["Abgelehnt", "#8A2A3E", "#FCE5EA"] };

// Mon-Fri between two dates (a suggestion; holidays are not known here)
function workdays(a, b) {
  if (!a || !b || b < a) return 0;
  let n = 0; const d = new Date(a + "T12:00:00"); const end = new Date(b + "T12:00:00");
  while (d <= end) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
}

// Tab "Anträge" of the employee app: Urlaub / Fortbildung / Krankmeldung to the Leitung.
// The person sees only own requests; an open request can be withdrawn.
export default function EmployeeRequests({ org }) {
  const sb = org.supabase;
  const [rows, setRows] = useState(null);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const t = await sb.from("request_types").select("key, label, active, sort_order").eq("org_id", org.orgId).order("sort_order");
    const r = await sb.from("requests").select("id, type_key, date_from, date_to, days, note, status, decision_note, created_at").eq("org_id", org.orgId).eq("staff_id", org.staffId).order("date_from", { ascending: false });
    setTypes((t.data || []).filter((x) => x.active !== false)); setRows(r.error ? [] : r.data || []);
  }, [sb, org.orgId, org.staffId]);
  useEffect(() => { load(); }, [load]);

  const labelOf = (k) => (types.find((t) => t.key === k) || {}).label || k;
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

  async function submit() {
    setMsg({ text: "", bad: false });
    if (!form.type) return setMsg({ text: "Bitte die Art wählen.", bad: true });
    if (!form.from || !form.to) return setMsg({ text: "Bitte von und bis angeben.", bad: true });
    if (form.to < form.from) return setMsg({ text: "„Bis“ liegt vor „Von“.", bad: true });
    setBusy(true);
    const { error } = await sb.from("requests").insert({ org_id: org.orgId, staff_id: org.staffId, type_key: form.type, date_from: form.from, date_to: form.to, days: workdays(form.from, form.to), note: form.note.trim().slice(0, 500) || null, status: "open" });
    setBusy(false);
    if (error) return setMsg({ text: "Senden fehlgeschlagen: " + error.message, bad: true });
    setForm(null); setMsg({ text: "Antrag gesendet ✓ Die Leitung sieht ihn jetzt.", bad: false }); load();
  }
  async function withdraw(id) {
    if (!window.confirm("Diesen offenen Antrag zurückziehen?")) return;
    const { error } = await sb.from("requests").delete().eq("id", id);
    setMsg(error ? { text: error.message, bad: true } : { text: "Antrag zurückgezogen.", bad: false }); load();
  }

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 750, padding: "4px 4px 12px" }}>Anträge</div>
      {msg.text && <div role={msg.bad ? "alert" : "status"} style={{ ...card, background: msg.bad ? "#FCE5EA" : "#DDF2E8", color: msg.bad ? "#8A2A3E" : "#1F6347", fontSize: 14 }}>{msg.text}</div>}

      {form ? (
        <div style={card}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Neuer Antrag</div>
          <label style={{ fontSize: 13, color: MUTED }}>Art
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={fld}>
              <option value="">– wählen –</option>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 13, color: MUTED }}>Von<input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to && form.to >= e.target.value ? form.to : e.target.value })} style={fld} /></label>
            <label style={{ fontSize: 13, color: MUTED }}>Bis<input type="date" value={form.to} min={form.from || undefined} onChange={(e) => setForm({ ...form, to: e.target.value })} style={fld} /></label>
          </div>
          {form.from && form.to && form.to >= form.from && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{workdays(form.from, form.to)} Arbeitstag(e) (Mo–Fr)</div>}
          <label style={{ display: "block", fontSize: 13, color: MUTED, marginTop: 10 }}>Notiz (optional)
            <textarea value={form.note} maxLength={500} rows={2} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...fld, resize: "vertical" }} />
          </label>
          {form.type === "krank" && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Die Krankmeldung sieht nur die Leitung. Eine ärztliche Bescheinigung gibst du wie bisher ab.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={submit} disabled={busy} style={{ flex: 1, border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "12px 0", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Moment …" : "An die Leitung senden"}</button>
            <button onClick={() => setForm(null)} style={{ border: "1.5px solid #9AAED0", borderRadius: 14, background: "#fff", fontSize: 15, padding: "12px 14px", cursor: "pointer" }}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setMsg({ text: "", bad: false }); setForm({ type: types[0] ? types[0].key : "", from: today, to: today, note: "" }); }}
          style={{ width: "100%", border: 0, borderRadius: 16, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "14px 0", marginBottom: 12, cursor: "pointer" }}>+ Neuer Antrag</button>
      )}

      {rows === null ? <div style={{ ...card, color: MUTED }}>Lädt …</div> : rows.length === 0 ? <div style={{ ...card, color: MUTED, fontSize: 14 }}>Du hast noch keine Anträge gestellt.</div> : rows.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 650 }}>{labelOf(r.type_key)}</div>
              <div style={{ fontSize: 14, color: MUTED }}>{de(r.date_from)}{r.date_to !== r.date_from ? ` – ${de(r.date_to)}` : ""}{Number(r.days) ? ` · ${Number(r.days)} Tag(e)` : ""}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 650, color: STATUS[r.status][1], background: STATUS[r.status][2], borderRadius: 10, padding: "4px 8px", whiteSpace: "nowrap" }}>{STATUS[r.status][0]}</span>
          </div>
          {r.note && <div style={{ fontSize: 14, marginTop: 6 }}>„{r.note}“</div>}
          {r.decision_note && <div style={{ fontSize: 14, marginTop: 6, color: MUTED }}>Antwort der Leitung: {r.decision_note}</div>}
          {r.status === "open" && <button onClick={() => withdraw(r.id)} style={{ marginTop: 8, border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", fontSize: 14, padding: "7px 12px", cursor: "pointer" }}>Zurückziehen</button>}
        </div>
      ))}
    </div>
  );
}
