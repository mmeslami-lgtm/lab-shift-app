"use client";

import dynamic from "next/dynamic";

const EmployeeShiftView = dynamic(() => import("../../components/EmployeeShiftView"), { ssr: false });

export default function Page() {
  return <EmployeeShiftView />;
}
