import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StoryRail } from "@/components/nav/StoryRail";
import { fmtTalkTime, fmtTalkTimeShort } from "@/components/usage/format";
import { profilePhotoUrl } from "@/server/profile/photo-url";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import { staleness } from "@/server/series/staleness";
import {
  getSeries,
  getSeriesAccessSummary,
  getSeriesForUser,
  getSeriesKnowledge,
  getSeriesSummaries,
  getViewer,
  listInterviewsForSeries,
  listPendingQueuedQuestions,
} from "@/db/queries";
import { canInterviewSeries } from "@/server/interviews/access";
import { personaFor } from "@/lib/voices";
import { AddQueueQuestion } from "./AddQueueQuestion";
import { PendingSummaryRefresher } from "./PendingSummaryRefresher";
import { PromoteChip } from "./PromoteChip";
import { QueueOrderList } from "./QueueOrderList";
import { ReprocessButton } from "./ReprocessButton";

/** Sessions shown before collapsing the rest into a muted "and N earlier" line. */
const VISIBLE_SESSIONS = 6;

const navLabel = "text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint";

/** Absolute "Jul 19" (series-detail mockup 5) — session rows pair it with a
 * compact duration, so relative phrasing ("5 days ago") no longer fits. */
function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  return fmtTalkTimeShort(sec);
}


function HeaderStat({
  label,
  mint = false,
  children,
}: {
  label: string;
  mint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`serif text-[26px] leading-none ${mint ? "text-mint" : "text-paper"}`}>{children}</div>
      <div className="mt-1.5 text-[12px] text-dark-muted">{label}</div>
    </div>
  );
}

/** fmtTalkTime with numerals at stat size and units small ("3 min 42 sec", "1 hr 5 min 12 sec"). */
function TalkTime({ sec }: { sec: number }) {
  const text = fmtTalkTime(sec);
  return (
    <>
      {text.split(" ").map((token, i) => (
        <span key={i} className={/^\d+$/.test(token) ? undefined : "text-[14px] text-dark-muted"}>
          {i > 0 && " "}
          {token}
        </span>
      ))}
    </>
  );
}

const badgeLabel: Record<string, string> = {
  owner: "owner",
  can_interview: "can interview",
  can_view: "can view",
};

type Params = Promise<{ id: string }>;

