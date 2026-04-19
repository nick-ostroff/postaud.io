import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/twilio";

// POST /api/webhooks/twilio/messaging/status — SMS delivery updates.
// Twilio posts: MessageSid, MessageStatus, ErrorCode?, To, From, ...
// For MVP we just verify the signature and 200 OK. A future iteration
// will persist delivery state and surface it in the UI.
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();

  const ok = await verifyTwilioSignature(req, form);
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  // TODO: persist {MessageSid, MessageStatus, ErrorCode} per request_id for UI surface.
  return NextResponse.json({ received: true });
}
