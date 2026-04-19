import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/db/queries";
import { StatusBadge } from "@/components/ui/Badge";
import { renderSms } from "@/lib/sms";
import type { SendStatus } from "@/lib/mocks";
import { ResendButton } from "./ResendButton";

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

  const snapshot = request.template_snapshot as Snapshot;
  const firstName = contact?.first_name ?? "there";
  const recipientName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "Recipient";
  const smsPreview = renderSms(snapshot.sms_body, firstName, request.token);

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
          <div className="mt-1 text-sm">{smsPreview}</div>
        </div>
        {["sent", "reminded"].includes(request.status) && (
          <div className="mt-3">
            <ResendButton requestId={request.id} />
          </div>
        )}
      </Section>

      <Section title="Questions in this interview">
        <ol className="list-decimal space-y-2 pl-4 text-sm">
          {snapshot.questions.map((q) => (
            <li key={q.id}>
              {q.prompt}
              {q.hint && <span className="ml-2 text-xs text-neutral-500">({q.hint})</span>}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Call result">
        <p className="text-sm text-neutral-500">
          No call yet. When the recipient dials, a session will appear here with recording, transcript,
          extracted answers, summary, and rendered output.
        </p>
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
