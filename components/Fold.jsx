"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

// Aufklappbarer Abschnitt in den Einstellungen des Dienstplaners. Der Inhalt bleibt immer im Formular
// (nur ein- oder ausgeklappt), deshalb ändert sich an den Einstellungen selbst nichts.
//   title  Überschrift, hint  kurzer Stand rechts daneben (z. B. „3 Einträge“), defaultOpen  beim Öffnen der Seite offen
export default function Fold({ title, hint, defaultOpen = false, children }) {
  const [initial] = useState(!!defaultOpen); // only the first state counts; afterwards the person decides
  return (
    <details className="dg-fold" open={initial || undefined}>
      <summary className="dg-fold-sum">
        <span className="dg-fold-title">{title}</span>
        {hint ? <span className="dg-fold-hint">{hint}</span> : null}
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" className="dg-fold-chev" />
      </summary>
      <div className="dg-fold-body">{children}</div>
    </details>
  );
}
