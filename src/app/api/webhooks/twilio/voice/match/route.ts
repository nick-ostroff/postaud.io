import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse, hangupWithMessage, VOICE } from "@/server/telephony/twiml";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// POST /api/webhooks/twilio/voice/match
// Resolves the DTMF code → interview_request, creates (or resumes) an
// interview_sessions row, speaks the first question, and hands off to a
// chain of <Record> steps driven by /voice/answer-done. Pure HTTP/TwiML —
// runs on Vercel serverless with no WebSocket requirement.
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();

  const ok = await verifyTwilioSignature(req, form);
  if (!ok) return hangupWithMessage("Unauthorized.");

  const digits = (form.get("Digits") as string | null)?.trim() ?? "";
  const callSid = form.get("CallSid") as string | null;
  const from = (form.get("From") as string | null) ?? null;

  if (!digits || !/^\d{6}$/.test(digits)) {
    return hangupWithMessage("I couldn't read your code. Please tap the link in your text again.");
  }

  const svc = serviceClient();
  const { data: request } = await svc
    .from("interview_requests")
    .select("id, status, expires_at, template_snapshot, contact_id")
    .eq("dial_code", digits)
    .in("status", ["sent", "reminded"])
    .maybeSingle();

  if (!request) {
    return hangupWithMessage("I couldn't match your code to an interview. Goodbye.");
  }
  if (new Date(request.expires_at).getTime() < Date.now()) {
    return hangupWithMessage("This interview link has expired. Goodbye.");
  }

  const { data: contact } = await svc
    .from("contacts")
    .select("first_name")
    .eq("id", request.contact_id)
    .maybeSingle();

  const snapshot = request.template_snapshot as {
    intro_message?: string | null;
    questions: { id: string; prompt: string; max_seconds?: number | null }[];
  };
  const firstName = contact?.first_name ?? "there";
  const intro = snapshot.intro_message?.trim() || "Thanks for calling. I'll ask you a few quick questions.";
  const questions = snapshot.questions ?? [];
  const firstQuestion = questions[0];

  if (!firstQuestion) {
    return hangupWithMessage("This interview doesn't have any questions configured. Goodbye.");
  }

  const { data: session } = await svc
    .from("interview_sessions")
    .upsert(
      {
        request_id: request.id,
        twilio_call_sid: callSid ?? undefined,
        caller_phone: from,
        status: "active",
      },
      { onConflict: "twilio_call_sid" },
    )
    .select("id")
    .single();

  const sessionId = session?.id ?? "";
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  // Twilio requires `&` in the action URL to be XML-escaped (&amp;).
  const actionUrl = `${base}/api/webhooks/twilio/voice/answer-done?session=${sessionId}&amp;q=0`;
  const maxSec = firstQuestion.max_seconds ?? 90;

  return twimlResponse(`
    <Say voice="${VOICE}">Hi ${escapeXml(firstName)}. ${escapeXml(intro)} This call is being recorded so the sender can review your answers.</Say>
    <Pause length="1"/>
    <Say voice="${VOICE}">Here's the first question. ${escapeXml(firstQuestion.prompt)}</Say>
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
