import { NextResponse } from "next/server";
import { listPendingVaultLinks } from "@/db/queries/vault";
import { resolveApiToken } from "@/server/auth/bearer";

/**
 * GET /api/vault/pending — the plugin polls this to learn which of the
 * caller's linked series have a push waiting to be collected.
 * `listPendingVaultLinks` (Task 8) already applies RLS (only the caller's
 * own links) and the `isPushPending` filter — this route only shapes the
 * result for the plugin.
 *
 * Titles are a second query rather than a join because `series_vault_links`
 * deliberately stores no series metadata beyond the id (migration 0018);
 * titles live on `series` and are fetched through the same RLS-scoped
 * client, so a series the RLS would otherwise hide can't leak a title
 * either. Skipped entirely when nothing is pending — the common "nothing to
 * do" poll stays a single query.
 */
export async function GET(request: Request) {
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await listPendingVaultLinks(caller.supabase);
  if (links.length === 0) return NextResponse.json({ pending: [] });

  const { data: rows } = await caller.supabase
    .from("series")
    .select("id, title")
    .in(
      "id",
      links.map((l) => l.series_id),
    );
  const titleById = new Map((rows ?? []).map((r) => [r.id, r.title] as const));

  return NextResponse.json({
    pending: links.map((l) => ({
      seriesId: l.series_id,
      title: titleById.get(l.series_id) ?? "Untitled series",
      requestedAt: l.push_requested_at as string,
    })),
  });
}
