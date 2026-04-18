import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs outbound webhook payloads.
 * Header: X-PostAudio-Signature: t=<unix>,v1=<hex>
 * v1 = HMAC_SHA256(secret, `${t}.${body}`)
 */
export function signPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifySignature(header: string, body: string, secret: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v] as const;
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const PRIVATE_RANGES = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/0\.0\.0\.0/,
];

/** SSRF guard for outbound webhook URLs. */
export function isPublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !PRIVATE_RANGES.some((re) => re.test(url));
  } catch {
    return false;
  }
}
