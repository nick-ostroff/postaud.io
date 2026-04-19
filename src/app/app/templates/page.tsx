import Link from "next/link";
import { getViewer } from "@/db/queries";

const OUTPUT_LABELS: Record<string, string> = {
  "transcript.plain": "Transcript",
  "summary.concise":  "Summary",
  "qa.structured":    "Q&A JSON",
  "blog.draft":       "Blog draft",
  "crm.note":         "CRM note",
  "webhook.json":     "Webhook JSON",
};

export default async function TemplatesListPage() {
  const { supabase } = await getViewer();

  const { data: templates } = await supabase
    .from("interview_templates")
    .select("id, name, intro_message, output_type, webhook_url, is_active")
    .order("created_at", { ascending: false });

  // Load question counts in a second query (simpler than a join for now).
  const ids = (templates ?? []).map((t) => t.id);
  let counts: Record<string, number> = {};
  if (ids.length) {
    const { data: qs } = await supabase
      .from("template_questions")
      .select("template_id")
      .in("template_id", ids);
    counts = (qs ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Reusable question sets. Each send uses a frozen snapshot of a template.
          </p>
        </div>
        <Link
          href="/app/templates/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New template
        </Link>
      </div>

      {(!templates || templates.length === 0) ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <div className="text-sm font-medium">No templates yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Build a short list of questions your AI will ask. You can reuse it across sends.
          </p>
          <Link
            href="/app/templates/new"
            className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/app/templates/${t.id}`}
              className="group rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-neutral-900 group-hover:underline">{t.name}</h3>
                  {t.intro_message && (
                    <p className="mt-1 text-sm text-neutral-600">{t.intro_message}</p>
                  )}
                </div>
                {!t.is_active && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    archived
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
                <span>{counts[t.id] ?? 0} questions</span>
                <span>·</span>
                <span>Output: <strong className="font-medium text-neutral-700">{OUTPUT_LABELS[t.output_type] ?? t.output_type}</strong></span>
                {t.webhook_url && (<><span>·</span><span>webhook</span></>)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
