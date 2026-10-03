"use client";

import dynamic from "next/dynamic";
import ProductGate from "../components/ProductGate";

// Needs a login, a company with the "Dienstplaner Labor" product, and the role boss/owner.
// Renders in the browser only (depends on today's date).
const LabShiftScheduler = dynamic(() => import("../components/LabShiftScheduler"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product="lab_planner" supervisorOnly label="Dienstplaner Labor">
      <LabShiftScheduler />
    </ProductGate>
  );
}
