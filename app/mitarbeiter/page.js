"use client";

import dynamic from "next/dynamic";
import ProductGate from "../../components/ProductGate";

const EmployeeLive = dynamic(() => import("../../components/EmployeeLive"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product="employee_app" label="Meine Schichten">
      <EmployeeLive />
    </ProductGate>
  );
}
