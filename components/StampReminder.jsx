"use client";

import React, { useCallback, useEffect, useState } from "react";

// Pop-up in the employee app: "Kommen vergessen?" 30 minutes after the start of a planned shift
// without any stamp, and "Gehen vergessen?" when a stamp is open for more than 12 hours.
// Shown once per shift (remembered in this browser); "Zeit nachtragen" opens the Zeiten tab.
const pad = (n) => String(n).padStart(2, "0");
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const SEEN = "stamp-reminder-seen";

export default function StampReminder({ org, onOpenTimes }) {
  const [msg, setMsg] = useState(null); // { key, title, text }
  const check = useCallback(async () => {
    if (!(org.products || []).includes("time_tracking") || !org.staffId) return;
    const now = Date.now();
    const sh = await org.supabase.from("scheduled_shifts").select("shift_label, shift_key, planned_start").eq("org_id", org.orgId).eq("staff_id", org.staffId).eq("status", "published")
      .gte("planned_start", new Date(now - 12 * 3600000).toISOString()).lt("planned_start", new Date(now - 30 * 60000).toISOString());
    const se = await org.supabase.from("attendance_sessions").select("id, check_in, check_out").eq("org_id", org.orgId).eq("staff_id", org.staffId).gte("check_in", new Date(now - 36 * 3600000).toISOString());
    if (sh.error || se.error) return;
    let seen = []; try { seen = JSON.parse(localStorage.getItem(SEEN) || "[]"); } catch (e) { seen = []; }
    const open = (se.data || []).find((x) => x.check_in && !x.check_out && now - new Date(x.check_in).getTime() > 12 * 3600000);
    if (open && !seen.includes("out" + open.id)) { setMsg({ key: "out" + open.id, title: "Gehen vergessen?", text: `Du bist seit ${clock(open.check_in)} eingestempelt. Hast du vergessen auszustempeln?` }); return; }
    const missed = (sh.data || []).find((x) => !(se.data || []).some((y) => y.check_in && new Date(y.check_in).getTime() >= new Date(x.planned_start).getTime() - 3 * 3600000));
    if (missed && !seen.includes("in" + missed.planned_start)) setMsg({ key: "in" + missed.planned_start, title: "Kommen vergessen?", text: `Dein ${missed.shift_label || missed.shift_key} hat um ${clock(missed.planned_start)} begonnen, aber du bist noch nicht eingestempelt.` });
  }, [org]);
  useEffect(() => { check(); const t = setInterval(check, 5 * 60000); window.addEventListener("focus", check); return () => { clearInterval(t); window.removeEventListener("focus", check); }; }, [check]);

  if (!msg) return null;
  const close = () => { try { const seen = JSON.parse(localStorage.getItem(SEEN) || "[]"); localStorage.setItem(SEEN, JSON.stringify([...seen, msg.key].slice(-50))); } catch (e) { /* ignore */ } setMsg(null); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="sr-title" style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 22, padding: 20, marginBottom: "env(safe-area-inset-bottom)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1B2433" }}>
        <div style={{ fontSize: 34 }}>⏰</div>
        <div id="sr-title" style={{ fontSize: 20, fontWeight: 750, margin: "4px 0 6px" }}>{msg.title}</div>
        <div style={{ fontSize: 15, color: "#4B5568", marginBottom: 14 }}>{msg.text}</div>
        <div style={{ fontSize: 13, color: "#6B7588", marginBottom: 14 }}>Bist du schon da? Dann am Terminal stempeln. Sonst unter „Zeiten“ die Zeit bei der Leitung beantragen.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { close(); if (onOpenTimes) onOpenTimes(); }} style={{ flex: 1, border: 0, borderRadius: 14, background: "#243B6B", color: "#fff", fontSize: 16, fontWeight: 650, padding: "12px 0", cursor: "pointer" }}>Zu meinen Zeiten</button>
          <button onClick={close} style={{ border: "1.5px solid #9AAED0", borderRadius: 14, background: "#fff", fontSize: 15, padding: "12px 16px", cursor: "pointer" }}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
