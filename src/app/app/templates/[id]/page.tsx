export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit template</h1>
      <p className="mt-2 text-sm text-neutral-600">Template {id}. TODO.</p>
    </div>
  );
}
