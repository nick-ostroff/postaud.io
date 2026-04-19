import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { generateToken } from "@/lib/token";
import { generateDialCode } from "@/lib/dial-code";

const SendInput = z.object({
  template_id: z.string().uuid(),
  contact_id: z.string().uuid(),
});

/**
 * Creates one interview_request:
 *   - snapshots the template + its questions
 *   - assigns a fresh token and 6-digit dial_code (retry up to 5x on collision)
 *   - decrements credits
 *   - sets status=sent and sent_at=now()
 *
 * Does NOT yet send an SMS — that wires up when Twilio lands.
 */
export async function POST(req: Request) {
  const { supabase, organization, user } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: { code: "no_org" } }, { status: 400 });
  }

  const raw = await req.json();
  const parsed = SendInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation_error", details: parsed.error.flatten() } }, { status: 400 });
  }
  const { template_id, contact_id } = parsed.data;

  if (organization.credits_remaining <= 0) {
    return NextResponse.json({ error: { code: "out_of_credits", message: "No credits remaining on this plan." } }, { status: 402 });
  }

  // Load template + questions + contact. All go through RLS so cross-org is blocked.
  const [{ data: tpl, error: tplErr }, { data: questions }, { data: contact }] = await Promise.all([
    supabase
      .from("interview_templates")
      .select("id, name, intro_message, sms_body, output_type, webhook_url, is_active, version")
      .eq("id", template_id)
      .maybeSingle(),
    supabase
      .from("template_questions")
      .select("id, position, prompt, hint, allow_followup, max_seconds, required")
      .eq("template_id", template_id)
      .order("position", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, phone_e164, consent_status")
      .eq("id", contact_id)
      .maybeSingle(),
  ]);

  if (tplErr || !tpl) return NextResponse.json({ error: { code: "template_not_found" } }, { status: 404 });
  if (!tpl.is_active) return NextResponse.json({ error: { code: "template_archived" } }, { status: 400 });
  if (!contact) return NextResponse.json({ error: { code: "contact_not_found" } }, { status: 404 });
  if (contact.consent_status === "revoked") {
    return NextResponse.json({ error: { code: "consent_revoked", message: "This contact has opted out of SMS." } }, { status: 400 });
  }

  const template_snapshot = {
    template_id: tpl.id,
    version: tpl.version,
    name: tpl.name,
    intro_message: tpl.intro_message,
    sms_body: tpl.sms_body,
    output_type: tpl.output_type,
    webhook_url: tpl.webhook_url,
    questions: questions ?? [],
  };

  const token = generateToken();
  let inserted: { id: string; dial_code: string } | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const dial_code = generateDialCode();
    const { data, error } = await supabase
      .from("interview_requests")
      .insert({
        organization_id: organization.id,
        template_id: tpl.id,
        template_snapshot,
        contact_id: contact.id,
        sender_user_id: user.id,
        token,
        dial_code,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select("id, dial_code")
      .single();

    if (!error && data) {
      inserted = data;
      break;
    }
    // Partial-unique-index collision on dial_code among active rows.
    if ((error as { code?: string } | null)?.code === "23505") {
      lastError = "dial_code collision";
      continue;
    }
    lastError = error?.message ?? "unknown insert failure";
    break;
  }

  if (!inserted) {
    return NextResponse.json({ error: { code: "insert_failed", message: lastError ?? "unknown" } }, { status: 500 });
  }

  // Decrement credits (best effort — hard-enforce via a DB trigger later).
  await supabase
    .from("organizations")
    .update({ credits_remaining: organization.credits_remaining - 1 })
    .eq("id", organization.id);

  return NextResponse.json(
    { id: inserted.id, token, dial_code: inserted.dial_code },
    { status: 201 },
  );
}

export async function GET() {
  const { supabase } = await getViewer();
  const { data, error } = await supabase
    .from("interview_requests")
    .select("id, token, dial_code, status, sent_at, completed_at, template_id, contact_id")
    .order("sent_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: { code: "db_error", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ requests: data });
}
