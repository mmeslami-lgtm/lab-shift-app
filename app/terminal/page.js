"use client";

import dynamic from "next/dynamic";

// Stamp terminal (tablet / laptop at the entrance). Set up once by Leitung/Inhaber, then it runs
// with its own device key – nobody stays logged in on it.
const TerminalView = dynamic(() => import("../../components/TerminalView"), { ssr: false });

export default function Page() {
  return <TerminalView />;
}
