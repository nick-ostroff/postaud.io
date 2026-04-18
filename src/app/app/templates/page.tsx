import Link from "next/link";
import { mockTemplates } from "@/lib/mocks";

const OUTPUT_LABELS: Record<string, string> = {
  "transcript.plain": "Transcript",
  "summary.concise":  "Summary",
  "qa.structured":    "Q&A JSON",
  "blog.draft":       "Blog draft",
  "crm.note":         "CRM note",
  "webhook.json":     "Webhook JSON",
};

export default function TemplatesListPage() {
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

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {mockTemplates.map((t) => (
          <Link
            key={t.id}
            href={`/app/templates/${t.id}`}
            className="group rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-neutral-900 group-hover:underline">{t.name}</h3>
                <p className="mt-1 text-sm text-neutral-600">{t.intro_message}</p>
              </div>
              {!t.is_active && (
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  archived
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
              <span>{t.questions.length} questions</span>
              <span>·</span>
              <span>Output: <strong className="font-medium text-neutral-700">{OUTPUT_LABELS[t.output_type]}</strong></span>
              {t.webhook_url && (<><span>·</span><span>webhook</span></>)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
