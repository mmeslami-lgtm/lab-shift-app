"use client";

import dynamic from "next/dynamic";

const GenericShiftScheduler = dynamic(() => import("../../components/GenericShiftScheduler"), { ssr: false });

export default function Page() {
  return <GenericShiftScheduler />;
}
