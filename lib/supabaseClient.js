import { createClient } from "@supabase/supabase-js";

// Browser client (logs a person in and reads only what the Row Level Security rules allow).
// The "anon" key is safe in the browser: what a user may see is decided by the database rules,
// not by hiding this key.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// null when the environment variables are missing, so a page can show a clear message instead of crashing.
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
