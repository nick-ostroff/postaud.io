import { NextResponse } from "next/server";

// POST /api/webhooks/twilio/messaging/status — SMS delivery updates.
export async function POST(_req: Request) {
  return NextResponse.json({ ok: true });
}
