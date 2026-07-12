import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie on every request and gates /app/* behind auth.
 * See https://supabase.com/docs/guides/auth/server-side/nextjs for the canonical pattern.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Gate dashboard routes — unauth users get bounced to sign-in.
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Gate /super and /api/super — non-admins get 404, never 403. We return 404
  // rather than redirecting so the console's existence is not disclosed.
  //
  // EXCEPTION: the impersonation exit route must stay reachable while
  // impersonating, when the caller's session belongs to the target user and is
  // NOT an admin. It authorizes on possession of the `pa_op_prev` cookie
  // instead — safe, because that cookie is a session the caller already had.
  const path = request.nextUrl.pathname;
  const isExitRoute = path === "/api/super/impersonate/exit";
  if ((path.startsWith("/super") || path.startsWith("/api/super")) && !isExitRoute) {
    // Intentionally NOT using platformAdminEmails() from @/lib/env —
    // middleware runtime can't carry Zod. Keep in sync with src/lib/env.ts.
    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = user?.email?.toLowerCase() ?? "";
    if (!email || !adminEmails.includes(email)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
