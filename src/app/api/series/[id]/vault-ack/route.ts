import { NextResponse } from "next/server";
import { resolveApiToken } from "@/server/auth/bearer";

type Params = Promise<{ id: string }>;

/**
 * POST /api/series/[id]/vault-ack — the plugin calls this right after it
 * finishes writing a series' files to the vault, to collect the pending
 * push. Bearer-only, same convention as vault-link.
 *
 * `last_acked_at` is stamped to the `requestedAt` the plugin fetched from
 * `/api/vault/pending` (and must echo back in the request body) — NOT to
 * "now". Stamping "now" is wrong: it is >= any `push_requested_at` that
 * existed when the plugin started its fetch, which means a Send pressed
 * in the gap between the plugin's fetch and this ack gets silently
 * swallowed —
 *   T0 plugin polls, sees requestedAt=T-1
 *   T1 plugin fetches content
 *   T2 user presses Send (push_requested_at=T2)
 *   T3 plugin acks with now() > T2 -> T2's change is dropped, never synced.
 * Echoing back the T-1 the plugin actually observed fixes this: the ack at
 * T3 stamps `last_acked_at = T-1`, so `isPushPending` (push_requested_at=T2
 * > last_acked_at=T-1) still reports the series pending, and the next poll
 * picks up T2's change. See `isPushPending` in src/db/queries/vault.ts for
 * the comparison this relies on.
 *
 * The plugin doesn't exist yet, so this contract is free to define now;
 * once it ships, changing it becomes a breaking change.
 *
 * `user_id` is filtered explicitly as defence in depth alongside RLS (see
 * IMPORTANT 4 in the final review) — RLS already scopes
 * `series_vault_links` rows to `user_id = auth.uid()`, and there's nothing
 * to insert here, so an ack for a row the caller doesn't own just matches
 * zero rows either way.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { requestedAt?: unknown } | null;
  const acked = typeof body?.requestedAt === "string" ? new Date(body.requestedAt) : null;
  if (!acked || Number.isNaN(acked.getTime())) {
    return NextResponse.json({ error: "requested_at_required" }, { status: 400 });
  }

  // `requestedAt` is untrusted client input (echoed back by the plugin) and
  // `last_acked_at` can never legitimately exceed "now" — reject a future
  // value outright rather than clamping it to now(). Clamping would
  // reintroduce exactly the mid-sync-Send-swallowing bug described above: a
  // clamped ack still stamps a value >= every push_requested_at that existed
  // when the plugin started, so a Send in the fetch-to-ack gap would again
  // read as already collected. A single far-future `requestedAt` (malicious
  // or just a fast plugin-machine clock) would otherwise permanently wedge
  // `isPushPending` to false for that series — silent and irrecoverable.
  if (acked.getTime() > Date.now()) {
    return NextResponse.json({ error: "requested_at_in_future" }, { status: 400 });
  }

  const { error } = await caller.supabase
    .from("series_vault_links")
    .update({ last_acked_at: acked.toISOString() })
    .eq("series_id", id)
    .eq("user_id", caller.userId);
  if (error) return NextResponse.json({ error: "ack_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
