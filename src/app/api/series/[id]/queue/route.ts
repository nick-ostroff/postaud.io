import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";

type Params = Promise<{ id: string }>;

const postSchema = z.object({ text: z.string().trim().min(1).max(500) });

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("pin"), id: z.string().uuid() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
  z.object({
    action: z.literal("markAsked"),
    ids: z.array(z.string().uuid()).min(1),
    interviewId: z.string().uuid(),
  }),
]);

/** Resolve the series through the viewer's org and check interview access. */
async function loadSeriesAccess(id: string) {
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  const { data: series, error } = await supabase
    .from("series")
    .select("id, subject_user_id, organization_id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const;
  if (!series) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  return { user, supabase, role, series, canInterview } as const;
}

// POST /api/series/[id]/queue — member adds a question. Interview access required.
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const ctx = await loadSeriesAccess(id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Append at the end of the pending queue.
  const svc = serviceClient();
  const { data: last } = await svc
    .from("queued_questions")
    .select("position")
    .eq("series_id", id)
    .eq("status", "pending")
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await svc
    .from("queued_questions")
    .insert({ series_id: id, text: parsed.data.text, source: "member", created_by: ctx.user.id, position })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/series/[id]/queue — manage the queue. reorder/pin/remove are
// admin-only (mirrors PATCH /api/series/[id]); markAsked needs interview
// access because it's called from a live quickfire session.
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const ctx = await loadSeriesAccess(id);
  if ("error" in ctx) return ctx.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  const svc = serviceClient();

  if (body.action === "markAsked") {
    if (!ctx.canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Verify the interview actually belongs to this series before stamping
    // it as the asked-in interview — a client-supplied id from another
    // series must not be trusted.
    const { data: interview, error: ivErr } = await svc
      .from("interviews")
      .select("id")
      .eq("id", body.interviewId)
      .eq("series_id", id)
      .maybeSingle();
    if (ivErr) return NextResponse.json({ error: ivErr.message }, { status: 500 });
    if (!interview) return NextResponse.json({ error: "invalid_interview" }, { status: 400 });

    const { error } = await svc
      .from("queued_questions")
      .update({ status: "asked", asked_in_interview_id: body.interviewId, updated_at: new Date().toISOString() })
      .eq("series_id", id)
      .eq("status", "pending")
      .in("id", body.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (body.action === "reorder") {
    // ids is the desired pending order; write positions 0..n-1 in one
    // atomic upsert rather than a per-row loop, so a mid-write failure can't
    // leave the queue half-reordered.
    const { data: pending, error: listErr } = await svc
      .from("queued_questions")
      .select("*")
      .eq("series_id", id)
      .eq("status", "pending");
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const byId = new Map((pending ?? []).map((r) => [r.id, r] as const));
    // Ignore ids that aren't actually pending in this series — this also
    // guarantees the upsert below can never insert a new row.
    const orderedIds = body.ids.filter((qid) => byId.has(qid));
    const rows = orderedIds.map((qid, i) => ({
      ...byId.get(qid)!,
      position: i,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      const { error } = await svc.from("queued_questions").upsert(rows, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pin") {
    // Pin = re-write positions from the freshly-read pending order with the
    // pinned id first, in one atomic upsert.
    const { data: pending, error: listErr } = await svc
      .from("queued_questions")
      .select("*")
      .eq("series_id", id)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const byId = new Map((pending ?? []).map((r) => [r.id, r] as const));
    const orderedIds = [body.id, ...(pending ?? []).map((r) => r.id).filter((x) => x !== body.id)].filter((qid) =>
      byId.has(qid),
    );
    const rows = orderedIds.map((qid, i) => ({
      ...byId.get(qid)!,
      position: i,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      const { error } = await svc.from("queued_questions").upsert(rows, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // remove — body is narrowed to the remove variant here.
  const { error } = await svc
    .from("queued_questions")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("series_id", id)
    .eq("id", body.id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
