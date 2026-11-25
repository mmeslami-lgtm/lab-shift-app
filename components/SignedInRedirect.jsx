"use client";

import { useEffect } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { myAreas, lastArea } from "../lib/homeRoute";

// On the public start page: whoever is already signed in goes straight to their own area
// (planner, employee app or admin), so employees and managers never see the product page.
export default function SignedInRedirect() {
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session) return;
      // 25.11.2026: zuletzt benutzter Bereich; bei mehreren Bereichen ohne Vorgeschichte die Auswahl auf /login
      const list = await myAreas(supabase, data.session.user.id);
      const last = lastArea();
      const to = last && list.includes(last) ? last : list.length > 1 ? "/login" : list[0] || "/profil";
      if (!cancelled) window.location.replace(to);
    });
    return () => { cancelled = true; };
  }, []);
  return null;
}
