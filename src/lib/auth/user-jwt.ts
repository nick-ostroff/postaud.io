/**
 * Mints a Supabase-compatible user JWT.
 *
 * API-token requests arrive with no cookies, so there is no Supabase session
 * to ride on. Rather than fall back to the service role (which bypasses RLS
 * and would make every vault endpoint a fresh authorization surface), we sign
 * a short-lived JWT carrying the caller's user id. Postgres then applies the
 * *existing* RLS policies verbatim — `auth.uid()` resolves exactly as it does
 * for a browser session.
 *
 * TTL is deliberately tiny: the JWT is minted per-request and used
 * immediately, so it never needs to outlive the request that created it.
 */
import "server-only";
import { createHmac } from "node:crypto";

const DEFAULT_TTL_SEC = 60;

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function mintUserJwt(
  userId: string,
  secret: string,
  nowSec: number,
  ttlSec: number = DEFAULT_TTL_SEC,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iat: nowSec,
      exp: nowSec + ttlSec,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}
