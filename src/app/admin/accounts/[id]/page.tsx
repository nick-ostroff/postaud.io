import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail, type ActivityStatus } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";
import { ImpersonateButton } from "./ImpersonateButton";

type Params = Promise<{ id: string }>;

function StatusBadge({ status }: { status: ActivityStatus }) {
  const styles: Record<ActivityStatus, string> = {
    active: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    dormant: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    invited: "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300",
  };
  const labels: Record<ActivityStatus, string> = {
    active: "Active",
    dormant: "Dormant",
    invited: "Invited — not accepted",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${styles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {labels[status]}
    </span>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default async function AccountDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();
  const { organization, network, seriesRows, usage, auditLog, ownerEmail, activityStatus } = detail;

  return (
    <div className="space-y-7">
      <div>
        <Link href="/admin" className="text-[12.5px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          Users
        </Link>
        <span className="mx-1.5 text-[12.5px] text-neutral-400">/</span>
        <span className="text-[12.5px] text-neutral-500">{organization.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[14px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {organization.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">{organization.name}</h1>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-neutral-400 dark:text-neutral-500">Owner </span>
              {ownerEmail ?? "—"}
            </span>
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] capitalize text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-neutral-400 dark:text-neutral-500">Plan </span>
              {organization.plan}
            </span>
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-neutral-400 dark:text-neutral-500">Member since </span>
              {new Date(organization.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <StatusBadge status={activityStatus} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <ImpersonateButton orgId={organization.id} />
            {ownerEmail && (
              <a
                href={`mailto:${ownerEmail}`}
                className="inline-flex items-center rounded-lg border border-neutral-300 px-3.5 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/5"
              >
                ✉ Email owner
              </a>
            )}
            <span
              className="inline-flex cursor-not-allowed items-center rounded-lg border border-neutral-200 px-3.5 py-2 text-[13px] font-medium text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
              title="V1: not yet"
            >
              Suspend
            </span>
          </div>
          <span className="text-[11.5px] text-neutral-400 dark:text-neutral-600">
            every impersonation is logged &amp; visible to the account owner
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.1fr_1.4fr]">
        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Plan &amp; usage</h3>
            <dl className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {[
                ["Plan", organization.plan],
                ["Credits remaining", organization.credits_remaining.toLocaleString()],
                ["Audio storage", formatBytes(usage.storageBytes)],
                ["Interviews this month", String(usage.interviewsThisMonth)],
                ["Facts on file", String(usage.factsCount)],
                ["Series", String(usage.seriesCount)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between py-2 text-[13.5px]">
                  <span className="text-neutral-500">{k}</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{v}</span>
                </div>
              ))}
            </dl>
            <Link
              href={`/admin/accounts/${organization.id}/credits`}
              className="mt-3 inline-block text-[13px] font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            >
              Adjust credits →
            </Link>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Network</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Who {ownerEmail ?? "the owner"} has brought onto the platform.</p>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {network.members.length === 0 && (
                <p className="py-3 text-[13px] text-neutral-400">No members yet.</p>
              )}
              {network.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11.5px] font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                    {(m.email || "?").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-neutral-900 dark:text-white">{m.email}</div>
                    <div className="truncate text-[12px] text-neutral-500 capitalize">
                      {m.role}
                      {m.subjectOf.length > 0 && <> · subject of &ldquo;{m.subjectOf.join(", ")}&rdquo;</>}
                    </div>
                  </div>
                  <span
                    className={
                      "ml-auto flex-shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium " +
                      (m.accepted
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-neutral-100 text-neutral-500 dark:bg-white/10 dark:text-neutral-400")
                    }
                  >
                    {m.accepted ? "Active" : "Invited — not accepted"}
                  </span>
                </div>
              ))}
            </div>
            {network.subjectsWithoutAccount.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/15">
                <div className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                  Subjects without an account:{" "}
                  {network.subjectsWithoutAccount.map((s) => s.subjectName).join(", ")}
                </div>
                <div className="mt-0.5 text-[11.5px] text-neutral-500">
                  Interviewed via hand-the-mic · no login exists for{" "}
                  {network.subjectsWithoutAccount.length === 1 ? "them" : "these subjects"}.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Series</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Metadata only — titles, counts, and dates.</p>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {seriesRows.length === 0 && <p className="py-3 text-[13px] text-neutral-400">No series yet.</p>}
              {seriesRows.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[15px] text-neutral-900 dark:text-white">{s.title}</div>
                    <div className="mt-0.5 truncate text-[12px] text-neutral-500">
                      Subject: {s.subjectName} ({s.subjectDisplay})
                      {s.stale && (
                        <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          going stale
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right text-[12px] text-neutral-500">
                    {s.sessions} session{s.sessions === 1 ? "" : "s"} · {s.facts} facts
                    <div className="text-neutral-400">
                      {s.lastActivity ? `last session ${relativeTime(s.lastActivity)}` : "no sessions yet"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-7 text-center dark:border-neutral-700 dark:bg-white/[0.03]">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900/[0.07] text-[19px] text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
              ⚿
            </div>
            <div className="font-serif text-[17px] text-neutral-800 dark:text-neutral-100">
              Transcripts and knowledge are hidden.
            </div>
            <div className="mx-auto mt-1.5 max-w-sm text-[12.5px] text-neutral-500">
              Start an audited impersonation session to view. Every impersonation is logged and visible to the
              account owner.
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Recent activity</h3>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {auditLog.length === 0 && <p className="py-3 text-[13px] text-neutral-400">No audit entries.</p>}
              {auditLog.map((a) => (
                <div key={a.id} className="flex gap-3 py-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <div className="text-[13px] text-neutral-800 dark:text-neutral-200">{a.action}</div>
                    <div className="text-[11.5px] text-neutral-400">{new Date(a.at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