export default async function SeriesDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, role, user } = await getViewer();
  const isAdmin = role === "admin";

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  // Everything this viewer can see, for the mobile story rail — same circles
  // as home, with this series ringed. Summaries fetched for the whole rail
  // (waiting dots) in the same round trip that serves this page's stats.
  const railSeries = (await getSeriesForUser(supabase)).filter((s) => s.status !== "archived");
  const summaryIds = [...new Set([id, ...railSeries.map((s) => s.id)])];

  const [summaries, knowledge, sessions, access, pendingQuestions, canAddQuestion] = await Promise.all([
    getSeriesSummaries(supabase, summaryIds),
    getSeriesKnowledge(supabase, id),
    listInterviewsForSeries(supabase, id),
    getSeriesAccessSummary(supabase, id),
    listPendingQueuedQuestions(supabase, id),
    // The Add composer POSTs to the queue API, which requires interview
    // access (403s view-only members) — same server-side gate as the queue
    // page's composer, so we never render an input that can only fail.
    canInterviewSeries(supabase, {
      userId: user.id,
      role,
      seriesSubjectUserId: series.subject_user_id,
      seriesId: series.id,
    }),
  ]);

  const summary = summaries[id];

  // Ritual queues are fixed by the members — the same questions every session,
  // so post-session topic suggestions never apply there.
  const isRitual = series.conversation_mode === "ritual";
  const suggestedTopics = isRitual ? [] : knowledge.topics.filter((t) => t.suggested);

  const people = knowledge.entities.filter((e) => e.kind === "person");

  // Timeline: date entities joined to their facts via fact_entities (same
  // approach as the knowledge page) — `detail` on a date entity is never
  // populated, so the displayed text comes from the linked fact's statement
  // instead. Sorted lexically by name, which works for same-length year
  // strings; take the last 3 for "3 latest".
  const visibleFacts = knowledge.facts.filter((f) => f.status !== "superseded");
  const factsByDateEntity = new Map<string, string>();
  for (const f of visibleFacts) {
    for (const e of f.entities) {
      if (e.kind !== "date" || factsByDateEntity.has(e.id)) continue;
      factsByDateEntity.set(e.id, f.statement);
    }
  }
  const timeline = knowledge.entities
    .filter((e) => e.kind === "date")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ id: e.id, name: e.name, statement: factsByDateEntity.get(e.id) ?? e.detail }))
    .filter((t) => t.statement)
    .slice(-3);

  // A visible session without a summary is still being processed — mount the
  // poller so the page updates itself once the pipeline lands. Errored
  // sessions are excluded: their summary isn't coming without a reprocess.
  const summaryPending = sessions
    .slice(0, VISIBLE_SESSIONS)
    .some((s) => s.summaryShort == null && !s.processError);

  const subjectSubtitle = series.subject_relationship
    ? `${series.subject_name} · ${series.subject_relationship}`
    : series.subject_name;

  const persona = personaFor(series.voice);
  // Legacy deep rows read as Flow here — deep is no longer a selectable mode.
  const modeLabel =
    series.conversation_mode === "quickfire"
      ? "Quick fire"
      : series.conversation_mode === "ritual"
        ? "Ritual"
        : "Flow";
  const totalTalkSec = sessions.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  const queuedCount = pendingQuestions.length;

  const now = new Date();
  const railStories = railSeries.map((s) => ({
    id: s.id,
    title: s.title,
    photoUrl: subjectPhotoUrl(s),
    waiting: staleness(
      summaries[s.id]?.lastSessionAt ? new Date(summaries[s.id].lastSessionAt as string) : null,
      now,
    ).stale,
  }));

  const dot = <span aria-hidden>·</span>;

  return (
    <div>
      {summaryPending && <PendingSummaryRefresher />}
      {/* On phones the header bleeds full-width into the dark top nav (mockup 5)
          and carries the story rail — the rail is the series nav there, so the
          "‹ Series" crumb is desktop-only. */}
      <div className="-mx-5 -mt-6 bg-dark px-5 pb-5 pt-3 text-paper lg:mx-0 lg:mt-0 lg:rounded-card lg:px-[22px] lg:pb-[22px] lg:pt-4 lg:shadow-card">
        <div className="mb-3 border-b border-dark-line lg:hidden">
          <StoryRail
            tone="dark"
            stories={railStories}
            activeId={series.id}
            canCreate={isAdmin}
            showAllLink
          />
        </div>
        <Link
          href="/app/series"
          className="hidden items-center gap-1.5 text-[12.5px] font-medium text-dark-muted hover:text-paper hover:no-underline lg:inline-flex"
        >
          <span aria-hidden>‹</span> Series
        </Link>
        <h1 className="text-[30px] leading-[1.15] text-paper lg:mt-1">{series.title}</h1>

        <div className="mt-3.5 flex items-center gap-3 lg:mt-4">
          <Avatar name={persona.name} size="lg" tone="dark" />
          <div className="min-w-0 flex-1 truncate text-[14px]">
            <span className="font-semibold">{persona.name}</span>
            <span className="text-dark-muted"> · interviewing {subjectSubtitle}</span>
          </div>
          <span className="rounded-pill border border-mint/45 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mint">
            {modeLabel}
          </span>
        </div>

        {/* Compact one-line stats on phones; the big serif stat row on desktop. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13.5px] text-dark-muted lg:hidden">
          <span className="font-semibold text-paper">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </span>
          {dot}
          <span>{fmtTalkTimeShort(totalTalkSec)}</span>
          {dot}
          <span>
            {summary.memoriesCount} {summary.memoriesCount === 1 ? "memory" : "memories"}
          </span>
          {dot}
          <span className={queuedCount > 0 ? "font-semibold text-mint" : undefined}>{queuedCount} queued</span>
        </div>

        <div className="mt-[18px] hidden flex-wrap gap-x-10 gap-y-3 border-t border-dark-line pt-4 lg:flex">
          <HeaderStat label="sessions">{sessions.length}</HeaderStat>
          <HeaderStat label="total time">
            <TalkTime sec={totalTalkSec} />
          </HeaderStat>
          <HeaderStat label="memories" mint>
            {summary.memoriesCount}
          </HeaderStat>
          <HeaderStat label="queued">{queuedCount}</HeaderStat>
        </div>
      </div>

      {/* Below `sm` these stack full-width; the floating story bar carries
          the same Talk action on mobile, so nothing here is the only path. */}
      <div className="mb-[22px] mt-4 flex flex-wrap items-center gap-2.5">
        <Link href={`/app/series/${series.id}/interview`} className="w-full sm:w-auto">
          <Button variant="primary" size="big" className="w-full justify-center">
            Start interview{queuedCount > 0 ? ` · ${queuedCount} waiting` : ""}
          </Button>
        </Link>
        {series.subject_user_id == null && (
          <Link href={`/app/series/${series.id}/handoff`} className="hover:no-underline">
            <Button variant="secondary">Hand the mic</Button>
          </Link>
        )}
        {isAdmin && (
          <Link href={`/app/series/${series.id}/settings`} className="hover:no-underline">
            <Button variant="ghost">Settings</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        {/* A live queue is what the next session runs on, so it leads (mockup
            5b); with nothing queued, Sessions lead and the empty queue trails
            with its Add affordance (5a). */}
        <div className="flex flex-col gap-3.5">
          {(() => {
            const sessionsCard = (
              <Card key="sessions" className="px-[22px] py-5">
                <div className="flex items-center justify-between">
                  <h3>Sessions</h3>
                  <span className="text-[12.5px] text-faint">
                    {series.planned_sessions
                      ? `${sessions.length} of ${series.planned_sessions} total`
                      : sessions.length === 0
                        ? "none yet"
                        : `${sessions.length} total`}
                  </span>
                </div>

                {sessions.length === 0 ? (
                  <p className="mt-3 text-[13.5px] text-muted">
                    No sessions yet — start the first interview to begin filling this in.
                  </p>
                ) : (
                  <div className="mt-1">
                    {sessions.slice(0, VISIBLE_SESSIONS).map((s) => {
                      const duration = formatDuration(s.durationSec);
                      return (
                        <div key={s.id} className="border-b border-line py-3.5 last:border-b-0 last:pb-1">
                          <div className="flex flex-wrap items-baseline gap-2.5">
                            <span className="text-[13.5px] font-semibold">
                              <Link href={`/app/interviews/${s.id}`}>Session {s.sessionNumber}</Link>
                            </span>
                            <span className="text-[12.5px] text-faint">
                              {formatSessionDate(s.startedAt)}
                              {duration ? ` · ${duration}` : ""}
                            </span>
                            <Badge>{s.memoriesAdded} new</Badge>
                            {s.processError && isAdmin && (
                              <>
                                <Badge tone="amber">processing failed</Badge>
                                <ReprocessButton interviewId={s.id} />
                              </>
                            )}
                          </div>
                          <div className="serif mt-1 text-[14.5px] leading-[1.5] text-ink-soft">
                            {s.summaryShort ?? "Summary pending — check back soon."}
                          </div>
                        </div>
                      );
                    })}
                    {sessions.length > VISIBLE_SESSIONS && (
                      <p className="pt-2.5 text-[12.5px] text-faint">
                        and {sessions.length - VISIBLE_SESSIONS} earlier sessions
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );

            const queueCard = (
              <Card key="queue" className="px-[22px] py-5">
                <div className="flex items-center justify-between">
                  <h3>Question queue</h3>
                  <Link href={`/app/series/${series.id}/queue`} className="text-[13px] font-medium">
                    Manage →
                  </Link>
                </div>
                {isRitual && (
                  <p className="text-[13px] text-muted">
                    The ritual — {persona.name} asks these same questions every session.
                  </p>
                )}

                {queuedCount === 0 ? (
                  <p className="mt-3 text-[13.5px] text-muted">
                    {isRitual
                      ? `No ritual questions yet${canAddQuestion ? " — add the questions you want asked every session." : "."}`
                      : `Empty — save follow-ups during a Flow session${canAddQuestion ? ", or add your own." : "."}`}
                  </p>
                ) : (
                  <QueueOrderList
                    // Remount whenever the server-side order changes (our own
                    // refresh after a reorder, or another admin's) so the
                    // client list never drifts from the source of truth.
                    key={pendingQuestions.map((q) => q.id).join(",")}
                    seriesId={series.id}
                    initialItems={pendingQuestions.map((q) => ({ id: q.id, text: q.text }))}
                    canManage={isAdmin}
                  />
                )}

                {suggestedTopics.length > 0 && (
                  <div className="mt-3.5">
                    <div className={navLabel} style={{ padding: "0 0 8px" }}>
                      Suggested after the last session
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {suggestedTopics.map((t) => (
                        <PromoteChip key={t.id} topicId={t.id} seriesId={series.id} name={t.name} />
                      ))}
                    </div>
                  </div>
                )}

                {canAddQuestion && <AddQueueQuestion seriesId={series.id} />}
              </Card>
            );

            return queuedCount > 0 ? [queueCard, sessionsCard] : [sessionsCard, queueCard];
          })()}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card className="px-[22px] py-5">
            <h3>What {persona.name} knows</h3>
            <p className="text-[13px] text-muted">
              {summary.memoriesCount > 0
                ? `${summary.memoriesCount} ${summary.memoriesCount === 1 ? "memory" : "memories"} saved so far.`
                : "No memories saved yet — that'll change after the first session."}
            </p>

            {people.length > 0 && (
              <>
                <div className={navLabel} style={{ padding: "14px 0 8px" }}>
                  People
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => (
                    <Chip key={p.id}>
                      {p.name}
                      {p.detail && (
                        <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">{p.detail}</span>
                      )}
                    </Chip>
                  ))}
                </div>
              </>
            )}

            {timeline.length > 0 && (
              <>
                <div className={navLabel} style={{ padding: "16px 0 10px" }}>
                  Timeline
                </div>
                <div className="relative pl-[22px] before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-[1.5px] before:bg-line-strong before:content-['']">
                  {timeline.map((t) => (
                    <div key={t.id} className="relative pb-[18px] last:pb-1">
                      <div className="absolute -left-[22px] top-[5px] h-[11px] w-[11px] rounded-full border-[2.5px] border-paper bg-green" />
                      <div className="text-[11.5px] font-bold tracking-[0.08em] text-green-deep">{t.name}</div>
                      <div className="serif text-[15px]">{t.statement}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-2">
              <Link href={`/app/series/${series.id}/knowledge`} className="text-[13px] font-medium">
                Open the knowledge base →
              </Link>
            </div>
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Who&apos;s involved</h3>
            {access.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">No one added yet.</p>
            ) : (
              <div>
                {access.map((a) => (
                  <div
                    key={a.userId}
                    className="flex items-center gap-3 border-b border-line py-3 last:border-b-0 last:pb-1"
                  >
                    <Avatar
                      name={a.name}
                      src={profilePhotoUrl(a.avatarPath)}
                      tone={a.badge === "owner" ? "green" : "plain"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{a.name}</div>
                      {a.badge === "owner" && <div className="text-xs text-faint">owner</div>}
                    </div>
                    {a.badge !== "owner" && (
                      <Badge tone={a.badge === "can_view" ? "muted" : "green"}>{badgeLabel[a.badge]}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2">
              <Link href={`/app/series/${series.id}/settings`} className="text-[13px] font-medium">
                Manage access →
              </Link>
            </div>
          </Card>

        </div>
      </div>

    </div>
  );
}
