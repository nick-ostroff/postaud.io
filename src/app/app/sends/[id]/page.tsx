import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/db/queries";
import { StatusBadge } from "@/components/ui/Badge";
import { renderSms } from "@/lib/sms";
import type { SendStatus } from "@/lib/mocks";
import { ResendButton } from "./ResendButton";
import { ReprocessButton } from "./ReprocessButton";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

type SnapshotQuestion = { id: string; position: number; prompt: string; hint?: string | null };
type Snapshot = {
  name: string;
  intro_message?: string | null;
  sms_body: string;
  output_type: string;
  questions: SnapshotQuestion[];
};

export default async function SendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const { data: request } = await supabase
    .from("interview_requests")
    .select("id, status, sent_at, completed_at, expires_at, dial_code, token, template_snapshot, contact_id")
    .eq("id", id)
    .maybeSingle();

  if (!request) notFound();

  const { data: contact } = await supabase
    .from("contacts")
    .select("first_name, last_name, phone_e164, email")
    .eq("id", request.contact_id)
    .maybeSingle();

  const { data: sessions } = await supabase
    .from("interview_sessions")
    .select("id, status, caller_phone, started_at, ended_at, duration_sec, recording_sid, recording_path")
    .eq("request_id", request.id)
    .order("started_at", { ascending: false });
  const latestSession = sessions?.[0] ?? null;

  const snapshot = request.template_snapshot as Snapshot;
  const firstName = contact?.first_name ?? "there";
  const recipientName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "Recipient";
  const smsPreview = renderSms(snapshot.sms_body, firstName, request.token);

  // Pipeline artifacts (only when we have a session)
  const [answersRes, summaryRes, outputRes] = latestSession
    ? await Promise.all([
        supabase
          .from("extracted_answers")
          .select("question_id, question_prompt, answer_text, confidence")
          .eq("session_id", latestSession.id),
        supabase
          .from("summaries")
          .select("short, long, bullets, created_at")
          .eq("session_id", latestSession.id)
          .maybeSingle(),
        supabase
          .from("output_jobs")
          .select("output_type, status, rendered_text, error, updated_at")
          .eq("session_id", latestSession.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [null, null, null];

  const answersByQ = new Map<string, { answer_text: string | null; confidence: number | null }>(
    (answersRes?.data ?? []).map((a) => [a.question_id, { answer_text: a.answer_text, confidence: a.confidence }]),
  );
  const summary = summaryRes?.data ?? null;
  const output = outputRes?.data ?? null;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/app/sends" className="hover:underline">Sends</Link>
        <span>/</span>
        <span className="text-neutral-700">{recipientName}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{recipientName}</h1>
          <p className="mt-1 text-sm text-neutral-600">{snapshot.name}</p>
        </div>
        <StatusBadge status={request.status as SendStatus} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <KV label="Sent"       value={fmtDate(request.sent_at)} />
        <KV label="Completed"  value={fmtDate(request.completed_at)} />
        <KV label="Expires"    value={fmtDate(request.expires_at)} />
        <KV label="Dial code"  value={request.dial_code} />
      </div>

      <Section title="The SMS we sent">
        <div className="rounded-xl bg-neutral-900 p-4 text-neutral-100">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400">SMS to {contact?.phone_e164}</div>
          <div className="mt-1 text-sm">{linkify(smsPreview)}</div>
        </div>
        {["sent", "reminded"].includes(request.status) && (
          <div className="mt-3">
            <ResendButton requestId={request.id} />
          </div>
        )}
      </Section>

      <Section title="Call result">
        {!latestSession ? (
          <p className="text-sm text-neutral-500">
            No call yet. When the recipient dials +18883158135, a session will appear here.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <KV label="Session status" value={latestSession.status} />
              <KV label="Caller"         value={latestSession.caller_phone ?? "—"} />
              <KV label="Duration"       value={fmtDuration(latestSession.duration_sec)} />
              <KV label="Ended"          value={fmtDate(latestSession.ended_at)} />
            </div>
            <ReprocessButton sessionId={latestSession.id} />
          </div>
        )}
      </Section>

      {summary && (summary.short || summary.long || (summary.bullets as string[] | null)?.length) ? (
        <Section title="Summary">
          {summary.short && <p className="text-sm">{summary.short}</p>}
          {summary.long && <p className="mt-3 text-sm text-neutral-700">{summary.long}</p>}
          {Array.isArray(summary.bullets) && summary.bullets.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-neutral-700">
              {(summary.bullets as string[]).map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {latestSession && (
        <Section title="Q&A">
          <ol className="space-y-5">
            {snapshot.questions.map((q, i) => {
              const a = answersByQ.get(q.id);
              return (
                <li key={q.id}>
                  <div className="text-sm font-medium">{i + 1}. {q.prompt}</div>
                  {a?.answer_text ? (
                    <p className="mt-1 text-sm text-neutral-700">{a.answer_text}</p>
                  ) : (
                    <p className="mt-1 text-sm italic text-neutral-400">— awaiting processing —</p>
                  )}
                  {a?.confidence != null && (
                    <div className="mt-1 text-xs text-neutral-500">
                      confidence {Math.round(Number(a.confidence) * 100)}%
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {output?.rendered_text ? (
        <Section title={`Output — ${output.output_type}`}>
          <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-4 text-sm text-neutral-100">
{output.rendered_text}
          </pre>
        </Section>
      ) : latestSession ? (
        <Section title="Output">
          <p className="text-sm text-neutral-500">
            {output?.error
              ? `Output generation failed: ${output.error}`
              : "Output will be generated here once processing completes."}
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function linkify(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-neutral-400 underline-offset-2 hover:text-white"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function fmtDuration(sec: number | null | undefined) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
