"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";

/**
 * The user-initiated half of the push. Stamping `push_requested_at` is all the
 * server can do — it cannot write to the user's local vault, so the plugin
 * collects this flag the next time Obsidian is open.
 *
 * RLS scopes the update to the caller's own link row, but the explicit
 * `user_id` filter below is added anyway as defence in depth (IMPORTANT 4 in
 * the final review) — a second, independent point of failure rather than
 * relying on RLS alone.
 */
export async function requestVaultPush(seriesId: string): Promise<void> {
  const { supabase, user } = await getViewer();
  const { error } = await supabase
    .from("series_vault_links")
    .update({ push_requested_at: new Date().toISOString() })
    .eq("series_id", seriesId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/app/series/${seriesId}`);
}

/**
 * Unlinks a series from the caller's vault. The plugin-facing
 * `DELETE /api/series/[id]/vault-link` route is bearer-token-only (see its
 * doc comment — it's deliberately plugin/API-facing, not browser-session
 * facing), so the VaultCard's "Unlink" affordance goes straight at the table
 * through the viewer's own RLS-scoped client instead, the same way
 * `requestVaultPush` does. RLS (`user_id = auth.uid()`) already limits this
 * to the caller's own link row, and deleting zero rows (already unlinked) is
 * not an error. The explicit `user_id` filter below is defence in depth
 * (IMPORTANT 4 in the final review), the same reasoning as
 * `requestVaultPush` above.
 */
export async function unlinkVault(seriesId: string): Promise<void> {
  const { supabase, user } = await getViewer();
  const { error } = await supabase
    .from("series_vault_links")
    .delete()
    .eq("series_id", seriesId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/app/series/${seriesId}`);
}
