"use client";

import React, { useEffect, useRef, useState } from "react";

// Start page "Anmelden": mouse over (desktop) or tap (phone) opens three choices; each goes straight to the
// matching sign-in page (/login?als=…) with e-mail and password. Styles: .dg-menu / .dg-drop in app/page.js.
const ITEMS = [
  ["mitarbeiter", "Mitarbeiter", "Plan, Stempeln, Urlaub"],
  ["leitung", "Leitung", "Dienstplan, Anträge, Anwesenheit"],
  ["inhaber", "Inhaber", "Alles, inklusive Zugänge und Regeln"],
];

export default function LoginMenu({ align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const hover = (v) => (e) => { if (e.pointerType !== "mouse") return; clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(v), v ? 0 : 180); };
  return (
    <div ref={ref} className={`dg-menu${open ? " dg-open" : ""}`} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
      <button type="button" className="dg-btn dg-ghost dg-menu-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Anmelden</button>
      {open && (
        <div className={`dg-drop dg-drop-${align}`} role="menu">
          {ITEMS.map(([k, t, s]) => (
            <a key={k} role="menuitem" href={`/login?als=${k}`}><b>{t}</b><span>{s}</span></a>
          ))}
        </div>
      )}
    </div>
  );
}
