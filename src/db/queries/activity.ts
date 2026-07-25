import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InterviewUsage, Tables } from "@/db/types";

export type AuditLogRow = Tables<"audit_logs">;

/**
 * Whole-workspace spend ledger, newest first — including rows orphaned by a
 * session/series delete (interview_id null, context_label stamped at delete
 * time). Reads through the caller's RLS: the "usage admin read" policy from
 * migration 0027 exposes the full org ledger to admins only, so non-admins
 * just get their per-series subset.
 */
export async function listOrgUsage(sb: SupabaseClient<Database>): Promise<InterviewUsage[]> {
  const { data, error } = await sb
    .from("interview_usage")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Workspace audit trail, newest first — "org audit read" RLS scopes it to the caller's org. */
export async function listAuditLogs(
  sb: SupabaseClient<Database>,
  limit = 100,
): Promise<AuditLogRow[]> {
  const { data, error } = await sb
    .from("audit_logs")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
