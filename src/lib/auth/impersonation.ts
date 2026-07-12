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

export const IMP_COOKIE = "pa_op_imp";
export const PREV_COOKIE = "pa_op_prev";

/** Operator sessions expire after an hour so the stashed refresh token can't go stale. */
export const MAX_IMPERSONATION_MS = 60 * 60 * 1000;

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

export function encodeSession(s: ImpersonationSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

/**
 * Decodes `pa_op_imp`. Note this cookie is unsigned on purpose: forging it can
 * only make the banner appear, it grants no access. Returns expired sessions
 * too — the operator still needs the Exit button.
 */
export function readImpersonation(all: CookiePair[]): ImpersonationSession | null {
  const raw = all.find((c) => c.name === IMP_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
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
