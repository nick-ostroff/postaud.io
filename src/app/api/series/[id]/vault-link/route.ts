import { NextResponse } from "next/server";
import { getSeries } from "@/db/queries";
import { resolveApiToken } from "@/server/auth/bearer";

type Params = Promise<{ id: string }>;

/**
 * POST /api/series/[id]/vault-link — the Obsidian plugin declares that a
 * series is now mirrored into a vault folder, identified to the server only
 * by an opaque `label` (the local filesystem path never leaves the plugin —
 * see migration 0018's comment). Bearer-only, no cookie fallback: same
 * convention as the discovery route (Task 7) — this is plugin/API-facing
 * only.
 *
 * The upsert is idempotent by design: re-linking (e.g. after reinstalling
 * the plugin, or a retry) must not create a second row or reset
 * `linked_at`. `onConflict: "series_id,user_id"` targets the table's
 * composite primary key, and the payload deliberately omits `linked_at` —
 * Postgres' ON CONFLICT DO UPDATE only sets the columns present in the
 * payload, so the original `linked_at` (and any `push_requested_at` /
 * `last_acked_at`) survive untouched.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "label_required" }, { status: 400 });

  // SECURITY — DO NOT REMOVE: series_vault_links' RLS policy scopes rows by
  // user_id, not by series visibility, and the series_id foreign key does
  // NOT help either — Postgres exempts FK/uniqueness checks from RLS (they
  // compare against the full underlying table, not the RLS-filtered view).
  // Without this explicit getSeries check, a caller could upsert a link for
  // any series_id UUID and use insert success/failure as an
  // existence oracle for series they cannot see. 404 (not 403) matches the
  // export route's no-existence-leak convention.
  const series = await getSeries(caller.supabase, id);
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await caller.supabase
    .from("series_vault_links")
    .upsert({ series_id: id, user_id: caller.userId, label }, { onConflict: "series_id,user_id" });
  if (error) return NextResponse.json({ error: "link_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/series/[id]/vault-link — unlink. No explicit user_id filter
 * is needed: RLS (`user_id = auth.uid()`) already scopes this to the
 * caller's own row, and deleting zero rows (already unlinked, or a
 * series_id the caller never linked) is not an error — DELETE is
 * idempotent by nature, so this doesn't need the getSeries visibility check
 * POST has: there is nothing to insert, and matching zero rows leaks
 * nothing.
 */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await caller.supabase.from("series_vault_links").delete().eq("series_id", id);
  if (error) return NextResponse.json({ error: "unlink_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
