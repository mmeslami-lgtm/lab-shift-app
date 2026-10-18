import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Daily "keep-alive" (Vercel Cron, see vercel.json): one tiny read so the free Supabase project is never
// paused for inactivity. Reads only a count – no data is returned or changed.
// Protection: when the env var CRON_SECRET is set in Vercel, Vercel sends it automatically and anyone
// else gets 401. Without CRON_SECRET the route still only answers "ok".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server nicht eingerichtet" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const { error } = await supabaseAdmin.from("organizations").select("id", { count: "exact", head: true });
  return new Response(JSON.stringify({ ok: !error, at: new Date().toISOString() }), { status: error ? 500 : 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
