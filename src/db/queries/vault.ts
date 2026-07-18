import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

export type VaultLink = {
  series_id: string;
  user_id: string;
  label: string;
  linked_at: string;
  push_requested_at: string | null;
  last_acked_at: string | null;
};

/**
 * A push is waiting whenever the user's Send is newer than the plugin's last
 * ack. An ack at exactly the request time counts as collected — the plugin
 * stamps its ack after a successful write, so equality means "that write
 * covered this request."
 */
export function isPushPending(link: Pick<VaultLink, "push_requested_at" | "last_acked_at">): boolean {
  if (!link.push_requested_at) return false;
  if (!link.last_acked_at) return true;
  return new Date(link.push_requested_at).getTime() > new Date(link.last_acked_at).getTime();
}

/**
 * `userId` is redundant with RLS (`user_id = auth.uid()`) by design — see
 * IMPORTANT 4 in the final review: the RLS-under-minted-JWT path has never
 * executed against the real database, so this filter is a second,
 * independent point of failure rather than the only one.
 */
export async function getVaultLink(
  sb: SupabaseClient<Database>,
  seriesId: string,
  userId: string,
): Promise<VaultLink | null> {
  const { data, error } = await sb
    .from("series_vault_links")
    .select("*")
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VaultLink | null) ?? null;
}

/**
 * Every link belonging to the caller that has an uncollected push. `userId`
 * is redundant with RLS by design (see `getVaultLink`'s comment) — the bare
 * `select("*")` here previously relied on RLS ALONE for tenant isolation.
 * Ordered by `push_requested_at` for deterministic plugin processing (oldest
 * request first); NULLs (never requested) can't reach this list since
 * `isPushPending` already filters them out.
 */
export async function listPendingVaultLinks(sb: SupabaseClient<Database>, userId: string): Promise<VaultLink[]> {
  const { data, error } = await sb
    .from("series_vault_links")
    .select("*")
    .eq("user_id", userId)
    .order("push_requested_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as VaultLink[] | null) ?? []).filter(isPushPending);
}
