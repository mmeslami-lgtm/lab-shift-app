"use client";

import dynamic from "next/dynamic";
import ProductGate from "../../components/ProductGate";

const GenericShiftScheduler = dynamic(() => import("../../components/GenericShiftScheduler"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product="generic_planner" supervisorOnly label="Dienstplaner allgemein">
      <GenericShiftScheduler />
    </ProductGate>
  );
}
