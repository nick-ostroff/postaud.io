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

export async function getVaultLink(
  sb: SupabaseClient<Database>,
  seriesId: string,
): Promise<VaultLink | null> {
  const { data, error } = await sb
    .from("series_vault_links")
    .select("*")
    .eq("series_id", seriesId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VaultLink | null) ?? null;
}

/** Every link belonging to the caller that has an uncollected push. */
export async function listPendingVaultLinks(sb: SupabaseClient<Database>): Promise<VaultLink[]> {
  const { data, error } = await sb.from("series_vault_links").select("*");
  if (error) throw new Error(error.message);
  return ((data as VaultLink[] | null) ?? []).filter(isPushPending);
}
