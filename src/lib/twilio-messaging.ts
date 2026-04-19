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

  // Twilio rejects non-public URLs (localhost, private IPs) for StatusCallback.
  // Skip it silently in dev; in prod we'll hand it a real https URL.
  if (opts.statusCallbackUrl && isPubliclyReachable(opts.statusCallbackUrl)) {
    base.statusCallback = opts.statusCallbackUrl;
  }

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

function isPubliclyReachable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname;
    if (host === "localhost") return false;
    if (host.endsWith(".local")) return false;
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
    if (host === "0.0.0.0") return false;
    // 172.16.0.0 – 172.31.255.255
    if (host.startsWith("172.")) {
      const second = Number(host.split(".")[1]);
      if (second >= 16 && second <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}
