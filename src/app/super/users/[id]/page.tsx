import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformUserDetail, type PlatformUserDetail } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";
import { Avatar, StatusPill, computeStatus, displayName, networkLabel } from "../../user-display";

type Params = Promise<{ id: string }>;

export const metadata = { title: "User — Operator — PostAud.io" };

function joinedLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex text-[13px]">
      <div className="w-[92px] flex-none text-muted">{label}</div>
      <div className="min-w-0 text-ink">{children}</div>
    </div>
  );
}

function CardShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
      {title && <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</h3>}
      {children}
    </div>
  );
}

function SimpleSeriesList({ rows, empty }: { rows: Array<{ id: string; title: string }>; empty: string }) {
  if (rows.length === 0) return <p className="py-1 text-[13px] text-faint">{empty}</p>;
  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] bg-paper">
      {rows.map((s) => (
        <div key={s.id} className="truncate border-b border-line px-3.5 py-2.5 font-serif text-[14px] text-ink last:border-b-0">
          {s.title}
        </div>
      ))}
    </div>
  );
}

const SERIES_COLS = "1fr 150px 90px 90px 130px";

export default async function SuperUserDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail: PlatformUserDetail | null = await getPlatformUserDetail(id);
  if (!detail) notFound();
  const {
    user,
    orgs,
    seriesOwned,
    seriesSubjectOf,
    interviewCount,
    factsCount,
    factCount,
    auditLog,
    network,
    lastActivity,
  } = detail;

  const name = displayName(user);
  const status = computeStatus({ orgs, lastActivity });

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] text-muted">
        <Link href="/super/users" className="hover:text-ink">
          Users
        </Link>
        <span className="mx-1.5 text-faint">▸</span>
        <span className="font-medium text-ink">{name}</span>
      </div>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <div className="flex w-full flex-none flex-col gap-4 lg:w-[300px]">
          <CardShell>
            <div className="flex items-center gap-3.5">
              <Avatar row={user} size={52} />
              <div className="min-w-0">
                <div className="truncate text-[17px] font-semibold text-ink">{name}</div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted">{user.email}</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3.5">
              <MetaRow label="Joined">{joinedLong(user.createdAt)}</MetaRow>
              <MetaRow label="Last active">{relativeTime(lastActivity)}</MetaRow>
              <MetaRow label="Status">
                <StatusPill status={status} />
              </MetaRow>
              {/* Owned-only — same definition as the Users list' "Facts"
                  column, so list → detail agree for the same person. */}
              <MetaRow label="Facts">{factsCount.toLocaleString()}</MetaRow>
              {factCount !== factsCount && (
                <MetaRow label="Facts (incl. subject-of)">{factCount.toLocaleString()}</MetaRow>
              )}
              <MetaRow label="Interviews">{interviewCount.toLocaleString()}</MetaRow>
            </div>

            <div className="flex gap-2 border-t border-line pt-3.5">
              <ImpersonateButton
                userId={user.id}
                label="Impersonate"
                className="flex-1 rounded-full border border-line-strong py-2 text-center text-[12.5px] font-medium text-ink-soft hover:bg-paper-2 disabled:opacity-60"
              />
              <a
                href={`mailto:${user.email}`}
                className="flex-1 rounded-full border border-line-strong py-2 text-center text-[12.5px] font-medium text-ink-soft hover:bg-paper-2"
              >
                Email
              </a>
            </div>
            <button
              type="button"
              disabled
              title="Not available yet — users are suspended via their organization"
              className="cursor-not-allowed text-center text-[12px] text-faint"
            >
              Suspend account…
            </button>
          </CardShell>

          <CardShell title="Network">
            <p className="text-[13px] text-ink-soft">{networkLabel({ network })}</p>
            <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
              <div>
                <div className="font-serif text-[18px] text-ink">{network.invited}</div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-muted">Invited</div>
              </div>
              <div>
                <div className="font-serif text-[18px] text-ink">{network.assignees}</div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-muted">Assignees</div>
              </div>
              <div>
                <div className="font-serif text-[18px] text-ink">{network.subjects}</div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-muted">Subjects</div>
              </div>
            </div>
          </CardShell>

          <CardShell title="Accounts">
            {orgs.length === 0 && <p className="text-[13px] text-faint">Belongs to no account.</p>}
            {orgs.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {orgs.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <Link href={`/super/accounts/${o.id}`} className="truncate font-medium text-ink hover:text-green-deep">
                      {o.name}
                    </Link>
                    <span className="flex-none text-[11.5px] capitalize text-muted">
                      {o.role}
                      {!o.accepted && " · invited"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardShell>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
              Series created ({seriesOwned.length})
            </h3>
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              {seriesOwned.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-faint">No series created.</p>
              ) : (
                <>
                  <div
                    className="grid min-w-[680px] items-center gap-x-3 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
                    style={{ gridTemplateColumns: SERIES_COLS }}
                  >
                    <div>Series</div>
                    <div>Subject</div>
                    <div>Sessions</div>
                    <div>Facts</div>
                    <div>Last activity</div>
                  </div>
                  {seriesOwned.map((s) => (
                    <div
                      key={s.id}
                      className="grid min-w-[680px] items-center gap-x-3 border-b border-line px-4 py-3 text-[12.5px] last:border-b-0"
                      style={{ gridTemplateColumns: SERIES_COLS }}
                    >
                      <div className="truncate font-serif text-[14px] text-ink">{s.title}</div>
                      <div className="truncate text-muted">{s.subjectDisplay}</div>
                      <div className="text-ink">{s.sessions}</div>
                      <div className="font-mono text-[12px] font-medium text-ink-soft">
                        {s.facts > 0 ? s.facts.toLocaleString() : "—"}
                      </div>
                      <div className="text-muted">{relativeTime(s.lastActivity)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
              Series they are the subject of ({seriesSubjectOf.length})
            </h3>
            <SimpleSeriesList rows={seriesSubjectOf} empty="Not the subject of any series." />
          </div>

          <CardShell title="Recent activity">
            {auditLog.length === 0 && <p className="text-[13px] text-faint">No audit entries.</p>}
            {auditLog.length > 0 && (
              <div className="flex flex-col">
                {auditLog.map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-line py-2.5 text-[13px] last:border-b-0">
                    <div className="w-[100px] flex-none text-muted">{relativeTime(a.at)}</div>
                    <div className="min-w-0 text-ink-soft">
                      {a.action}
                      {a.actorEmail && <span className="text-muted"> · {a.actorEmail}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardShell>

          <p className="text-[12px] leading-relaxed text-muted">
            Operator view shows metadata only — transcripts and knowledge bases are not readable from here without an
            audited impersonation session.
          </p>
        </div>
      </div>
    </div>
  );
}
