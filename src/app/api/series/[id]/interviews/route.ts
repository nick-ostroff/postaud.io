import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";
import { StartInterviewError, startInterview } from "@/server/interviews/start";

type Params = Promise<{ id: string }>;

const startSchema = z.object({ handoff: z.boolean().optional() });

// POST /api/series/[id]/interviews — starts (or resumes) an interview
// session for this series. Guarded by "can interview this series, or admin"
// (same manual check as Task 7's /api/topics/[id]/promote) then the org's
// remaining credit balance: 402 {error:"no_credits"} once it's exhausted.
// Writes go through the service client — permission is already fully
// verified by the time startInterview() touches the DB, same pattern as
// promote's serviceClient "writer".
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, subject_user_id, conversation_mode")
    .eq("id", id)
    .maybeSingle();
  if (seriesErr) {
    return NextResponse.json({ error: seriesErr.message }, { status: 500 });
  }
  if (!series) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { interviewId } = await startInterview(serviceClient(), {
      organizationId: organization.id,
      seriesId: series.id,
      conductedBy: user.id,
      handoff: parsed.data.handoff ?? false,
      creditsRemaining: organization.credits_remaining,
      // This API route has no picker UI of its own (that's the interview
      // page's job) — fall back to the series' configured default mode.
      mode: series.conversation_mode,
    });
    return NextResponse.json({ interviewId });
  } catch (err) {
    if (err instanceof StartInterviewError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start interview." },
      { status: 500 },
    );
  }
}
