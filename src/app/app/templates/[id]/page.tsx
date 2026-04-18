import { notFound } from "next/navigation";
import { mockTemplates } from "@/lib/mocks";
import { TemplateBuilder } from "./TemplateBuilder";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = mockTemplates.find((t) => t.id === id);
  if (!template) notFound();
  return <TemplateBuilder initial={template} />;
}
