import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInterview, InterviewAuthError } from "@/server/interviews/authorize";
import { processInterview } from "@/server/pipeline/process-interview";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({ force: z.boolean().optional() });

/**
 * POST /api/interviews/[id]/reprocess — manual re-run of the post-interview
 * knowledge pipeline (Task 13). Same access guard as the other interview
 * sub-routes: admin, the series' subject, or explicit `can_interview` access
 * (`authorizeInterview`).
 *
 * An already-`processed` interview 409s by default — re-running it risks
 * duplicating facts. `{force: true}` overrides that: Task 13's merge/dedupe
 * step collapses most re-extracted facts into skip_duplicate/supersede
 * instead of raw duplicates, but forcing is still an explicit opt-in.
 *
 * A `completed` row that hasn't reached `processed` yet (the normal
 * "retry a failed run" case — `process_error` set, or a crash-orphaned row
 * the tick would otherwise pick up) always reprocesses without needing
 * `force`. `in_progress` / `abandoned` interviews aren't reprocessable at all
 * (no finished transcript to extract from) — 409.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  let svc: Awaited<ReturnType<typeof authorizeInterview>>["svc"];
  let interview: Awaited<ReturnType<typeof authorizeInterview>>["interview"];
  try {
    ({ svc, interview } = await authorizeInterview(id));
  } catch (err) {
    if (err instanceof InterviewAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  const force = parsed.success ? (parsed.data.force ?? false) : false;

  if (interview.status === "processed" && !force) {
    return NextResponse.json({ error: "already_processed" }, { status: 409 });
  }
  if (interview.status === "in_progress" || interview.status === "abandoned") {
    return NextResponse.json({ error: "not_completed" }, { status: 409 });
  }

  // Reset process_error before re-running. A forced re-run of an already-
  // `processed` interview also needs its status flipped back to `completed`
  // — otherwise processInterview's own idempotency guard treats it as a
  // no-op (see runPipeline's `status === "processed"` short-circuit).
  const { error: resetErr } = await svc
    .from("interviews")
    .update({
      process_error: null,
      ...(interview.status === "processed" ? { status: "completed" } : {}),
    })
    .eq("id", id);
  if (resetErr) {
    return NextResponse.json({ error: resetErr.message }, { status: 500 });
  }

  // processInterview records process_error + rethrows on a hard failure, and
  // swallows its own soft "no_facts" fail. Either way, the authoritative
  // outcome afterward is whatever landed in process_error — read it back
  // instead of branching on the throw.
  try {
    await processInterview(id);
  } catch {
    // recorded already; fall through to read it back below.
  }

  const { data: after, error: afterErr } = await svc
    .from("interviews")
    .select("process_error")
    .eq("id", id)
    .maybeSingle();
  if (afterErr) {
    return NextResponse.json({ error: afterErr.message }, { status: 500 });
  }
  if (after?.process_error) {
    return NextResponse.json({ ok: false, error: after.process_error });
  }
  return NextResponse.json({ ok: true });
}
