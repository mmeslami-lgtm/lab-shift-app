"use client";

import dynamic from "next/dynamic";

// Platform administration. Visible only to rows of the table platform_admins (the server checks it).
const AdminDashboard = dynamic(() => import("../../components/AdminDashboard"), { ssr: false });

export default function Page() {
  return <AdminDashboard />;
}
