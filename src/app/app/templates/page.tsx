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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Templates</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Reusable question sets. Each send uses a frozen snapshot of a template.
          </p>
        </div>
        <Link
          href="/app/templates/new"
          className="rounded-lg bg-neutral-900 dark:bg-neutral-800 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors shadow-sm"
        >
          New template
        </Link>
      </div>

      {(!templates || templates.length === 0) ? (
        <div className="mt-10 rounded-[2rem] border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#111] p-12 text-center transition-colors">
          <div className="text-[15px] font-medium text-neutral-900 dark:text-neutral-50 tracking-tight">No templates yet</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            Build a short list of questions your AI will ask. You can reuse it across sends.
          </p>
          <Link
            href="/app/templates/new"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
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
              className="group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] hover:bg-neutral-50 dark:hover:bg-[#1a1a1c] p-6 transition-colors shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 group-hover:underline">{t.name}</h3>
                  {t.intro_message && (
                    <p className="mt-1 text-[13px] text-neutral-600 dark:text-neutral-400">{t.intro_message}</p>
                  )}
                </div>
                {!t.is_active && (
                  <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    archived
                  </span>
                )}
              </div>
              <div className="mt-5 flex items-center gap-3 text-[12px] font-medium text-neutral-500 dark:text-neutral-500">
                <span>{counts[t.id] ?? 0} questions</span>
                <span>·</span>
                <span>Output: <strong className="font-semibold text-neutral-700 dark:text-neutral-300">{OUTPUT_LABELS[t.output_type] ?? t.output_type}</strong></span>
                {t.webhook_url && (<><span>·</span><span>webhook</span></>)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
