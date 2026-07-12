import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import {
  collectAuthCookies,
  encodeSession,
  IMP_COOKIE,
  OPERATOR_COOKIE_MAX_AGE,
  packStash,
  prevChunkNames,
} from "@/lib/auth/impersonation";
import { logImpersonationStart, mintSessionToken, primaryOrgId } from "@/server/super/impersonate";

/**
 * Starts an operator impersonation session: swaps the browser onto the target
 * user's real Supabase session, after stashing the operator's own auth cookies
 * so /api/super/impersonate/exit can put them back.
 *
 * The operator has FULL user powers while impersonating — no write guardrails,
 * by design. The banner and the audit log are the safety net.
 */
export async function POST(req: NextRequest) {
  // Admin surfaces 404, never 403/401, so their existence isn't disclosed.
  const adminEmail = await platformAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
  }

  const minted = await mintSessionToken(userId);
  if (!minted) {
    return NextResponse.json({ ok: false, error: "Could not start session for that user" }, { status: 400 });
  }

  // Capture the operator's cookies from the REQUEST before verifyOtp writes the
  // target's cookies to the RESPONSE. Request cookies are unaffected by
  // response writes, so ordering within this handler is safe.
  const prevAuth = collectAuthCookies(req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })));

  const response = NextResponse.json({ ok: true, redirect: "/app" });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: minted.tokenHash });
  if (error) {
    // Nothing was stashed and the operator's own cookies are untouched.
    return NextResponse.json({ ok: false, error: "Session swap failed" }, { status: 500 });
  }

  const secure = process.env.NODE_ENV === "production";

  // The stash holds an admin session, so it stays httpOnly. The 8h maxAge keeps
  // Exit reachable after a browser restart — without it these were session
  // cookies while the target's Supabase cookie persists for 400 days, so closing
  // the browser mid-impersonation reopened INSIDE the customer's account with no
  // banner and no way out.
  const stash = packStash(prevAuth);
  for (const chunk of stash) {
    response.cookies.set(chunk.name, chunk.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: OPERATOR_COOKIE_MAX_AGE,
    });
  }

  // Drop any stale stash chunks from a previous, longer impersonation that this
  // stash doesn't overwrite — leftovers would corrupt the base64 concatenation.
  const fresh = new Set(stash.map((c) => c.name));
  for (const name of prevChunkNames(req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })))) {
    if (!fresh.has(name)) response.cookies.delete(name);
  }

  response.cookies.set(
    IMP_COOKIE,
    encodeSession({
      adminEmail,
      targetUserId: userId,
      targetEmail: minted.email,
      startedAt: Date.now(),
    }),
    { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: OPERATOR_COOKIE_MAX_AGE },
  );

  // Fail CLOSED: an impersonation that isn't in the audit log must not happen.
  // The target's cookies live only on `response`, so aborting here costs nothing
  // and leaves the operator's own session untouched.
  try {
    await logImpersonationStart({
      adminEmail,
      targetUserId: userId,
      targetEmail: minted.email,
      organizationId: await primaryOrgId(userId),
    });
  } catch (err) {
    console.error("[impersonate] audit write failed; refusing to start session", err);
    return NextResponse.json({ ok: false, error: "Could not record impersonation" }, { status: 500 });
  }

  return response;
}
