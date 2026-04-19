import { NextResponse } from "next/server";
import { createClient } from "@/db/server";
import { ensureViewerBootstrapped } from "@/db/queries";
import { env } from "@/lib/env";

/**
 * Supabase auth callback. Runs after magic-link click or OAuth redirect.
 * Exchanges the `code` for a session, then bootstraps user + org + membership
 * on the user's first sign-in (via service-role to bypass RLS on public
 * tables that don't grant INSERT to authenticated).
 *
 * Important: build redirect URLs from NEXT_PUBLIC_APP_URL, NOT from
 * request.url — behind a reverse proxy (Railway, Vercel, etc.), request.url
 * is the internal container URL, not the public domain.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    try {
      await ensureViewerBootstrapped({
        id: user.id,
        email: user.email ?? "",
        displayName: (user.user_metadata?.full_name as string | undefined) ?? null,
      });
    } catch (err) {
      console.error("[auth/callback] bootstrap failed", err);
      return NextResponse.redirect(`${origin}/sign-in?error=bootstrap_failed`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
