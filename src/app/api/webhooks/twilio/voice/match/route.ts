import { verifyTwilioSignature } from "@/lib/twilio";
import { twimlResponse, hangupWithMessage } from "@/server/telephony/twiml";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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

  const { data: contact } = await svc
    .from("contacts")
    .select("first_name")
    .eq("id", request.contact_id)
    .maybeSingle();

  const snapshot = request.template_snapshot as { intro_message?: string | null };
  const firstName = contact?.first_name ?? "there";
  const intro = snapshot.intro_message?.trim() ?? "";
  const greeting = [
    `Hi ${firstName}.`,
    intro || "Thanks for calling. I'll ask you a few quick questions.",
    "This call is being recorded so the sender can review your answers.",
  ].join(" ");

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
  const relayUrl = publicBase.replace(/^https?:\/\//, "wss://") + `/api/voice/relay?session=${sessionId}`;

  // welcomeGreeting plays via Twilio's TTS immediately after the WS opens,
  // filling the silence while our FSM loads questions from the DB. Without it,
  // Twilio closes the WS if we don't send a text frame within a short window.
  return twimlResponse(`
    <Connect>
      <ConversationRelay
        url="${relayUrl}"
        welcomeGreeting="${escapeXmlAttr(greeting)}"
        welcomeGreetingInterruptible="none"
        ttsProvider="Amazon"
        voice="Ruth-Generative"
        dtmfDetection="true"
        interruptible="true"
      />
    </Connect>
  `);
}
