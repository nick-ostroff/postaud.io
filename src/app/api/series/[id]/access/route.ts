import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";

const accessRowSchema = z.object({
  userId: z.string().uuid(),
  level: z.enum(["none", "view", "interview"]),
});

const putAccessSchema = z.object({
  rows: z.array(accessRowSchema),
});

type Params = Promise<{ id: string }>;

// PUT /api/series/[id]/access — org-admin-only (RLS's "access admin" policy
// on series_access would also reject a non-admin's write, but the role check
// here returns a clean 403 before touching the DB). Upserts/deletes rows:
// "view" -> can_view only, "interview" -> can_view + can_interview, "none"
// -> delete the row entirely (no row = no access, per can_view_series RLS).
//
// The subject (series.subject_user_id) is always filtered out server-side —
// they have implicit full view+interview access via can_view_series /
// can_interview_series regardless of any series_access row, so a client
// trying to write one for them is a no-op rather than an error.
export async function PUT(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = putAccessSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, subject_user_id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (seriesErr) {
    return NextResponse.json({ error: seriesErr.message }, { status: 500 });
  }
  if (!series) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = parsed.data.rows.filter((r) => r.userId !== series.subject_user_id);

  const upserts = rows
    .filter((r) => r.level !== "none")
    .map((r) => ({
      series_id: id,
      user_id: r.userId,
      can_view: true,
      can_interview: r.level === "interview",
    }));
  const deleteUserIds = rows.filter((r) => r.level === "none").map((r) => r.userId);

  if (upserts.length > 0) {
    const { error } = await supabase.from("series_access").upsert(upserts, { onConflict: "series_id,user_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (deleteUserIds.length > 0) {
    const { error } = await supabase
      .from("series_access")
      .delete()
      .eq("series_id", id)
      .in("user_id", deleteUserIds);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
