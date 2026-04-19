import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse } from "@/server/telephony/twiml";
import { env } from "@/lib/env";

// POST /api/webhooks/twilio/voice/incoming
// Emits TwiML that gathers the 6-digit DTMF code (auto-dialed from the
// recipient's tel:+NUMBER,,,CODE link), then hands off to /voice/match.
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();
  const ok = await verifyTwilioSignature(req, form);
  if (!ok) {
    return twimlResponse(`<Say>Unauthorized.</Say><Hangup/>`);
  }

  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const matchUrl = `${base}/api/webhooks/twilio/voice/match`;

  return twimlResponse(`
    <Pause length="1"/>
    <Gather numDigits="6" timeout="5" action="${matchUrl}" method="POST"/>
    <Say voice="Polly.Joanna-Neural">Welcome. I didn't catch your code. Please enter the six digit code from your text message.</Say>
    <Gather input="dtmf" numDigits="6" timeout="8" action="${matchUrl}" method="POST"/>
    <Say>I'm sorry, I couldn't match you to an interview. Please tap the link in your text again. Goodbye.</Say>
    <Hangup/>
  `);
}
