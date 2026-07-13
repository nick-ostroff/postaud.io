import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE,
  collectAuthCookies,
  IMP_COOKIE,
  prevChunkNames,
  readImpersonation,
  unpackStash,
} from "@/lib/auth/impersonation";
import { logImpersonationEnd } from "@/server/super/impersonate";

/**
 * Ends an impersonation session by restoring the operator's stashed cookies.
 *
 * Deliberately NOT admin-gated: at the moment of exit the caller's session is
 * the TARGET USER's, not an admin's. Authorization is possession of the
 * `pa_op_prev` cookie — which is safe because that cookie holds a session the
 * caller demonstrably already had. This route restores a session; it can never
 * mint one, so a forged cookie yields nothing.
 *
 * RESTORE and AUDIT are deliberately decoupled:
 *
 *  - RESTORE is gated ONLY on a non-empty `pa_op_prev` stash. Replaying that
 *    stash grants nothing — they are cookies the caller already holds. Crucially
 *    it must NOT depend on the `pa_op_imp` HMAC: that signature uses
 *    SUPABASE_SERVICE_ROLE_KEY, so rotating the key mid-impersonation would
 *    otherwise kill the only escape hatch and strand the operator inside a
 *    customer's account behind a 400-day session cookie.
 *
 *  - The AUDIT WRITE is gated on a signature-VERIFIED `pa_op_imp`, because the
 *    actor identity in that row comes straight out of the cookie. Unsigned, any
 *    unauthenticated caller could forge audit rows attributed to a named admin.
 *    No verified session => no audit row (a server-side warning instead), but we
 *    still restore.
 *
 * The stash must be non-EMPTY, not merely non-null: `unpackStash` returns `[]`
 * (truthy!) for a stash of "[]", which a forger can trivially craft.
 */
export async function POST(req: NextRequest) {
  const all = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
  const session = readImpersonation(all);
  const stashed = unpackStash(all);

  if (!stashed || stashed.length === 0) {
    return NextResponse.json({ ok: false, error: "not_impersonating" }, { status: 400 });
  }

  if (!session) {
    console.warn(
      "[impersonate/exit] pa_op_imp missing/unverifiable (stale signing key?) — restoring the operator's session anyway; no audit row written",
    );
  }

  const secure = process.env.NODE_ENV === "production";

  const response = NextResponse.json({
    ok: true,
    redirect: session ? `/super/users/${session.targetUserId}` : "/super",
  });

  // Clear EVERY auth cookie the browser currently holds (the target's session)
  // before restoring. Writing only the stashed names is not enough: @supabase/ssr's
  // chunk reader prefers the unchunked base key, so a leftover `sb-x-auth-token`
  // beats the restored `sb-x-auth-token.0/.1` and keeps the operator logged in as
  // the customer — with the banner and Exit button now gone. A leftover higher
  // chunk (`.2`) is just as bad: it corrupts the concatenation.
  //
  // Re-setting a name below overrides this delete: ResponseCookies is keyed by
  // name, so the last write for a name wins.
  for (const c of collectAuthCookies(all)) {
    response.cookies.delete(c.name);
  }

  // Put the operator's own auth cookies back. Nothing is minted here — these are
  // the exact values the browser held before. Replay Supabase's own attributes
  // (@supabase/ssr DEFAULT_COOKIE_OPTIONS) so the persistent login isn't
  // downgraded to a session cookie and createBrowserClient can still read them.
  //
  // Restore ONLY genuine `sb-*-auth-token` names. The stash is caller-controlled
  // (a forged `pa_op_prev` sets whatever it decodes to), and while restoring an
  // arbitrary non-httpOnly cookie onto the caller's own browser grants nothing
  // they couldn't already do via document.cookie, constraining it here removes
  // the primitive entirely rather than reasoning about its harmlessness.
  for (const pair of collectAuthCookies(stashed)) {
    response.cookies.set(pair.name, pair.value, {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
  }

  for (const name of prevChunkNames(all)) {
    response.cookies.delete(name);
  }
  response.cookies.delete(IMP_COOKIE);

  // The audit row is written ONLY for a signature-verified session: its actor
  // identity comes out of `pa_op_imp`, so an unverified cookie would let an
  // unauthenticated caller forge rows attributed to a named admin.
  //
  // Never fail closed here either way: a broken (or skipped) audit write must
  // not trap the operator inside the customer's account.
  if (session) {
    try {
      await logImpersonationEnd({
        adminEmail: session.adminEmail,
        targetUserId: session.targetUserId,
        targetEmail: session.targetEmail,
        durationSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
      });
    } catch (err) {
      console.error("[impersonate/exit] audit write failed; restoring session anyway", err);
    }
  }

  return response;
}
