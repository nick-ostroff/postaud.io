import { NextResponse } from "next/server";

// POST /api/jobs/run — internal, HMAC-protected.
// Executes a single job stage. See plan/02-technical-spec.md §2.5.
export async function POST(_req: Request) {
  // TODO:
  //   1. verify HMAC via JOB_RUNNER_SECRET
  //   2. load job row, dispatch to runStage(kind, session_id, ref_id)
  //   3. persist result (success/failure + backoff)
  return NextResponse.json({ ran: false });
}
