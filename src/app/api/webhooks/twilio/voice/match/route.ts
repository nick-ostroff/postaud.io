import { hangupWithMessage } from "@/server/telephony/twiml";

// POST /api/webhooks/twilio/voice/match
// Resolves digits (or speech/caller-ID) → interview_request, then emits
// <Connect><ConversationRelay>. See plan/05-twilio-flow.md.
export async function POST(_req: Request) {
  // TODO:
  //   1. verify signature
  //   2. match by DTMF dial_code, else caller-ID, else verbal fallback
  //   3. upsert interview_sessions
  //   4. respond with connectConversationRelay(...)
  return hangupWithMessage("Interview matching not implemented yet.");
}
