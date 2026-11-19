"use client";

import React, { useCallback, useEffect, useState } from "react";
import { tx, wdShort, dm } from "../lib/i18n";

const INK = "#1B2433";
const PRIMARY = "#243B6B";
const PAPER = "#E9EEF8";
const MUTED = "#6B7588";
const LINE = "#D9DEE7";
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (s) => { const d = parseIso(s); return `${wdShort(d.getDay())} ${dm(d)}`; };
const range = (w) => (w.date_from === w.date_to ? fmt(w.date_from) : `${fmt(w.date_from)} – ${fmt(w.date_to)}`);

const card = { background: "#fff", borderRadius: 20, padding: 16, marginBottom: 12, border: "1px solid #A9BBDA", boxShadow: "0 6px 18px -12px rgba(36,59,107,.35)" };
const fld = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 16, background: "#fff", color: INK };
const lab = { display: "block", fontSize: 12, color: MUTED, marginBottom: 10 };
const btn = { border: 0, borderRadius: 14, background: PRIMARY, color: "#fff", fontSize: 16, fontWeight: 650, padding: "12px 14px", cursor: "pointer", width: "100%" };
const btnLight = { border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "7px 10px", cursor: "pointer" };

// Tab "Wünsche" of the employee app. Wishes are collected as drafts (only the person sees them) and
// sent with ONE button to the Leitung, who approves or rejects. A wish is never a promise.
//   org     OrgContext (supabase, orgId, staffId)
//   defs    shift definitions [{ key, label, active }] for "ich möchte arbeiten"
export default function EmployeeWishes({ org, defs }) {
  const sb = org.supabase;
  const today = isoOf(new Date());
  const tomorrow = isoOf(new Date(Date.now() + 86400000));
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ type: "free", shift: "", from: tomorrow, to: tomorrow, note: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ text: "", bad: false });
  const shifts = (defs || []).filter((d) => d.active !== false);
  const labelOf = (k) => (shifts.find((d) => d.key === k) || {}).label || k;

  const load = useCallback(async () => {
    const r = await sb.from("wishes").select("id, wish_type, date_from, date_to, shift_key, note, status, decision_note").eq("org_id", org.orgId).eq("staff_id", org.staffId).order("date_from");
    if (r.error) { setMsg({ text: /status/.test(r.error.message) ? tx("Wünsche sind für deine Firma noch nicht eingerichtet.") : r.error.message, bad: true }); setList([]); return; }
    setList(r.data || []);
  }, [sb, org.orgId, org.staffId]);
  useEffect(() => { load(); }, [load]);

  const say = (text, bad = false) => setMsg({ text, bad });

  async function add() {
    say("");
    const to = form.to < form.from ? form.from : form.to;
    if (!form.from) { say(tx("Bitte ein Datum wählen."), true); return; }
    if (form.from < today) { say(tx("Wünsche gehen nur für heute oder später."), true); return; }
    if (form.type === "work" && !form.shift) { say(tx("Bitte die gewünschte Schicht wählen."), true); return; }
    setBusy("add");
    const { error } = await sb.from("wishes").insert({
      org_id: org.orgId, staff_id: org.staffId, wish_type: form.type, date_from: form.from, date_to: to,
      shift_key: form.type === "work" ? form.shift : null, note: form.note.trim() || null, status: "draft",
    });
    setBusy("");
    if (error) { say(tx("Nicht gespeichert: ") + error.message, true); return; }
    setForm((f) => ({ ...f, note: "" }));
    say(tx("Hinzugefügt ✓ – noch nicht gesendet."));
    load();
  }

  async function remove(w) {
    if (w.status === "submitted" && !window.confirm(tx("Diesen Wunsch zurückziehen? Die Leitung sieht ihn dann nicht mehr."))) return;
    setBusy("del" + w.id); say("");
    const { error } = await sb.from("wishes").delete().eq("id", w.id);
    setBusy("");
    if (error) { say(error.message, true); return; }
    say(w.status === "submitted" ? tx("Zurückgezogen ✓") : tx("Gelöscht ✓"));
    load();
  }

  async function send() {
    setBusy("send"); say("");
    const { data, error } = await sb.rpc("submit_my_wishes", { p_org: org.orgId });
    setBusy("");
    if (error) { say(tx("Nicht gesendet: ") + error.message, true); return; }
    say(tx("{0} Wunsch/Wünsche an die Leitung gesendet ✓", data || 0));
    load();
  }

  const drafts = (list || []).filter((w) => w.status === "draft");
  const sent = (list || []).filter((w) => w.status === "submitted");
  const decided = (list || []).filter((w) => (w.status === "approved" || w.status === "rejected") && w.date_to >= isoOf(new Date(Date.now() - 31 * 86400000)));
  const what = (w) => (w.wish_type === "free" ? tx("Frei") : tx("Arbeiten: {0}", labelOf(w.shift_key)));

  const Item = ({ w, right }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${PAPER}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{range(w)}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{what(w)}{w.note ? ` · ${w.note}` : ""}</div>
        {w.decision_note && <div style={{ fontSize: 13, color: MUTED }}>{tx("Antwort:")} {w.decision_note}</div>}
      </div>
      {right}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, margin: "4px 0 10px" }}>{tx("Wünsche")}</div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 10 }}>{tx("Neuer Wunsch")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["free", tx("Frei")], ["work", tx("Arbeiten")]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={form.type === k} onClick={() => setForm((f) => ({ ...f, type: k }))}
              style={{ flex: 1, borderRadius: 12, padding: "10px 0", fontSize: 14, fontWeight: 650, cursor: "pointer", border: `1px solid ${form.type === k ? PRIMARY : LINE}`, background: form.type === k ? PRIMARY : "#fff", color: form.type === k ? "#fff" : INK }}>{l}</button>
          ))}
        </div>
        {form.type === "work" && shifts.length === 0 && <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>{tx("Es sind noch keine Schichten veröffentlicht. „Frei“ geht schon.")}</div>}
        {form.type === "work" && shifts.length > 0 && (
          <label style={lab}>{tx("Schicht")}
            <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))} style={fld}>
              <option value="">{tx("– bitte wählen –")}</option>
              {shifts.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ ...lab, flex: 1 }}>{tx("Von")}
            <input type="date" min={today} value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} style={fld} />
          </label>
          <label style={{ ...lab, flex: 1 }}>{tx("Bis")}
            <input type="date" min={form.from || today} value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} style={fld} />
          </label>
        </div>
        <label style={lab}>{tx("Notiz (optional)")}
          <input value={form.note} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={tx("z. B. Arzttermin, Kinderbetreuung")} style={fld} />
        </label>
        <button onClick={add} disabled={busy === "add"} style={{ ...btn, opacity: busy === "add" ? 0.6 : 1 }}>{busy === "add" ? tx("Moment …") : tx("Hinzufügen")}</button>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{tx("Ein Wunsch ist keine Zusage. Die Leitung entscheidet und du siehst hier die Antwort.")}</div>
      </div>

      {msg.text && <div role={msg.bad ? "alert" : "status"} style={{ fontSize: 13, borderRadius: 12, padding: "9px 12px", marginBottom: 12, background: msg.bad ? "#FCE5EA" : "#DDF2E8", color: msg.bad ? "#B3263E" : "#1F6347" }}>{tx(msg.text)}</div>}
      {list === null && <div style={{ color: MUTED, fontSize: 14 }}>{tx("Lädt …")}</div>}

      {drafts.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{tx("Noch nicht gesendet (")}{drafts.length})</div>
          {drafts.map((w) => <Item key={w.id} w={w} right={<button onClick={() => remove(w)} disabled={!!busy} aria-label={tx("Löschen")} style={btnLight}>{busy === "del" + w.id ? "…" : tx("Löschen")}</button>} />)}
          <button onClick={send} disabled={busy === "send"} style={{ ...btn, marginTop: 10, background: "#1F6347", opacity: busy === "send" ? 0.6 : 1 }}>{busy === "send" ? tx("Moment …") : tx("An die Leitung senden ({0})", drafts.length)}</button>
        </div>
      )}

      {sent.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{tx("Gesendet – wartet auf Antwort (")}{sent.length})</div>
          {sent.map((w) => <Item key={w.id} w={w} right={<button onClick={() => remove(w)} disabled={!!busy} style={btnLight}>{busy === "del" + w.id ? "…" : tx("Zurückziehen")}</button>} />)}
        </div>
      )}

      {decided.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{tx("Entschieden")}</div>
          {decided.map((w) => <Item key={w.id} w={w} right={<span style={{ fontSize: 12, fontWeight: 700, borderRadius: 10, padding: "5px 9px", background: w.status === "approved" ? "#DDF2E8" : "#FCE5EA", color: w.status === "approved" ? "#1F6347" : "#B3263E" }}>{w.status === "approved" ? tx("genehmigt") : tx("abgelehnt")}</span>} />)}
        </div>
      )}

      {list && list.length === 0 && !msg.bad && <div style={{ fontSize: 14, color: MUTED, padding: "4px 4px 12px" }}>{tx("Du hast noch keine Wünsche.")}</div>}
    </div>
  );
}
