import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/twilio";
import { serviceClient } from "@/db/service";

// POST /api/webhooks/twilio/voice/recording?session=<id>
// Twilio fires this when the recording finishes processing. We persist the
// RecordingSid + RecordingUrl onto the interview_session so the dashboard
// can surface a playback URL.
//
// Later iteration: also download + upload to Supabase Storage so we serve
// through our own signed URLs.
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();

  const ok = await verifyTwilioSignature(req, form);
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const recordingSid = form.get("RecordingSid") as string | null;
  const recordingUrl = form.get("RecordingUrl") as string | null;
  const recordingStatus = form.get("RecordingStatus") as string | null;

  if (!sessionId || recordingStatus !== "completed") {
    return NextResponse.json({ received: true, skipped: true });
  }

  const svc = serviceClient();
  await svc
    .from("interview_sessions")
    .update({
      recording_sid: recordingSid,
      recording_path: recordingUrl ? `${recordingUrl}.mp3` : null,
    })
    .eq("id", sessionId);

  return NextResponse.json({ received: true });
}
