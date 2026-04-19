import { notFound } from "next/navigation";
import { getViewer } from "@/db/queries";
import { TemplateBuilder } from "./TemplateBuilder";
import type { MockTemplate } from "@/lib/mocks";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const { data: tpl } = await supabase
    .from("interview_templates")
    .select("id, name, intro_message, sms_body, output_type, webhook_url, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!tpl) notFound();

  const { data: questions } = await supabase
    .from("template_questions")
    .select("id, position, prompt, hint, allow_followup, max_seconds, required")
    .eq("template_id", id)
    .order("position", { ascending: true });

  const initial: MockTemplate = {
    id: tpl.id,
    name: tpl.name,
    intro_message: tpl.intro_message ?? "",
    sms_body: tpl.sms_body,
    output_type: tpl.output_type,
    webhook_url: tpl.webhook_url ?? undefined,
    is_active: tpl.is_active,
    updated_at: new Date().toISOString(),
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      hint: q.hint ?? undefined,
      allow_followup: q.allow_followup,
      max_seconds: q.max_seconds,
      required: q.required,
    })),
  };

  return <TemplateBuilder initial={initial} />;
}
