import { createClient } from "@/db/server";

/**
 * Server-side helper: returns the current user's auth record + their workspace.
 * Throws if not signed in — middleware should have redirected already.
 */
export async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

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
