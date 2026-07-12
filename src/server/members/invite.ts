import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";
import type { MemberRole } from "@/db/types";

/**
 * Typed invite failures the caller (`POST /api/members`) maps to specific
 * HTTP responses, and the client (`InviteForm`) maps to specific copy.
 * `code` is intentionally the only thing that crosses the API boundary —
 * `message` is a same-shape fallback for any caller that just wants text.
 */
export class InviteMemberError extends Error {
  code: "already_member" | "in_other_workspace";
  constructor(code: "already_member" | "in_other_workspace", message: string) {
    super(message);
    this.name = "InviteMemberError";
    this.code = code;
  }
}

/**
 * Invites a new (or re-invites an existing, not-yet-accepted) user into a
 * workspace.
 *
 * Sends the invite via `supabase.auth.admin.inviteUserByEmail` — Supabase
 * sends the email itself, pointing back at `/auth/callback?next=/welcome` so
 * the accept flow (set password, see role + accessible series, set
 * `accepted_at`) runs before the invitee lands on `/app`.
 *
 * V1 is single-workspace-per-user by design, so before sending anything this
 * checks the target email's existing membership state:
 * - already an *accepted* member of this org → `InviteMemberError("already_member")`.
 * - a member (accepted or not) of a *different* org → `InviteMemberError("in_other_workspace")`.
 * - a not-yet-accepted (pending) member of this org → falls through and
 *   re-sends the invite; the role/membership upsert below only ever writes
 *   the role passed in this call and never touches `accepted_at` once it's
 *   null (it's already null, so it stays null).
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

  // Look up whether this email already has a `users` row (i.e. an existing
  // auth account) before sending anything, so cross-workspace and
  // already-a-member cases can be rejected up front rather than only
  // discovered via the upsert below.
  const { data: existingUser } = await svc
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    const { data: existingMemberships } = await svc
      .from("memberships")
      .select("organization_id, accepted_at")
      .eq("user_id", existingUser.id);

    const membershipHere = existingMemberships?.find((m) => m.organization_id === orgId);
    if (membershipHere) {
      if (membershipHere.accepted_at) {
        throw new InviteMemberError("already_member", "Already a member of this workspace.");
      }
      // Pending invite to this same org — fall through and re-send below.
    } else {
      const membershipElsewhere = existingMemberships?.find((m) => m.organization_id !== orgId);
      if (membershipElsewhere) {
        throw new InviteMemberError(
          "in_other_workspace",
          "That email already belongs to another postaud.io workspace.",
        );
      }
    }
  }

  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/welcome`,
  });

  let userId: string;
  if (error || !data?.user) {
    // inviteUserByEmail errors (422) if this email already has an auth
    // account — e.g. re-inviting a pending member. Fall back to the
    // existing `users` row (mirrors auth.users 1:1) rather than failing.
    if (!existingUser) {
      throw new Error(error?.message ?? "Could not send invite");
    }
    userId = existingUser.id;
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
