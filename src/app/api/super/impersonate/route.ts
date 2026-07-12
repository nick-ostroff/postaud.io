import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import {
  collectAuthCookies,
  encodeSession,
  IMP_COOKIE,
  packStash,
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
  for (const chunk of packStash(prevAuth)) {
    response.cookies.set(chunk.name, chunk.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    });
  }
  response.cookies.set(
    IMP_COOKIE,
    encodeSession({
      adminEmail,
      targetUserId: userId,
      targetEmail: minted.email,
      startedAt: Date.now(),
    }),
    { httpOnly: true, secure, sameSite: "lax", path: "/" },
  );

  await logImpersonationStart({
    adminEmail,
    targetUserId: userId,
    targetEmail: minted.email,
    organizationId: await primaryOrgId(userId),
  });

  return response;
}
