import { NextResponse, after } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/db/service";
import { authorizeInterview, InterviewAuthError } from "@/server/interviews/authorize";
import { CompleteInterviewError, completeInterview } from "@/server/interviews/complete";
import { processInterview } from "@/server/pipeline/process-interview";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({ durationSec: z.number().nonnegative() });

/**
 * POST /api/interviews/[id]/complete — the exit path for a live session.
 * Flips the interview to `completed`, charges one credit (idempotently), kicks
 * off post-processing fire-and-forget, and returns the recap URL. Safe to call
 * more than once — a retried end-flow gets the same recap URL back without
 * double-charging.
 *
 * Not gated on `in_progress` at the route layer: `completeInterview` itself
 * distinguishes "already completed" (idempotent 200) from a genuine conflict
 * like an abandoned row (409).
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    await authorizeInterview(id);
  } catch (err) {
    if (err instanceof InterviewAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await completeInterview(serviceClient(), {
      interviewId: id,
      durationSec: parsed.data.durationSec,
    });

    // Post-response, not fire-and-forget: `after()` keeps the serverless
    // instance alive past the response, so the pipeline actually finishes
    // instead of being frozen mid-flight when the response is sent (a bare
    // `void` promise died here every time; the cron sweep remains the
    // backstop). Never blocks the user's redirect, and a pipeline error never
    // surfaces as a failed completion. Only fires on the transition that
    // actually completed the interview — a retried POST that finds it already
    // completed must not re-fire the pipeline (that's how two concurrent runs
    // would otherwise both extract facts).
    if (!result.alreadyCompleted) {
      after(async () => {
        await processInterview(id).catch((e) => {
          console.error(`[complete] processInterview failed for ${id}:`, e);
        });
      });
    }

    return NextResponse.json({ recapUrl: result.recapUrl });
  } catch (err) {
    if (err instanceof CompleteInterviewError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not complete interview." },
      { status: 500 },
    );
  }
}
