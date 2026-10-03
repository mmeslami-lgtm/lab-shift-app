"use client";

import dynamic from "next/dynamic";

// The old preview with sample data, open to everyone (no login, no real data).
const EmployeeShiftView = dynamic(() => import("../../components/EmployeeShiftView"), { ssr: false });

export default function Page() {
  return <EmployeeShiftView />;
}
