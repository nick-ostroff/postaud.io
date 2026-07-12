import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInterview, InterviewAuthError } from "@/server/interviews/authorize";
import type { TablesInsert } from "@/db/types";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["interviewer", "subject"]),
        text: z.string().min(1),
        tOffsetSec: z.number().nonnegative(),
        seq: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * POST /api/interviews/[id]/messages — appends a batch of live-transcript turns.
 *
 * `interview_messages` is insert-only (transcripts are immutable) with a unique
 * `(interview_id, seq)` index. The client flushes at-least-once (a failed flush
 * retries with the same seqs), so we upsert with `ignoreDuplicates` on that
 * index — any turn already stored is silently skipped rather than erroring.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  let authed;
  try {
    // Deliberately NOT gated on in_progress: the client's final flush can lose
    // a race with (or fail before) /complete, and those closing turns must
    // still be persistable afterward. Appends stay conductor-only and the
    // unique (interview_id, seq) index keeps retries idempotent — transcripts
    // remain immutable (no update/delete), which is the actual invariant.
    authed = await authorizeInterview(id);
  } catch (err) {
    if (err instanceof InterviewAuthError) return NextResponse.json(err.body, { status: err.status });
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const rows: TablesInsert<"interview_messages">[] = parsed.data.messages.map((m) => ({
    interview_id: id,
    role: m.role,
    text: m.text,
    t_offset_sec: m.tOffsetSec,
    seq: m.seq,
  }));

  const { error } = await authed.svc
    .from("interview_messages")
    .upsert(rows, { onConflict: "interview_id,seq", ignoreDuplicates: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
