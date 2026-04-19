import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/twilio";
import { serviceClient } from "@/db/service";

// POST /api/webhooks/twilio/voice/status
// Lifecycle callback — finalize interview_sessions when the call ends.
export async function POST(req: Request) {
  const clone = req.clone();
  const form = await clone.formData();
  const ok = await verifyTwilioSignature(req, form);
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  const callSid = form.get("CallSid") as string | null;
  const callStatus = form.get("CallStatus") as string | null;
  const callDuration = form.get("CallDuration") as string | null;
  if (!callSid) return NextResponse.json({ received: true });

  const svc = serviceClient();

  if (callStatus === "completed") {
    // If we have a recording already, consider it a completed interview; if
    // not, treat it as partial. For the V1 record-only flow, any hangup after
    // Record means we got the one-question answer.
    await svc
      .from("interview_sessions")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        duration_sec: callDuration ? Number(callDuration) : null,
      })
      .eq("twilio_call_sid", callSid);
  } else if (callStatus === "failed" || callStatus === "no-answer" || callStatus === "busy" || callStatus === "canceled") {
    await svc
      .from("interview_sessions")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
      })
      .eq("twilio_call_sid", callSid);
  }

  return NextResponse.json({ received: true });
}
