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

async function resolveId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  return id;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await resolveId(ctx.params);
  const { supabase } = await getViewer();

  const { data: tpl } = await supabase
    .from("interview_templates")
    .select("id, name, intro_message, sms_body, output_type, webhook_url, is_active, version, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!tpl) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

  const { data: questions } = await supabase
    .from("template_questions")
    .select("id, position, prompt, hint, allow_followup, max_seconds, required")
    .eq("template_id", id)
    .order("position", { ascending: true });

  return NextResponse.json({ template: { ...tpl, questions: questions ?? [] } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await resolveId(ctx.params);
  const { supabase } = await getViewer();

  const raw = await req.json();
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { error: tplErr } = await supabase
    .from("interview_templates")
    .update({
      name: body.name,
      intro_message: body.intro_message ?? null,
      sms_body: body.sms_body,
      output_type: body.output_type,
      webhook_url: body.webhook_url || null,
      version: undefined, // let trigger bump later; for now leave as-is
    })
    .eq("id", id);
  if (tplErr) {
    return NextResponse.json({ error: { code: "update_failed", message: tplErr.message } }, { status: 500 });
  }

  // Replace-all question strategy: delete existing then insert new.
  const { error: delErr } = await supabase.from("template_questions").delete().eq("template_id", id);
  if (delErr) {
    return NextResponse.json({ error: { code: "questions_clear_failed", message: delErr.message } }, { status: 500 });
  }
  const questionRows = body.questions.map((q, i) => ({
    template_id: id,
    position: i,
    prompt: q.prompt,
    hint: q.hint ?? null,
    allow_followup: q.allow_followup,
    max_seconds: q.max_seconds,
    required: q.required,
  }));
  const { error: insErr } = await supabase.from("template_questions").insert(questionRows);
  if (insErr) {
    return NextResponse.json({ error: { code: "questions_insert_failed", message: insErr.message } }, { status: 500 });
  }

  return NextResponse.json({ id });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await resolveId(ctx.params);
  const { supabase } = await getViewer();

  const { error } = await supabase
    .from("interview_templates")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: { code: "archive_failed", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ id, archived: true });
}
