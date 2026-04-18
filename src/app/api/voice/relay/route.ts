// WS /api/voice/relay — Twilio ConversationRelay websocket endpoint.
//
// Note: native WebSocket support on Vercel is via the Node runtime with an
// upgrade handler. The actual socket lifecycle will be wired when we
// implement the FSM (see src/server/fsm/interview-state.ts and
// plan/02-technical-spec.md §2.4).
//
// For now this is a placeholder HTTP handler so the route is discoverable.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: "websocket_required",
        message: "This endpoint upgrades to websocket from Twilio ConversationRelay.",
      },
    },
    { status: 426 },
  );
}
