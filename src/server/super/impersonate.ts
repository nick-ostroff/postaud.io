import "server-only";
import { serviceClient } from "@/db/service";

/**
 * Mints a one-time magic-link token for the target user. `generateLink` does
 * NOT send an email — it only returns the token — and it does not invalidate
 * the target's existing sessions. They stay logged in and are never notified
 * by Supabase; the audit log is the record of record.
 *
 * Returns null when the user doesn't exist or Supabase refuses.
 */
export async function mintSessionToken(
  targetUserId: string,
): Promise<{ tokenHash: string; email: string } | null> {
  const svc = serviceClient();

  const { data: user } = await svc.from("users").select("id, email").eq("id", targetUserId).maybeSingle();
  if (!user?.email) return null;

  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  const tokenHash = (data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
  if (error || !tokenHash) return null;

  return { tokenHash, email: user.email };
}

/** The org an impersonation is attributed to in the audit log. Null if the user has none. */
export async function primaryOrgId(targetUserId: string): Promise<string | null> {
  const svc = serviceClient();
  const { data } = await svc
    .from("memberships")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * Throws if the row can't be written. supabase-js `.insert()` RESOLVES with
 * `{ error }` rather than rejecting, so the old fire-and-forget `await insert()`
 * swallowed every failure and the caller happily handed over the target's
 * session — a fully working, completely UNLOGGED impersonation. The start route
 * fails closed on this throw.
 */
export async function logImpersonationStart(a: {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  organizationId: string | null;
}): Promise<void> {
  const svc = serviceClient();
  const { error } = await svc.from("audit_logs").insert({
    organization_id: a.organizationId,
    target_type: "user",
    target_id: a.targetUserId,
    action: "admin.impersonation_started",
    actor_email: a.adminEmail,
    meta: { targetEmail: a.targetEmail },
  });
  if (error) {
    throw new Error(`Failed to write impersonation_started audit row: ${error.message}`);
  }
}

/**
 * Reports failures to the caller, which deliberately does NOT fail closed: a
 * broken end-log must never block the operator from escaping the customer's
 * account. Exit logs the error and restores the session regardless.
 */
export async function logImpersonationEnd(a: {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  durationSeconds: number;
}): Promise<void> {
  const svc = serviceClient();
  const { error } = await svc.from("audit_logs").insert({
    target_type: "user",
    target_id: a.targetUserId,
    action: "admin.impersonation_ended",
    actor_email: a.adminEmail,
    meta: { targetEmail: a.targetEmail, durationSeconds: a.durationSeconds },
  });
  if (error) {
    console.error("[impersonate] failed to write impersonation_ended audit row", error);
  }
}
