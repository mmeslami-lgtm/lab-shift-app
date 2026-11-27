"use client";
// Firmendaten & Logo im Profil (SQL 65, 27.11.2026). Freiwillig. Ändern: Inhaber und Leitung; Büro sieht nur.
// Genutzt für Kopf- und Fußzeile der Einwilligung, des Einsatzplans und des Transport-Blatts.
import React, { useEffect, useState } from "react";
import { tx } from "../lib/i18n";
import { LH_SELECT, lhFrom, shrinkLogo } from "../lib/letterhead";

const INK = "#1B2433", PRIMARY = "#243B6B", MUTED = "#6B7588", LINE = "#D9DEE7";
const fld = { display: "block", width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", fontSize: 16, background: "#fff", color: INK, marginTop: 4 };
const ghost = { border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: INK, fontSize: 14, fontWeight: 600, padding: "8px 12px", cursor: "pointer" };
const prim = { ...ghost, border: 0, background: PRIMARY, color: "#fff" };
const FIELDS = [["address", "Firmenadresse", "z. B. Musterstraße 1, 12345 Stadt"], ["phone", "Telefon", "+49 …"], ["email", "E-Mail", "info@firma.de"], ["website", "Webseite", "www.firma.de"]];

export default function LetterheadCard({ supabase, orgId, role }) {
  const canEdit = role === "owner" || role === "supervisor";
  const [lh, setLh] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = async () => {
    const r = await supabase.from("organizations").select(LH_SELECT).eq("id", orgId).maybeSingle();
    if (!r.error && r.data) setLh(lhFrom(r.data));
  };
  useEffect(() => { load(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lh) return null;
  const filled = FIELDS.some(([k]) => lh[k]) || lh.logo;
  if (!canEdit && !filled) return null;

  async function pick(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    setMsg(null);
    try { const logo = await shrinkLogo(file); setForm((p) => ({ ...p, logo })); }
    catch (err) { setMsg({ kind: "error", text: err.message === "size" ? tx("Das Bild ist zu groß. Bitte ein kleineres Logo wählen.") : tx("Bitte ein Bild wählen (PNG oder JPG).") }); }
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await supabase.rpc("org_letterhead_save", { p_org: orgId, p_logo: form.logo || null, p_address: form.address, p_phone: form.phone, p_email: form.email, p_website: form.website });
    setBusy(false);
    if (r.error) {
      const m = r.error.message || "";
      setMsg({ kind: "error", text: /bad_email/.test(m) ? tx("Bitte eine gültige E-Mail-Adresse eintragen.") : /not_leader/.test(m) ? tx("Nur Inhaber und Leitung dürfen das ändern.") : /function .* does not exist|schema cache/.test(m) ? tx("Bitte zuerst Datenbank-Skript 65 ausführen.") : tx("Konnte nicht gespeichert werden.") });
      return;
    }
    setForm(null); setMsg({ kind: "ok", text: tx("Gespeichert ✓") }); load();
  }

  return (
    <div data-letterhead style={{ borderTop: `1px solid ${LINE}`, marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{tx("Firmendaten & Logo")}</div>
        {canEdit && !form && <button type="button" style={ghost} onClick={() => { setMsg(null); setForm({ ...lh }); }}>{tx("Bearbeiten")}</button>}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{tx("Freiwillig. Erscheint oben und unten auf Einwilligung, Einsatzplan und Transport-Blatt.")}</div>
      {!form ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ width: 140, height: 60, border: `1px dashed ${LINE}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFBFC" }}>
            {lh.logo ? <img src={lh.logo} alt={tx("Firmenlogo")} style={{ maxWidth: 130, maxHeight: 52, objectFit: "contain" }} /> : <span style={{ fontSize: 12, color: MUTED }}>{tx("Kein Logo")}</span>}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {FIELDS.map(([k, l]) => <div key={k}><span style={{ color: MUTED }}>{tx(l)}: </span><b>{lh[k] || "–"}</b></div>)}
          </div>
        </div>
      ) : (
        <form onSubmit={save} style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 160, height: 70, border: `1px dashed ${LINE}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFBFC" }}>
              {form.logo ? <img src={form.logo} alt={tx("Firmenlogo")} style={{ maxWidth: 150, maxHeight: 62, objectFit: "contain" }} /> : <span style={{ fontSize: 12, color: MUTED }}>{tx("Kein Logo")}</span>}
            </div>
            <label style={{ ...ghost, display: "inline-block" }}>{form.logo ? tx("Anderes Logo") : tx("Logo hochladen")}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} style={{ display: "none" }} /></label>
            {form.logo && <button type="button" style={{ ...ghost, color: "#8A2A3E", borderColor: "#E7B4BF" }} onClick={() => setForm({ ...form, logo: "" })}>{tx("Logo entfernen")}</button>}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{tx("PNG oder JPG. Wird automatisch verkleinert.")}</div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 10 }}>
            {FIELDS.map(([k, l, ph]) => (
              <label key={k} style={{ fontSize: 13, color: MUTED }}>{tx(l)}
                <input value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={tx(ph)} maxLength={k === "address" ? 300 : k === "phone" ? 40 : k === "email" ? 120 : 200} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} style={fld} /></label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" style={prim} disabled={busy}>{busy ? tx("Speichert …") : tx("Speichern")}</button>
            <button type="button" style={ghost} onClick={() => { setForm(null); setMsg(null); }}>{tx("Abbrechen")}</button>
          </div>
        </form>
      )}
      {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ marginTop: 10, borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 600, background: msg.kind === "ok" ? "#DDF2E8" : "#FCE5EA", color: msg.kind === "ok" ? "#1F6347" : "#8A2A3E" }}>{msg.text}</div>}
    </div>
  );
}
