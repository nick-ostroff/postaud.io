import { createClient } from "@/db/server";
import { platformAdminEmails } from "@/lib/env";

/**
 * Returns true iff the current authenticated user's email is in
 * PLATFORM_ADMIN_EMAILS. The env list is the single source of truth for
 * super-admin status — there is no DB column.
 *
 * Safe to call from middleware, server components, route handlers, and
 * server actions.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  return platformAdminEmails().includes(user.email.toLowerCase());
}

/**
 * Returns the caller's email if they are a platform admin, or null.
 * Convenience for audit logging where the email is the actor identifier.
 */
export async function platformAdminEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  return platformAdminEmails().includes(email) ? email : null;
}
