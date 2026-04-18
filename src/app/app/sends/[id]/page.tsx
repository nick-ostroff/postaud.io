import Link from "next/link";
import { notFound } from "next/navigation";
import { mockSends, mockSessionDetail } from "@/lib/mocks";
import { StatusBadge } from "@/components/ui/Badge";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtDuration(sec?: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function SendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const send = mockSends.find((s) => s.id === id);
  if (!send) notFound();

  const detail = mockSessionDetail; // single mock detail for all sends

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/app/sends" className="hover:underline">Sends</Link>
        <span>/</span>
        <span className="text-neutral-700">{send.contact.first_name} {send.contact.last_name}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {send.contact.first_name} {send.contact.last_name}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{send.template_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={send.status} />
        </div>
      </div>

      {/* summary card */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <KV label="Sent"       value={fmtDate(send.sent_at)} />
        <KV label="Completed"  value={send.completed_at ? fmtDate(send.completed_at) : "—"} />
        <KV label="Duration"   value={fmtDuration(send.duration_sec)} />
        <KV label="Dial code"  value={send.dial_code} />
      </div>

      {/* recording */}
      <Section title="Recording">
        <div className="flex items-center gap-4">
          <button className="rounded-full bg-neutral-900 p-3 text-white hover:bg-neutral-800" aria-label="Play">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5-10-5.5z"/></svg>
          </button>
          <div className="flex-1">
            <div className="h-1 rounded-full bg-neutral-200">
              <div className="h-1 w-0 rounded-full bg-neutral-900" />
            </div>
            <div className="mt-2 flex justify-between text-xs text-neutral-500 tabular-nums">
              <span>0:00</span>
              <span>{fmtDuration(send.duration_sec)}</span>
            </div>
          </div>
          <button className="text-xs text-neutral-500 hover:text-neutral-900">Download</button>
        </div>
      </Section>

      {/* summary */}
      <Section title="Summary">
        <p className="text-sm">{detail.summary.short}</p>
        <p className="mt-4 text-sm text-neutral-700">{detail.summary.long}</p>
        <ul className="mt-4 space-y-1 text-sm text-neutral-700">
          {detail.summary.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* structured answers */}
      <Section title="Q&A">
        <ul className="space-y-5">
          {detail.answers.map((a, i) => (
            <li key={i}>
              <div className="text-sm font-medium">{i + 1}. {a.question}</div>
              {a.answer ? (
                <p className="mt-1 text-sm text-neutral-700">{a.answer}</p>
              ) : (
                <p className="mt-1 text-sm italic text-neutral-400">— recipient skipped or gave no answer —</p>
              )}
              <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                <span>confidence {Math.round(a.confidence * 100)}%</span>
                {a.followup && (
                  <>
                    <span>·</span>
                    <span className="italic">follow-up: "{a.followup}"</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* output */}
      <Section title={`Output — ${detail.output.type}`}>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-4 text-sm text-neutral-100">
{detail.output.rendered_text}
        </pre>
      </Section>

      {/* webhook log */}
      <Section title="Webhook deliveries">
        {detail.webhook_deliveries.length === 0 ? (
          <p className="text-sm text-neutral-500">No webhook configured for this template.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-2 font-medium">URL</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Response</th>
                <th className="py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {detail.webhook_deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 font-mono text-xs text-neutral-700">{d.url}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2 text-neutral-700">{d.response_status}</td>
                  <td className="py-2 text-xs text-neutral-500">{fmtDate(d.attempted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-medium tracking-wide text-neutral-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}
