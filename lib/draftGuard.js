"use client";

import { useEffect } from "react";

// Entwurf-Schutz: was im Editor steht, ist nur ein Entwurf. Erst „Zwischenspeichern“ / „Veröffentlichen“ (Dienstplan)
// bzw. „Speichern“ (Zeiten bearbeiten) schreibt in die Datenbank. Diese Helfer merken sich den zuletzt gespeicherten
// Stand und warnen, wenn die Seite mit ungespeicherten Änderungen geschlossen wird.

// fingerprint of a plan: every "day|shift|person", sorted (empty slots ignored)
export function planSig(days) {
  if (!days) return null;
  const out = [];
  days.forEach((d) => Object.entries(d.shifts || {}).forEach(([k, ids]) => (ids || []).filter(Boolean).forEach((id) => out.push(`${d.day}|${k}|${id}`))));
  return out.sort().join(",");
}

// browser warning ("Seite verlassen?") while there are unsaved changes
export function useUnsavedWarning(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

// deep enough copy of plan days (the shift lists are the part that gets edited)
export function cloneDays(days) {
  return (days || []).map((d) => ({ ...d, shifts: Object.fromEntries(Object.entries(d.shifts || {}).map(([k, v]) => [k, [...(v || [])]])) }));
}

export const LEAVE_MSG = "Es gibt nicht gespeicherte Änderungen am Dienstplan. Sie gehen verloren, die Mitarbeitenden sehen weiterhin die veröffentlichte Fassung.\n\nTrotzdem fortfahren?";
