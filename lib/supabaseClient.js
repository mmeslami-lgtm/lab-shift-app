import { createClient } from "@supabase/supabase-js";

// These come from Supabase: Project Settings -> API. The "anon" key is safe to use here
// because the actual access rules are enforced by Row Level Security (RLS) policies on the
// database tables themselves, not by keeping this key secret.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase ist noch nicht konfiguriert — NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen in den Umgebungsvariablen."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
