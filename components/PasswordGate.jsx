"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import ProfileView from "./ProfileView";

const LINE = "#E1E5EC", MUTED = "#6B7588", PRIMARY = "#243B6B";

// Wraps EVERY page (it sits in the root layout).
//  * Not logged in: shows the page (its own login form).
//  * Logged in with an administrator-set temporary password (flag must_change): shows ONLY the
//    "choose your own password" screen. No other page is reachable until the password was changed.
//  * Otherwise: shows the page with a slim bar (account + link to the profile).
// This is an interface rule; the data itself is protected by login and Row Level Security anyway.
export default function PasswordGate({ children }) {
  const pathname = usePathname();
  const [session, setSession] = useState(undefined);   // undefined = still checking
  const [mustChange, setMustChange] = useState(null);  // null = still checking

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const check = useCallback(async (s) => {
    if (!s) { setMustChange(false); return; }
    const r = await supabase.from("first_login_flags").select("must_change").eq("user_id", s.user.id);
    // if the table does not exist yet (script not applied) the feature is simply inactive
    setMustChange(!r.error && r.data && r.data[0] ? r.data[0].must_change === true : false);
  }, []);

  useEffect(() => { if (session !== undefined) { setMustChange(null); check(session); } }, [session, check]);
  useEffect(() => {
    const h = () => { if (session) check(session); };
    window.addEventListener("password-changed", h);
    return () => window.removeEventListener("password-changed", h);
  }, [session, check]);

  if (session === undefined || (session && mustChange === null)) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: MUTED, fontFamily: "system-ui, sans-serif" }}>Lädt …</div>;
  }
  if (session && mustChange) return <ProfileView forced />;

  return (
    <>
      {session && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 12px", background: "#fff", borderBottom: `1px solid ${LINE}`, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 12, color: MUTED }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</span>
          {pathname !== "/profil" && <a href="/profil" style={{ color: PRIMARY, fontWeight: 650, textDecoration: "none", whiteSpace: "nowrap" }}>Profil &amp; Passwort</a>}
        </div>
      )}
      {children}
    </>
  );
}
