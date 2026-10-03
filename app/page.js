"use client";

import dynamic from "next/dynamic";

// These screens depend on today's date, so they render in the browser only (no server pre-render,
// which would freeze the build date into the page and cause a flicker on load).
const LabShiftScheduler = dynamic(() => import("../components/LabShiftScheduler"), { ssr: false });

export default function Page() {
  return <LabShiftScheduler />;
}
