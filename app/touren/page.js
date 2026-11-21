"use client";

import dynamic from "next/dynamic";
import ProductGate from "../../components/ProductGate";

// Touren (Paket D3a): Kunden und Aufträge – für Inhaber, Leitung und Büro (Rolle „office“).
const TourenView = dynamic(() => import("../../components/TourenView"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product="touren" roles={["owner", "supervisor", "office"]} label="Touren">
      <TourenView />
    </ProductGate>
  );
}
