import { NextResponse } from "next/server";

// POST /api/webhooks/twilio/messaging/inbound — replies (STOP/HELP).
export async function POST(_req: Request) {
  // TODO: honor STOP/UNSUBSCRIBE/CANCEL → contacts.consent_status='revoked'.
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
