import { NextResponse } from "next/server";
import { resolveApiToken } from "@/server/auth/bearer";

type Params = Promise<{ id: string }>;

/**
 * POST /api/series/[id]/vault-ack — the plugin calls this right after it
 * finishes writing a series' files to the vault, to collect the pending
 * push. Bearer-only, same convention as vault-link.
 *
 * `last_acked_at` is stamped to "now" rather than echoing back whatever
 * `push_requested_at` the plugin last read: if the user pressed "Send
 * update" again in the gap between the plugin's fetch and this ack, that
 * new request must still read as pending afterward. "Now" is guaranteed to
 * be >= any `push_requested_at` the plugin could have observed when it
 * started the write, so this can't accidentally swallow a request that
 * arrived mid-flight. See `isPushPending` in src/db/queries/vault.ts for
 * the comparison this guarantees.
 *
 * No explicit visibility check is needed here (contrast with vault-link's
 * POST, which inserts): RLS already scopes `series_vault_links` rows to
 * `user_id = auth.uid()`, and there's nothing to insert — an ack for a row
 * the caller doesn't own just matches zero rows.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await caller.supabase
    .from("series_vault_links")
    .update({ last_acked_at: new Date().toISOString() })
    .eq("series_id", id);
  if (error) return NextResponse.json({ error: "ack_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
