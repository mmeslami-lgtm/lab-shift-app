"use client";

import dynamic from "next/dynamic";

// Profile: account information, active modules and "Passwort ändern". Needs a login (shows the login form otherwise).
const ProfileView = dynamic(() => import("../../components/ProfileView"), { ssr: false });

export default function Page() {
  return <ProfileView />;
}
