import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { renderSms } from "@/lib/sms";
import { sendInviteSMS } from "@/lib/twilio-messaging";
import { env } from "@/lib/env";

// POST /api/interview-requests/:id/resend — re-sends the invite SMS (rate-limited below).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await getViewer();

  const { data: request } = await supabase
    .from("interview_requests")
    .select("id, status, token, contact_id, template_snapshot")
    .eq("id", id)
    .maybeSingle();

  if (!request) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  if (!["sent", "reminded"].includes(request.status)) {
    return NextResponse.json(
      { error: { code: "not_resendable", message: `Cannot resend a request with status "${request.status}".` } },
      { status: 400 },
    );
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("first_name, phone_e164, consent_status")
    .eq("id", request.contact_id)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: { code: "contact_missing" } }, { status: 400 });
  if (contact.consent_status === "revoked") {
    return NextResponse.json({ error: { code: "consent_revoked" } }, { status: 400 });
  }

  const snapshot = request.template_snapshot as { sms_body: string };
  const body = renderSms(snapshot.sms_body, contact.first_name ?? "there", request.token);
  const statusCallbackUrl = `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/twilio/messaging/status`;

  try {
    await sendInviteSMS({ toE164: contact.phone_e164, body, statusCallbackUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMS dispatch failed";
    return NextResponse.json({ error: { code: "sms_failed", message } }, { status: 502 });
  }

  await supabase
    .from("interview_requests")
    .update({ status: "reminded" })
    .eq("id", id);

  return NextResponse.json({ id, resent: true });
}
