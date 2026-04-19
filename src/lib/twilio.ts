import Twilio from "twilio";
import { env } from "./env";

let cached: ReturnType<typeof Twilio> | null = null;

export function twilio() {
  if (cached) return cached;
  cached = Twilio(env().TWILIO_ACCOUNT_SID, env().TWILIO_AUTH_TOKEN);
  return cached;
}

/**
 * Verifies X-Twilio-Signature.
 *
 * Twilio signs the exact URL we configured in their dashboard (the public
 * tunnel / production URL). When the request hits Next via a tunnel, req.url
 * comes in as http://localhost:3000/... — which would never match Twilio's
 * signature. We always reconstruct using NEXT_PUBLIC_APP_URL + the request
 * pathname + query so the HMAC matches.
 */
export async function verifyTwilioSignature(req: Request, params: FormData | URLSearchParams): Promise<boolean> {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  const reqUrl = new URL(req.url);
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}${reqUrl.pathname}${reqUrl.search}`;

  const authToken = env().TWILIO_AUTH_TOKEN;
  const paramObj: Record<string, string> = {};
  params.forEach((v, k) => (paramObj[k] = typeof v === "string" ? v : ""));
  return Twilio.validateRequest(authToken, signature, url, paramObj);
}
