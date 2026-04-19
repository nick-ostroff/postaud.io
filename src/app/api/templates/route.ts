import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";

const QuestionInput = z.object({
  prompt: z.string().min(1).max(500),
  hint: z.string().max(200).optional().nullable(),
  allow_followup: z.boolean().default(true),
  max_seconds: z.number().int().min(15).max(300).default(90),
  required: z.boolean().default(true),
});

const TemplateInput = z.object({
  name: z.string().min(1).max(120),
  intro_message: z.string().max(400).optional().nullable(),
  sms_body: z.string().min(1).max(400),
  output_type: z.enum([
    "transcript.plain",
    "summary.concise",
    "qa.structured",
    "blog.draft",
    "crm.note",
    "webhook.json",
  ]),
  webhook_url: z.string().url().optional().nullable().or(z.literal("")),
  questions: z.array(QuestionInput).min(1).max(15),
});

export async function GET() {
  const { supabase, organization } = await getViewer();
  if (!organization) return NextResponse.json({ templates: [] });

  const { data, error } = await supabase
    .from("interview_templates")
    .select("id, name, intro_message, sms_body, output_type, webhook_url, is_active, created_at, updated_at:created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: { code: "db_error", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ templates: data });
}

export async function POST(req: Request) {
  const { supabase, organization, user } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: { code: "no_org", message: "No workspace" } }, { status: 400 });
  }

  const raw = await req.json();
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid template", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { data: tpl, error: tplErr } = await supabase
    .from("interview_templates")
    .insert({
      organization_id: organization.id,
      name: body.name,
      intro_message: body.intro_message ?? null,
      sms_body: body.sms_body,
      output_type: body.output_type,
      webhook_url: body.webhook_url || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tplErr || !tpl) {
    return NextResponse.json({ error: { code: "insert_failed", message: tplErr?.message ?? "unknown" } }, { status: 500 });
  }

  const questionRows = body.questions.map((q, i) => ({
    template_id: tpl.id,
    position: i,
    prompt: q.prompt,
    hint: q.hint ?? null,
    allow_followup: q.allow_followup,
    max_seconds: q.max_seconds,
    required: q.required,
  }));

  const { error: qErr } = await supabase.from("template_questions").insert(questionRows);
  if (qErr) {
    // Rollback: delete the template we just created.
    await supabase.from("interview_templates").delete().eq("id", tpl.id);
    return NextResponse.json({ error: { code: "questions_failed", message: qErr.message } }, { status: 500 });
  }

  return NextResponse.json({ id: tpl.id }, { status: 201 });
}
