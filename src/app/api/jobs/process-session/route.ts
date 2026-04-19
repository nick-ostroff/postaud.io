import { NextResponse } from "next/server";
import { processSession } from "@/server/ai/process-session";

/**
 * POST /api/jobs/process-session  { "session_id": "uuid" }
 *
 * Runs the post-call AI pipeline for a session: per-question transcribe →
 * extract → whole-interview summarize → render output → flag the request
 * completed. Called fire-and-forget from /voice/answer-done when the last
 * question finishes recording, and can be invoked manually to re-run.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.session_id === "string" ? body.session_id : null;
  if (!sessionId) {
    return NextResponse.json({ error: { code: "missing_session_id" } }, { status: 400 });
  }

  const result = await processSession(sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: { code: result.error } }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
