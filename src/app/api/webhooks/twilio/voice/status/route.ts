import { NextResponse } from "next/server";

// POST /api/webhooks/twilio/voice/status — lifecycle events.
// TODO: finalize interview_sessions on completed/failed.
export async function POST(_req: Request) {
  return NextResponse.json({ ok: true });
}
