import { NextResponse } from "next/server";

// POST /api/webhooks/stripe
// Verify signature, handle checkout.session.completed + subscription lifecycle,
// top up organizations.credits_remaining.
export async function POST(_req: Request) {
  return NextResponse.json({ received: true });
}
