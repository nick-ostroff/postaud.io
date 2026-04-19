import { createClient } from "@/db/server";
import { serviceClient } from "@/db/service";

/**
 * Idempotently creates the `public.users` row, a default organization, and an
 * owner membership for a just-authenticated user. Uses the service-role client
 * so RLS doesn't block the inserts (the `authenticated` role has no INSERT
 * policy on those tables — only the service role should write them).
 */
export async function ensureViewerBootstrapped(args: {
  id: string;
  email: string;
  displayName: string | null;
}) {
  const svc = serviceClient();

  await svc.from("users").upsert(
    { id: args.id, email: args.email, display_name: args.displayName },
    { onConflict: "id" },
  );

  // Use limit(1) instead of maybeSingle(): maybeSingle errors when there are
  // multiple rows, which caused duplicate orgs to snowball on each page load.
  const { data: existing } = await svc
    .from("memberships")
    .select("organization_id")
    .eq("user_id", args.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  const orgName = args.email?.split("@")[0] || "Workspace";
  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(orgErr?.message ?? "Could not create organization");

  const { error: mErr } = await svc
    .from("memberships")
    .insert({ user_id: args.id, organization_id: org.id, role: "owner" });
  if (mErr) throw new Error(mErr.message);
}

/**
 * Server-side helper: returns the current user's auth record + their workspace.
 * Self-heals: if somehow the user has no membership (e.g. older session from
 * before bootstrap existed), runs ensureViewerBootstrapped on the fly.
 */
export async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // limit(1) rather than maybeSingle() — multi-row state must not throw here
  // or we end up calling bootstrap repeatedly and creating duplicate orgs.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1);
  let membership = memberships?.[0] ?? null;

  if (!membership) {
    await ensureViewerBootstrapped({
      id: user.id,
      email: user.email ?? "",
      displayName: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
    const { data: retry } = await supabase
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1);
    membership = retry?.[0] ?? null;
  }

  if (!membership) {
    return { user, supabase, organization: null, role: null };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, plan, credits_remaining")
    .eq("id", membership.organization_id)
    .maybeSingle();

  return { user, supabase, organization, role: membership.role };
}
