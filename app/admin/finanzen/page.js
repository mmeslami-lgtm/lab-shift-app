"use client";

import dynamic from "next/dynamic";

// Finanzen der Plattform (nur Plattform-Admin; der Server prüft platform_admins). Gleiche Anmeldung wie /admin.
const AdminDashboard = dynamic(() => import("../../../components/AdminDashboard"), { ssr: false });

export default function Page() {
  return <AdminDashboard view="finanzen" />;
}
