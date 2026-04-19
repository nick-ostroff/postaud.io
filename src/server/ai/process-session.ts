import { serviceClient } from "@/db/service";
import { transcribeRecording } from "./transcribe";
import { extractAnswer } from "./extract";
import { summarizeInterview } from "./summarize";
import { renderOutput } from "./render";

type SnapshotQuestion = {
  id: string;
  position: number;
  prompt: string;
  hint?: string | null;
  max_seconds?: number | null;
};

type Snapshot = {
  name: string;
  output_type:
    | "transcript.plain"
    | "summary.concise"
    | "qa.structured"
    | "blog.draft"
    | "crm.note"
    | "webhook.json";
  questions: SnapshotQuestion[];
};

/**
 * End-to-end post-call pipeline. Idempotent — safe to re-run on the same
 * session (it will re-transcribe + re-extract + re-render, overwriting prior
 * rows). For MVP we run inline; future iteration puts each stage on jobs.
 */
export async function processSession(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = serviceClient();

  const { data: session } = await svc
    .from("interview_sessions")
    .select("id, request_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "session_not_found" };

  const { data: request } = await svc
    .from("interview_requests")
    .select("id, template_snapshot, contact_id, organization_id")
    .eq("id", session.request_id)
    .maybeSingle();
  if (!request) return { ok: false, error: "request_not_found" };

  const snapshot = request.template_snapshot as Snapshot;
  const questions = snapshot.questions ?? [];

  const { data: contact } = await svc
    .from("contacts")
    .select("first_name, last_name")
    .eq("id", request.contact_id)
    .maybeSingle();
  const recipientName =
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Recipient";

  // Load per-question recordings we captured via call_events.
  const { data: events } = await svc
    .from("call_events")
    .select("event_type, question_id, payload")
    .eq("session_id", sessionId)
    .eq("event_type", "answer_recorded")
    .order("at", { ascending: true });

  const byQuestionId = new Map<string, { url: string | null; sid: string | null }>();
  for (const e of events ?? []) {
    const p = (e.payload ?? {}) as { recording_url?: string; recording_sid?: string };
    if (e.question_id) {
      byQuestionId.set(e.question_id, {
        url: p.recording_url ?? null,
        sid: p.recording_sid ?? null,
      });
    }
  }

  // Stage 1: transcribe + extract per question.
  const answers: { prompt: string; answer: string; raw: string; questionId: string; confidence: number }[] = [];

  for (const q of questions) {
    const rec = byQuestionId.get(q.id);
    let rawTranscript = "";
    if (rec?.url) {
      try {
        rawTranscript = await transcribeRecording(rec.url);
      } catch (err) {
        console.error("[pipeline] transcribe failed for question", q.id, err);
      }
    }

    const cleaned = rawTranscript
      ? await extractAnswer({
          questionPrompt: q.prompt,
          questionHint: q.hint ?? undefined,
          rawTranscript,
        }).catch(() => ({ answer_text: rawTranscript, confidence: 0 }))
      : { answer_text: "", confidence: 0 };

    answers.push({
      prompt: q.prompt,
      answer: cleaned.answer_text,
      raw: rawTranscript,
      questionId: q.id,
      confidence: cleaned.confidence,
    });

    await svc.from("extracted_answers").upsert(
      {
        session_id: sessionId,
        question_id: q.id,
        question_prompt: q.prompt,
        answer_text: cleaned.answer_text,
        confidence: cleaned.confidence,
      },
      { onConflict: "session_id,question_id" },
    );
  }

  // Store a combined cleaned transcript on transcripts for easy UI access.
  const combined = answers
    .map((a, i) => `Q${i + 1}: ${a.prompt}\nA${i + 1}: ${a.answer || "(no answer)"}`)
    .join("\n\n");
  const rawCombined = answers
    .map((a, i) => `Q${i + 1}: ${a.prompt}\n${a.raw || "(no speech)"}`)
    .join("\n\n");
  await svc.from("transcripts").upsert(
    {
      session_id: sessionId,
      raw: { by_question: answers.map((a) => ({ question_id: a.questionId, text: a.raw })) },
      cleaned_text: combined,
      model: "whisper-1 + gpt-4o-mini",
      prompt_version: "extract@v1",
      completed_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );

  // Stage 2: summarize.
  let summary = { short: "", long: "", bullets: [] as string[] };
  try {
    summary = await summarizeInterview({
      templateName: snapshot.name,
      answers: answers.map((a) => ({ prompt: a.prompt, answer: a.answer })),
    });
  } catch (err) {
    console.error("[pipeline] summarize failed", err);
  }

  await svc.from("summaries").upsert(
    {
      session_id: sessionId,
      short: summary.short,
      long: summary.long,
      bullets: summary.bullets,
      model: "claude-sonnet-4-6",
      prompt_version: "summarize@v1",
    },
    { onConflict: "session_id" },
  );

  // Stage 3: render output.
  const outputType = snapshot.output_type;
  const { data: existingJob } = await svc
    .from("output_jobs")
    .select("id")
    .eq("session_id", sessionId)
    .eq("output_type", outputType)
    .maybeSingle();

  const renderedText = await renderOutput({
    outputType,
    templateName: snapshot.name,
    recipientName,
    answers: answers.map((a) => ({ prompt: a.prompt, answer: a.answer })),
    summary,
  }).catch((err) => {
    console.error("[pipeline] render failed", err);
    return "";
  });

  if (existingJob) {
    await svc
      .from("output_jobs")
      .update({
        status: renderedText ? "succeeded" : "failed",
        rendered_text: renderedText || null,
        error: renderedText ? null : "render returned empty",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJob.id);
  } else {
    await svc.from("output_jobs").insert({
      session_id: sessionId,
      output_type: outputType,
      status: renderedText ? "succeeded" : "failed",
      rendered_text: renderedText || null,
      error: renderedText ? null : "render returned empty",
    });
  }

  // Stage 4: flag the request as completed.
  await svc
    .from("interview_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", session.request_id);

  return { ok: true };
}
