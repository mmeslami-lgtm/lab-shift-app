"use client";

import dynamic from "next/dynamic";
import ProductGate from "../../components/ProductGate";

// For the Leitung and the Inhaber of a company that has one of the two planners.
const ScheduleReview = dynamic(() => import("../../components/ScheduleReview"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product={["lab_planner", "generic_planner"]} supervisorOnly label="Freigaben & Archiv">
      <ScheduleReview />
    </ProductGate>
  );
}
