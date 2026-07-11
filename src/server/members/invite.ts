import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";
import type { MemberRole } from "@/db/types";

/**
 * Invites a new (or re-invites an existing) user into a workspace.
 *
 * Sends the invite via `supabase.auth.admin.inviteUserByEmail` — Supabase
 * sends the email itself, pointing back at `/auth/callback?next=/welcome` so
 * the accept flow (set password, see role + accessible series, set
 * `accepted_at`) runs before the invitee lands on `/app`.
 *
 * `users` + `memberships` are upserted via the service client because RLS
 * grants no INSERT to `authenticated` on those tables (see
 * `ensureViewerBootstrapped`) — invites are an admin-gated, service-role
 * operation end to end.
 */
export async function inviteMember(args: {
  email: string;
  role: MemberRole;
  orgId: string;
  invitedBy: string;
}): Promise<{ userId: string }> {
  const { email, role, orgId, invitedBy } = args;
  const svc = serviceClient();
  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/welcome`,
  });

  let userId: string;
  if (error || !data?.user) {
    // inviteUserByEmail errors (422) if this email already has an auth
    // account — e.g. re-inviting someone into a second workspace, or
    // inviting an address that already signed up. Fall back to the
    // existing `users` row (mirrors auth.users 1:1) rather than failing.
    const { data: existing } = await svc
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) {
      throw new Error(error?.message ?? "Could not send invite");
    }
    userId = existing.id;
  } else {
    userId = data.user.id;
  }

  const { error: userErr } = await svc
    .from("users")
    .upsert({ id: userId, email }, { onConflict: "id", ignoreDuplicates: false });
  if (userErr) throw new Error(userErr.message);

  const { error: memErr } = await svc
    .from("memberships")
    .upsert(
      { user_id: userId, organization_id: orgId, role, accepted_at: null },
      { onConflict: "user_id,organization_id" },
    );
  if (memErr) throw new Error(memErr.message);

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: invitedBy,
    action: "member.invited",
    target_type: "user",
    target_id: userId,
    meta: { email, role },
  });
  if (auditErr) {
    // Non-fatal — the invite already went out; don't fail the request over
    // an audit-trail write.
    console.error("[inviteMember] audit log failed", auditErr);
  }

  return { userId };
}
