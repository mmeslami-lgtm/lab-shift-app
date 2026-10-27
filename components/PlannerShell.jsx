"use client";

import React from "react";

// Erscheinungsbild D (nur Inhaber/Leitung/Schichtplaner): Menü links als schwebende Karte, Inhalt rechts.
// Auf schmalen Bildschirmen steht das Menü oben. Die Mitarbeiter-App benutzt diesen Rahmen nicht.
export default function PlannerShell({ sidebar, children }) {
  return (
    <div className="dg-shell">
      {sidebar && <aside className="dg-side">{sidebar}</aside>}
      <main className="dg-main">{children}</main>
    </div>
  );
}
