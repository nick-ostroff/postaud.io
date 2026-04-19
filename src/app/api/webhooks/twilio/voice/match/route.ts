import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse, hangupWithMessage } from "@/server/telephony/twiml";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

// POST /api/webhooks/twilio/voice/match
// Resolves the DTMF code → interview_request, creates (or resumes) an
// interview_sessions row, and hands the call off to our ConversationRelay
// WebSocket (see src/server/voice/fsm-runner.ts).
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
  const publicBase = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  // HTTPS public base → wss:// relay URL. CloudFlare tunnel and Vercel both
  // upgrade WS requests on the same hostname/port as HTTP.
  const relayUrl = publicBase.replace(/^https?:\/\//, "wss://") + `/api/voice/relay?session=${sessionId}`;

  const voiceId = env().ELEVENLABS_VOICE_ID;
  // ElevenLabs TTS: the API key is configured in Twilio Console (Voice → TTS
  // Providers → ElevenLabs). Twilio looks it up by provider name.
  const tts = voiceId
    ? `ttsProvider="ElevenLabs" voice="${voiceId}"`
    : `ttsProvider="Amazon" voice="Polly.Ruth-Generative"`;

  return twimlResponse(`
    <Connect>
      <ConversationRelay
        url="${relayUrl}"
        ${tts}
        dtmfDetection="true"
        interruptible="true"
      />
    </Connect>
  `);
}
