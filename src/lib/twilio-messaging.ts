import { twilio } from "./twilio";
import { env, voicePoolNumbers } from "./env";

/**
 * Sends the invite SMS through Twilio.
 * Prefers TWILIO_MESSAGING_SERVICE_SID; falls back to the first number in
 * TWILIO_VOICE_POOL_NUMBERS as the `From`. Throws on any Twilio error so the
 * caller can surface a useful message.
 */
export async function sendInviteSMS(opts: {
  toE164: string;
  body: string;
  statusCallbackUrl?: string;
}): Promise<{ sid: string }> {
  const e = env();
  const client = twilio();

  const base: {
    to: string;
    body: string;
    statusCallback?: string;
    messagingServiceSid?: string;
    from?: string;
  } = { to: opts.toE164, body: opts.body };

  if (opts.statusCallbackUrl) base.statusCallback = opts.statusCallbackUrl;

  if (e.TWILIO_MESSAGING_SERVICE_SID && e.TWILIO_MESSAGING_SERVICE_SID !== "") {
    base.messagingServiceSid = e.TWILIO_MESSAGING_SERVICE_SID;
  } else {
    const pool = voicePoolNumbers();
    const from = pool[0];
    if (!from) {
      throw new Error(
        "No Twilio sender configured — set TWILIO_MESSAGING_SERVICE_SID or TWILIO_VOICE_POOL_NUMBERS",
      );
    }
    base.from = from;
  }

  const msg = await client.messages.create(base);
  return { sid: msg.sid };
}
