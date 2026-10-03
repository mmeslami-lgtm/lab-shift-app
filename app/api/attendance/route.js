import { createHash } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Entry point for time-clock devices (and manual tests):  POST /api/attendance
//
// Every device belongs to ONE company. It identifies itself with its serial number and a secret
// (registered in the "devices" table, only a SHA-256 hash is stored). The company is taken from
// the device record — never from anything the caller claims — so a device can only ever write
// into its own company's data.
//
// Accepted formats (auto-detected by Content-Type):
//   1. JSON:  { "device_serial": "SN-1", "device_key": "...", "badge_code": "04A3B2C1", "scanned_at": "2026-10-01T08:00:00Z" }
//   2. key=value text (typical for terminals): SN=SN-1&key=...&PIN=04A3B2C1&time=2026-10-01T08:00:00Z
//   The serial/key can also be sent as headers x-device-serial / x-device-key, or as ?key=... in the URL.

export async function GET() {
  return Response.json({ status: "ok", message: "Attendance endpoint is live. POST a scan event here." });
}

function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const contentType = request.headers.get("content-type") || "";
    let badgeCode, scannedAt, serial, key, rawPayload;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      badgeCode = body.badge_code;
      scannedAt = body.scanned_at;
      serial = body.device_serial;
      key = body.device_key;
      const { device_key, ...safe } = body; // never store the secret in the raw log
      rawPayload = safe;
    } else {
      const raw = await request.text();
      const params = new URLSearchParams(raw);
      badgeCode = params.get("badge_code") || params.get("PIN") || params.get("pin");
      scannedAt = params.get("scanned_at") || params.get("time") || params.get("datetime");
      serial = params.get("device_serial") || params.get("SN") || params.get("sn");
      key = params.get("device_key") || params.get("key");
      params.delete("device_key"); params.delete("key");
      rawPayload = { raw: params.toString() };
    }
    serial = serial || request.headers.get("x-device-serial") || url.searchParams.get("SN") || url.searchParams.get("sn");
    key = key || request.headers.get("x-device-key") || url.searchParams.get("key");

    if (!serial || !key) {
      return Response.json({ error: "Gerät nicht identifiziert (device_serial und device_key fehlen)" }, { status: 401 });
    }
    if (!badgeCode) {
      return Response.json({ error: "badge_code fehlt" }, { status: 400 });
    }

    const { data: device, error: devErr } = await supabaseAdmin
      .from("devices")
      .select("org_id, serial, secret_hash, active")
      .eq("serial", String(serial))
      .maybeSingle();
    if (devErr) {
      console.error("Device lookup error:", devErr);
      return Response.json({ error: "Serverfehler" }, { status: 500 });
    }
    // Same answer for "unknown device" and "wrong key" so serial numbers cannot be probed.
    if (!device || !device.active || device.secret_hash !== sha256(key)) {
      return Response.json({ error: "Gerät nicht autorisiert" }, { status: 401 });
    }

    const when = scannedAt ? new Date(scannedAt) : new Date();
    if (Number.isNaN(when.getTime())) {
      return Response.json({ error: "scanned_at ist kein gültiges Datum" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("attendance_events")
      .insert({
        org_id: device.org_id,
        badge_code: String(badgeCode),
        scanned_at: when.toISOString(),
        device_id: device.serial,
        raw_payload: rawPayload,
      })
      .select("id, scanned_at")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return Response.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }
    return Response.json({ status: "ok", event: data });
  } catch (err) {
    console.error("Attendance endpoint error:", err);
    return Response.json({ error: "Serverfehler" }, { status: 500 });
  }
}
