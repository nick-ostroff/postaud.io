import { NextResponse } from "next/server";

// POST /api/webhooks/twilio/voice/recording
// Download recording → upload to Supabase Storage → enqueue pipeline jobs.
export async function POST(_req: Request) {
  // TODO: verify signature, fetch RecordingUrl+".mp3", upload to Storage,
  // update interview_sessions, insert jobs rows for the pipeline.
  return NextResponse.json({ ok: true });
}
