import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

// PATCH /api/series/reorder — persist a drag-reordered series grid.
// Body is the full visible list in display order; each series gets
// sort_order = its index. Admin-only (the "series admin" RLS policy would
// silently no-op for others, so we 403 explicitly instead).
export async function PATCH(request: Request) {
  const { supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.ids.map((id, index) =>
      supabase.from("series").update({ sort_order: index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
