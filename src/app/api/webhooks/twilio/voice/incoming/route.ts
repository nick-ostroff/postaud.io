import { verifyTwilioSignature } from "@/lib/twilio";
import { gatherDialCode, hangupWithMessage } from "@/server/telephony/twiml";

// POST /api/webhooks/twilio/voice/incoming
// Returns TwiML that Gathers the DTMF dial code, then hands off to /voice/match.
export async function POST(req: Request) {
  const form = await req.formData();
  const ok = await verifyTwilioSignature(req.clone(), form);
  if (!ok) return hangupWithMessage("Unauthorized.");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return gatherDialCode(`${base}/api/webhooks/twilio/voice/match`);
}
