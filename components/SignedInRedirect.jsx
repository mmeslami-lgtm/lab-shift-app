"use client";

import { useEffect } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { homeRoute } from "../lib/homeRoute";

// On the public start page: whoever is already signed in goes straight to their own area
// (planner, employee app or admin), so employees and managers never see the product page.
export default function SignedInRedirect() {
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session) return;
      const to = await homeRoute(supabase, data.session.user.id);
      if (!cancelled) window.location.replace(to);
    });
    return () => { cancelled = true; };
  }, []);
  return null;
}
