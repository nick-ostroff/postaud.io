/**
 * Cookie plumbing for operator impersonation.
 *
 * Impersonation swaps the browser onto the target user's real Supabase
 * session. Before that happens we copy the operator's own auth cookies
 * verbatim into `pa_op_prev` so Exit can put them back. Exit *restores* a
 * session, it never mints one — so possession of a forged `pa_op_prev` grants
 * nothing an attacker didn't already have.
 *
 * Supabase auth cookies routinely exceed the 4KB per-cookie browser limit and
 * are chunked by @supabase/ssr into `.0`, `.1`, … The stash has to survive
 * that in both directions, which is what packStash/unpackStash are for.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const IMP_COOKIE = "pa_op_imp";
export const PREV_COOKIE = "pa_op_prev";

/** Operator sessions expire after an hour so the stashed refresh token can't go stale. */
export const MAX_IMPERSONATION_MS = 60 * 60 * 1000;

/**
 * Lifetime of the operator-only cookies (`pa_op_prev.*`, `pa_op_imp`).
 *
 * Deliberately LONGER than MAX_IMPERSONATION_MS: isExpired() drives the
 * banner's expired *state*, but the operator must always retain the ability to
 * escape. If these were session cookies (the old behaviour) closing the browser
 * mid-impersonation would strand the operator inside the customer's account,
 * because the target's Supabase cookie persists for 400 days.
 */
export const OPERATOR_COOKIE_MAX_AGE = 8 * 60 * 60;

/** Mirrors @supabase/ssr's DEFAULT_COOKIE_OPTIONS.maxAge so restore doesn't downgrade the login. */
export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** Stay under the ~4096-byte per-cookie limit with room for name + attributes. */
const CHUNK_SIZE = 3500;

export type CookiePair = { name: string; value: string };

export type ImpersonationSession = {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  startedAt: number;
};

// `sb-<project-ref>-auth-token`, optionally chunked with a numeric suffix.
// Deliberately excludes `-auth-token-code-verifier`, which is PKCE scratch
// state and not part of the session.
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

export function collectAuthCookies(all: CookiePair[]): CookiePair[] {
  return all.filter((c) => AUTH_COOKIE_RE.test(c.name));
}

export function packStash(pairs: CookiePair[]): CookiePair[] {
  const encoded = Buffer.from(JSON.stringify(pairs), "utf8").toString("base64url");
  const chunks: CookiePair[] = [];
  for (let i = 0; i * CHUNK_SIZE < encoded.length; i++) {
    chunks.push({
      name: `${PREV_COOKIE}.${i}`,
      value: encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  // An empty pairs array still yields one chunk, so exit can distinguish
  // "stashed nothing" from "no stash at all".
  if (chunks.length === 0) chunks.push({ name: `${PREV_COOKIE}.0`, value: encoded });
  return chunks;
}

export function unpackStash(all: CookiePair[]): CookiePair[] | null {
  const chunks = all
    .filter((c) => c.name.startsWith(`${PREV_COOKIE}.`))
    .map((c) => ({ index: Number(c.name.slice(PREV_COOKIE.length + 1)), value: c.value }))
    .filter((c) => Number.isInteger(c.index))
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) return null;

  try {
    const json = Buffer.from(chunks.map((c) => c.value).join(""), "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((p) => p && typeof p.name === "string" && typeof p.value === "string")) {
      return null;
    }
    return parsed as CookiePair[];
  } catch {
    return null;
  }
}

export function prevChunkNames(all: CookiePair[]): string[] {
  return all.filter((c) => c.name.startsWith(`${PREV_COOKIE}.`)).map((c) => c.name);
}

/**
 * `pa_op_imp` is HMAC-signed with a server-only secret.
 *
 * It used to be unsigned on the theory that "forging it only makes a banner
 * appear". The exit route broke that premise: it reads adminEmail/targetUserId
 * out of this cookie and writes them into `audit_logs` as the ACTOR, with
 * service-role privileges, on an intentionally un-gated route. Unsigned, that
 * let anyone on the internet forge audit rows attributed to a named admin.
 *
 * Signing (rather than admin-gating exit) keeps the exit route reachable by the
 * target-user session, so it introduces no stranding risk.
 */
function signPayload(payload: string): string {
  return createHmac("sha256", env().SUPABASE_SERVICE_ROLE_KEY).update(payload).digest("base64url");
}

function signatureMatches(payload: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(payload), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function encodeSession(s: ImpersonationSession): string {
  const payload = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

/**
 * Decodes and VERIFIES `pa_op_imp`. A missing, malformed, or badly-signed
 * cookie is treated as "not impersonating". Returns expired sessions too — the
 * operator still needs the Exit button.
 */
export function readImpersonation(all: CookiePair[]): ImpersonationSession | null {
  const raw = all.find((c) => c.name === IMP_COOKIE)?.value;
  if (!raw) return null;

  const sep = raw.lastIndexOf(".");
  if (sep <= 0) return null; // unsigned cookies are rejected outright
  const payload = raw.slice(0, sep);
  const signature = raw.slice(sep + 1);
  if (!signature || !signatureMatches(payload, signature)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed as Partial<ImpersonationSession>;
    if (
      typeof s.adminEmail !== "string" ||
      typeof s.targetUserId !== "string" ||
      typeof s.targetEmail !== "string" ||
      typeof s.startedAt !== "number"
    ) {
      return null;
    }
    return s as ImpersonationSession;
  } catch {
    return null;
  }
}

export function isExpired(s: ImpersonationSession, now: number): boolean {
  return now - s.startedAt > MAX_IMPERSONATION_MS;
}
