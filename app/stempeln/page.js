"use client";

import dynamic from "next/dynamic";
import ProductGate from "../../components/ProductGate";

// Opened by scanning the QR code at the terminal with the normal phone camera: /stempeln?t=…
const StempelnView = dynamic(() => import("../../components/StempelnView"), { ssr: false });

export default function Page() {
  return (
    <ProductGate product="employee_app" label="Stempeln">
      <StempelnView />
    </ProductGate>
  );
}
