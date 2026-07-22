import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

// POST /api/interviews/[id]/queue — Flow's "+" button: save a proposed
// follow-up for later, stamped with the session it came from.
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const svc = serviceClient();
  const { data: interview, error: ivErr } = await svc
    .from("interviews")
    .select("id, series_id, status, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (ivErr) return NextResponse.json({ error: ivErr.message }, { status: 500 });
  if (!interview || interview.organization_id !== organization.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (interview.status !== "in_progress") {
    return NextResponse.json({ error: "not_in_progress" }, { status: 409 });
  }

  const { data: series } = await svc
    .from("series")
    .select("id, subject_user_id")
    .eq("id", interview.series_id)
    .maybeSingle();
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data: last } = await svc
    .from("queued_questions")
    .select("position")
    .eq("series_id", series.id)
    .eq("status", "pending")
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await svc
    .from("queued_questions")
    .insert({
      series_id: series.id,
      text: parsed.data.text,
      source: "flow",
      created_by: user.id,
      source_interview_id: id,
      position,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await svc
    .from("queued_questions")
    .select("id", { count: "exact", head: true })
    .eq("series_id", series.id)
    .eq("status", "pending");

  return NextResponse.json({ id: data.id, pendingCount: count ?? 0 });
}
