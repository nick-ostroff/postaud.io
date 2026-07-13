/**
 * Decides whether the impersonation banner should render, from raw cookie
 * pairs read on the server.
 *
 * Two independent signals feed this: `pa_op_prev` (the stash) proves an
 * impersonation is actually IN PROGRESS; `pa_op_imp` (HMAC-signed) proves
 * WHO. They can diverge — most importantly after a SUPABASE_SERVICE_ROLE_KEY
 * rotation, `readImpersonation` starts returning null for a still-live
 * session because the old signature no longer verifies (see
 * impersonation.ts's `readImpersonation` doc comment).
 *
 * If banner visibility were gated on a *verified* session, it would silently
 * vanish in that case while the impersonation — and the exit route, which is
 * deliberately decoupled from the signature — is still live. The operator
 * would be stuck browsing as the customer with no visual cue and no visible
 * way out, even though the escape hatch is still open underneath.
 *
 * So visibility is gated on the stash alone. A verified session additionally
 * supplies the target's email and expiry state; an unverifiable one still
 * shows the banner, just with generic copy that doesn't claim an identity it
 * can't prove.
 */
import "server-only";
import {
  isExpired,
  readImpersonation,
  unpackStash,
  type CookiePair,
  type ImpersonationSession,
} from "@/lib/auth/impersonation";

export type ImpersonationBannerState = {
  session: ImpersonationSession | null;
  expired: boolean;
};

/**
 * `now` defaults to the current clock. It's read HERE rather than at the call
 * site because the caller is a server component, and react-hooks/purity
 * forbids calling an impure function like Date.now() during render. Tests pass
 * it explicitly.
 */
export function resolveImpersonationBanner(
  cookiePairs: CookiePair[],
  now: number = Date.now(),
): ImpersonationBannerState | null {
  const stashed = unpackStash(cookiePairs);
  if (!stashed || stashed.length === 0) return null;

  const session = readImpersonation(cookiePairs);
  return { session, expired: session ? isExpired(session, now) : false };
}
