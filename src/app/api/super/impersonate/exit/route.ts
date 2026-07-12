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
 */
export async function POST(req: NextRequest) {
  const all = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
  const session = readImpersonation(all);
  const stashed = unpackStash(all);

  if (!session || !stashed) {
    return NextResponse.json({ ok: false, error: "not_impersonating" }, { status: 400 });
  }

  const secure = process.env.NODE_ENV === "production";
  const restoreFailed = stashed.length === 0;

  const response = NextResponse.json({
    ok: true,
    redirect: restoreFailed ? "/sign-in" : `/super/users/${session.targetUserId}`,
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
  for (const pair of stashed) {
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

  // Never fail closed here: a broken audit write must not trap the operator
  // inside the customer's account. Log it and still hand back the session.
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

  return response;
}
