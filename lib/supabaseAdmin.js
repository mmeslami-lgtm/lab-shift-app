import { createClient } from "@supabase/supabase-js";

// SERVER-SIDE ONLY. This uses the Supabase "service_role" key, which bypasses Row Level
// Security — that's correct here because this file is only ever imported inside API routes
// (app/api/**/route.js), which run on the server, never sent to the browser. NEVER import
// this from a component or anywhere that runs client-side, and NEVER prefix this env var with
// NEXT_PUBLIC_ (that would expose it to the browser).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "Supabase (Server) ist noch nicht konfiguriert — NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen in den Umgebungsvariablen."
  );
}

export const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "");
