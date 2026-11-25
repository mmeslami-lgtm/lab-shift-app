"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { rememberArea } from "../../lib/homeRoute";

// Platform administration. Visible only to rows of the table platform_admins (the server checks it).
const AdminDashboard = dynamic(() => import("../../components/AdminDashboard"), { ssr: false });

export default function Page() {
  useEffect(() => { rememberArea("/admin"); }, []); // 25.11.2026: nächste Anmeldung führt wieder hierher
  return <AdminDashboard />;
}
