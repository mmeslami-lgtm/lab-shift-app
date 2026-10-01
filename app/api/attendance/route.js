import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// This endpoint is what the RFID/chip reader (or a manual test) sends scan events to.
// URL once deployed: https://DEIN-PROJEKT.vercel.app/api/attendance
//
// Accepts two body formats, auto-detected by Content-Type:
//   1. JSON (easiest for manual testing or most modern devices):
//        POST, Content-Type: application/json
//        { "badge_code": "04A3B2C1", "scanned_at": "2026-10-01T08:00:00Z", "device_id": "tor-1" }
//      (scanned_at and device_id are optional — scanned_at defaults to "now")
//
//   2. Plain key=value (the format many cheap RFID terminals / ADMS-style devices use):
//        POST, Content-Type: application/x-www-form-urlencoded or text/plain
//        badge_code=04A3B2C1&scanned_at=2026-10-01T08:00:00Z&device_id=tor-1
//
// Once you know your device's exact format, this is the file to adjust — the parsing logic
// below is the only part likely to need changes for a specific brand/model.

export async function GET() {
  return Response.json({ status: "ok", message: "Attendance endpoint is live. POST a scan event here." });
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let badgeCode, scannedAt, deviceId, rawPayload;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      badgeCode = body.badge_code;
      scannedAt = body.scanned_at;
      deviceId = body.device_id;
      rawPayload = body; // capture at parse time — the body stream can only be read once
    } else {
      // Plain text / form-urlencoded: parse "key=value&key2=value2" by hand, since the device
      // may not send a standard format the built-in parsers recognize.
      const raw = await request.text();
      const params = new URLSearchParams(raw);
      badgeCode = params.get("badge_code") || params.get("PIN") || params.get("pin");
      scannedAt = params.get("scanned_at") || params.get("time") || params.get("datetime");
      deviceId = params.get("device_id") || params.get("SN") || params.get("sn");
      rawPayload = { raw };
    }

    if (!badgeCode) {
      return Response.json({ error: "badge_code fehlt" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("attendance_events")
      .insert({
        badge_code: String(badgeCode),
        scanned_at: scannedAt ? new Date(scannedAt).toISOString() : new Date().toISOString(),
        device_id: deviceId ? String(deviceId) : null,
        raw_payload: rawPayload,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ status: "ok", event: data });
  } catch (err) {
    console.error("Attendance endpoint error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
