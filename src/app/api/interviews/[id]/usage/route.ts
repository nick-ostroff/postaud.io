import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInterview, InterviewAuthError } from "@/server/interviews/authorize";
import type { Json, TablesInsert } from "@/db/types";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({
  provider: z.literal("openai_realtime"),
  phase: z.literal("interview"),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  audioInputTokens: z.number().int().nonnegative().optional(),
  textInputTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  audioOutputTokens: z.number().int().nonnegative().optional(),
  textOutputTokens: z.number().int().nonnegative().optional(),
  raw: z.record(z.string(), z.unknown()),
});

/**
 * POST /api/interviews/[id]/usage — records the client's accumulated OpenAI
 * Realtime `response.done` usage for this session (Task "usage-1" step 1).
 * Every number here must be the verbatim value the client summed from real
 * `event.response.usage` payloads — this route stores it as-is, it never
 * estimates or derives a token count itself.
 *
 * Not gated on `in_progress`, same reasoning as the messages/audio routes:
 * the client posts this during end-of-session teardown, which can race (or
 * land just after) `/complete`.
 *
 * `interview_usage` is otherwise an append-only ledger for the Anthropic
 * pipeline's rows (migration 0009 — every processing attempt appends, never
 * replaces, so failed-attempt spend and reprocess spend both stay visible).
 * Realtime is different: one conversation only ever has one true realtime
 * usage fact, so a retried POST here should replace, not append. Since the
 * DB-level unique constraint that used to enforce that is gone, this route
 * enforces it itself, scoped to *just* this interview's `openai_realtime`
 * rows: delete any existing row(s) for
 * (interview_id, provider='openai_realtime'), then insert the fresh one.
 * This never touches — and never risks deleting — the anthropic ledger rows
 * for the same interview.
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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed.data;

  const row: TablesInsert<"interview_usage"> = {
    interview_id: id,
    organization_id: authed.organizationId,
    provider: body.provider,
    phase: body.phase,
    model: body.model,
    input_tokens: body.inputTokens,
    output_tokens: body.outputTokens,
    total_tokens: body.totalTokens,
    audio_input_tokens: body.audioInputTokens ?? null,
    text_input_tokens: body.textInputTokens ?? null,
    cached_input_tokens: body.cachedInputTokens ?? null,
    audio_output_tokens: body.audioOutputTokens ?? null,
    text_output_tokens: body.textOutputTokens ?? null,
    raw: body.raw as Json,
  };

  // Scoped to this authorized interview + provider only — never touches the
  // anthropic ledger rows for the same interview_id.
  const { error: deleteError } = await authed.svc
    .from("interview_usage")
    .delete()
    .eq("interview_id", id)
    .eq("organization_id", authed.organizationId)
    .eq("provider", "openai_realtime");
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await authed.svc.from("interview_usage").insert(row);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
