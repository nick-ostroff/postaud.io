import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse, hangupWithMessage, VOICE } from "@/server/telephony/twiml";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

/**
 * POST /api/webhooks/twilio/voice/answer-done?session=<id>&q=<idx>
 *
 * Fires when the <Record> for question <idx> ends. Persists the recording
 * into call_events, advances to the next question, and when the final
 * answer lands, fires the AI pipeline off in the background before the
 * call ends.
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
    // Fire-and-forget: kick off the transcription + summary + render pipeline.
    // Don't await — Twilio is waiting on this TwiML to finish the call.
    const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    fetch(`${base}/api/jobs/process-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch((err) => console.error("[voice/answer-done] kickoff failed", err));

    return twimlResponse(`
      <Say voice="${VOICE}">That's everything. Thanks for taking the time. Your responses will be processed in the next minute. Goodbye.</Say>
      <Hangup/>
    `);
  }

  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const actionUrl = `${base}/api/webhooks/twilio/voice/answer-done?session=${sessionId}&amp;q=${nextIndex}`;
  const maxSec = nextQuestion.max_seconds ?? 90;

  return twimlResponse(`
    <Say voice="${VOICE}">Next question. ${escapeXml(nextQuestion.prompt)}</Say>
    <Say voice="${VOICE}">Go ahead. Press star or pound when you're done.</Say>
    <Record
      action="${actionUrl}"
      method="POST"
      maxLength="${maxSec}"
      playBeep="true"
      finishOnKey="*#"
      timeout="3"
    />
    <Say voice="${VOICE}">Thanks — I have your answer.</Say>
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
