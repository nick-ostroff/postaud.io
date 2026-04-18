import Twilio from "twilio";
import { env } from "./env";

let cached: ReturnType<typeof Twilio> | null = null;

export function twilio() {
  if (cached) return cached;
  cached = Twilio(env().TWILIO_ACCOUNT_SID, env().TWILIO_AUTH_TOKEN);
  return cached;
}

/**
 * Verifies X-Twilio-Signature against a reconstructed URL + params.
 * Usage: verifyTwilioSignature(req, await req.formData()).
 */
export async function verifyTwilioSignature(req: Request, params: FormData | URLSearchParams): Promise<boolean> {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;
  const url = req.url; // must match what Twilio signed (full URL)
  const authToken = env().TWILIO_AUTH_TOKEN;
  const paramObj: Record<string, string> = {};
  params.forEach((v, k) => (paramObj[k] = typeof v === "string" ? v : ""));
  return Twilio.validateRequest(authToken, signature, url, paramObj);
}
