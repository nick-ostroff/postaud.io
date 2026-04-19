import { NextResponse } from "next/server";
import { createClient } from "@/db/server";

/**
 * Supabase auth callback. Runs after magic-link click or OAuth redirect.
 * Exchanges the `code` for a session, then bootstraps user + org + membership
 * if this is the user's first sign-in.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
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

  // Bootstrap: create user row + default org + membership if missing.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.rpc("current_org_id"); // noop warm-up

    const { data: existingMembership } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingMembership) {
      // Upsert user row (handles race w/ duplicate sign-in attempts).
      await supabase.from("users").upsert({
        id: user.id,
        email: user.email ?? "",
        display_name: user.user_metadata?.full_name ?? null,
      });

      // Create org + membership in two steps (Supabase JS doesn't support
      // multi-table writes transactionally; acceptable for first-login).
      const { data: org } = await supabase
        .from("organizations")
        .insert({ name: user.email?.split("@")[0] ?? "Workspace" })
        .select("id")
        .single();

      if (org) {
        await supabase.from("memberships").insert({
          user_id: user.id,
          organization_id: org.id,
          role: "owner",
        });
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
