import { NextResponse } from "next/server";
import { authorizeFact, FactAuthError } from "@/server/facts/authorize";
import { signFactAudio } from "@/server/facts/audio-url";

type Params = Promise<{ id: string }>;

/**
 * GET /api/facts/[id]/audio-url — a 60-minute signed URL for the fact's
 * source-interview recording, seeked to its own offset (Task 15). Same
 * guards as the PATCH route (`authorizeFact`); 404s as `no_audio` when the
 * fact has no source interview, that interview never got an uploaded
 * recording, or the fact has no recorded offset.
 */
export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params;

  let authed;
  try {
    authed = await authorizeFact(id);
  } catch (err) {
    if (err instanceof FactAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const { svc, fact } = authed;

  if (!fact.source_interview_id) {
    return NextResponse.json({ error: "no_audio" }, { status: 404 });
  }

  const { data: interview, error: interviewErr } = await svc
    .from("interviews")
    .select("audio_path")
    .eq("id", fact.source_interview_id)
    .maybeSingle();
  if (interviewErr) {
    return NextResponse.json({ error: interviewErr.message }, { status: 500 });
  }

  const audio = await signFactAudio(svc, {
    audioPath: interview?.audio_path ?? null,
    audioOffsetSec: fact.audio_offset_sec,
  });
  if (!audio) {
    return NextResponse.json({ error: "no_audio" }, { status: 404 });
  }

  return NextResponse.json(audio);
}
