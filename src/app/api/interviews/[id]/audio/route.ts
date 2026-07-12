import { NextResponse } from "next/server";
import { authorizeInterview, InterviewAuthError } from "@/server/interviews/authorize";

type Params = Promise<{ id: string }>;

const AUDIO_BUCKET = "interview-audio";
const MAX_BYTES = 50 * 1024 * 1024; // ~50MB cap

/**
 * POST /api/interviews/[id]/audio — receives the raw `audio/webm` session
 * recording as the request body and stores it (service-role only bucket) at
 * `interview-audio/${orgId}/${interviewId}.webm`, then records `audio_path` on
 * the interview.
 *
 * Not gated on `in_progress`: the client uploads audio during its teardown,
 * and a retried end-flow may re-upload after the row has already flipped to
 * `completed` — `upsert:true` makes the re-upload harmless.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  let authed;
  try {
    authed = await authorizeInterview(id);
  } catch (err) {
    if (err instanceof InterviewAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const path = `${authed.organizationId}/${id}.webm`;

  const { error: uploadErr } = await authed.svc.storage.from(AUDIO_BUCKET).upload(path, buf, {
    contentType: "audio/webm",
    upsert: true,
  });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: updateErr } = await authed.svc
    .from("interviews")
    .update({ audio_path: path })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, audioPath: path });
}
