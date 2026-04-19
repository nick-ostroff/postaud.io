import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse, hangupWithMessage } from "@/server/telephony/twiml";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

/**
 * POST /api/webhooks/twilio/voice/answer-done?session=<id>&q=<idx>
 *
 * Fires when the <Record> for question <idx> ends (user pressed *, #, or went
 * silent past the timeout). We:
 *   1. persist the recording URL + sid onto the interview_session (per-question)
 *   2. advance the cursor — if there's another question, read it and Record;
 *      otherwise thank the recipient and hang up.
 */
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();

  const ok = await verifyTwilioSignature(req, form);
  if (!ok) return hangupWithMessage("Unauthorized.");

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session") ?? "";
  const q = Number(url.searchParams.get("q") ?? "0");
  const recordingSid = (form.get("RecordingSid") as string | null) ?? null;
  const recordingUrl = (form.get("RecordingUrl") as string | null) ?? null;

  const svc = serviceClient();

  // Fetch the session's template_snapshot so we know the questions in order.
  const { data: session } = await svc
    .from("interview_sessions")
    .select("id, request_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return hangupWithMessage("Lost the session. Goodbye.");

  const { data: request } = await svc
    .from("interview_requests")
    .select("template_snapshot")
    .eq("id", session.request_id)
    .maybeSingle();

  const snapshot = request?.template_snapshot as
    | { questions: { id: string; prompt: string; max_seconds?: number | null }[] }
    | null;
  const questions = snapshot?.questions ?? [];
  const currentQuestion = questions[q];

  // Persist this answer's recording into call_events so we can retrieve later.
  if (currentQuestion && recordingSid) {
    await svc.from("call_events").insert({
      session_id: sessionId,
      event_type: "answer_recorded",
      question_id: currentQuestion.id,
      payload: {
        q_index: q,
        recording_sid: recordingSid,
        recording_url: recordingUrl ? `${recordingUrl}.mp3` : null,
      },
    });
  }

  const nextIndex = q + 1;
  const nextQuestion = questions[nextIndex];

  if (!nextQuestion) {
    return twimlResponse(`
      <Say voice="Polly.Joanna-Neural">That's everything. Thanks for taking the time. Goodbye.</Say>
      <Hangup/>
    `);
  }

  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const actionUrl = `${base}/api/webhooks/twilio/voice/answer-done?session=${sessionId}&amp;q=${nextIndex}`;
  const maxSec = nextQuestion.max_seconds ?? 90;

  return twimlResponse(`
    <Say voice="Polly.Joanna-Neural">Next question. ${escapeXml(nextQuestion.prompt)}</Say>
    <Say voice="Polly.Joanna-Neural">Go ahead. Press star or pound when you're done.</Say>
    <Record
      action="${actionUrl}"
      method="POST"
      maxLength="${maxSec}"
      playBeep="true"
      finishOnKey="*#"
      timeout="3"
    />
    <Say voice="Polly.Joanna-Neural">Thanks — I have your answer.</Say>
    <Hangup/>
  `);
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
