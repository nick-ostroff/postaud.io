import { NextResponse, type NextRequest } from "next/server";
import {
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

  // Overwrite the target user's auth cookies with the operator's own. Nothing
  // is minted here — these are the exact values the browser held before.
  for (const pair of stashed) {
    response.cookies.set(pair.name, pair.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    });
  }

  // If we stashed nothing, the operator has no session to go back to — clear
  // the target's cookies so they aren't left logged in as the customer.
  if (restoreFailed) {
    for (const c of collectAuthCookies(all)) {
      response.cookies.delete(c.name);
    }
  }

  for (const name of prevChunkNames(all)) {
    response.cookies.delete(name);
  }
  response.cookies.delete(IMP_COOKIE);

  await logImpersonationEnd({
    adminEmail: session.adminEmail,
    targetUserId: session.targetUserId,
    targetEmail: session.targetEmail,
    durationSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
  });

  return response;
}
