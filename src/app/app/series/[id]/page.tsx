import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryBar } from "@/components/nav/StoryBar";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CoverageBar } from "@/components/ui/CoverageBar";
import { SeriesPhotoEditor } from "@/components/series/SeriesPhotoEditor";
import { profilePhotoUrl } from "@/server/profile/photo-url";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import {
  getSeries,
  getSeriesAccessSummary,
  getSeriesKnowledge,
  getSeriesSummaries,
  getViewer,
  listInterviewsForSeries,
} from "@/db/queries";
import { getVaultLink } from "@/db/queries/vault";
import { ExportCard } from "./ExportCard";
import { PendingSummaryRefresher } from "./PendingSummaryRefresher";
import { PromoteChip } from "./PromoteChip";
import { ReprocessButton } from "./ReprocessButton";
import { VaultCard } from "./VaultCard";

/** Coverage below this reads as amber — matches the card grid's threshold. */
const LOW_COVERAGE = 0.4;

/** Sessions shown before collapsing the rest into a muted "and N earlier" line. */
const VISIBLE_SESSIONS = 6;

const navLabel = "text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint";

function formatSessionDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const mins = Math.round(sec / 60);
  return `${mins} min`;
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

  const [summaries, knowledge, sessions, access, vaultLink] = await Promise.all([
    getSeriesSummaries(supabase, [id]),
    getSeriesKnowledge(supabase, id),
    listInterviewsForSeries(supabase, id),
    getSeriesAccessSummary(supabase, id),
    getVaultLink(supabase, id, user.id),
  ]);

  const summary = summaries[id];

  const queueTopics = knowledge.topics
    .filter((t) => !t.suggested)
    .sort((a, b) => a.position - b.position);
  const suggestedTopics = knowledge.topics.filter((t) => t.suggested);

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

  return (
    <div>
      {summaryPending && <PendingSummaryRefresher />}
      <div className="mb-2 text-[12.5px] text-faint">
        <Link href="/app" className="text-muted">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/app/series" className="text-muted">
          Series
        </Link>{" "}
        / {series.title}
      </div>

      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">{series.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Chip>
              <SeriesPhotoEditor
                seriesId={series.id}
                name={series.subject_name}
                photoUrl={subjectPhotoUrl(series)}
                canEdit={isAdmin}
              />
              {subjectSubtitle}
            </Chip>
            <Chip kicker="covered">
              <span className="inline-block w-16">
                <CoverageBar value={summary.meanCoverage} low={summary.meanCoverage < LOW_COVERAGE} />
              </span>
            </Chip>
          </div>
        </div>
        {/* Below `sm` these stack full-width; the floating story bar carries
            the same Talk action on mobile, so nothing here is the only path. */}
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          {isAdmin && (
            <Link href={`/app/series/${series.id}/settings`} className="hover:no-underline">
              <Button variant="ghost">Settings</Button>
            </Link>
          )}
          {series.subject_user_id == null && (
            <Link href={`/app/series/${series.id}/handoff`} className="hover:no-underline">
              <Button variant="secondary">Hand the mic</Button>
            </Link>
          )}
          <Link href={`/app/series/${series.id}/interview`} className="w-full sm:w-auto">
            <Button variant="primary" size="big" className="w-full justify-center">
              Start interview
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-3.5">
          <Card className="px-[22px] py-5">
            <div className="flex items-center justify-between">
              <h3>Sessions</h3>
              <span className="text-[12.5px] text-faint">
                {series.planned_sessions
                  ? `${sessions.length} of ${series.planned_sessions} planned`
                  : sessions.length === 0
                    ? "none yet"
                    : `${sessions.length} so far`}
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
                  const memoriesWord = s.memoriesAdded === 1 ? "memory" : "memories";
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
                        <Badge>
                          {s.memoriesAdded} new {memoriesWord}
                        </Badge>
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

          <Card className="px-[22px] py-5">
            <h3>Topic queue</h3>
            <p className="text-[13px] text-muted">
              What Anna plans to explore next — reorder, add your own, or let her follow the thread.
            </p>

            {queueTopics.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted">No topics queued yet.</p>
            ) : (
              <div className="mt-2">
                {queueTopics.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col items-stretch gap-1.5 py-[9px] sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="text-[13.5px] font-medium sm:w-[190px] sm:shrink-0">
                      {t.name}
                      {t.coverage_score === 0 && (
                        <span className="ml-1.5 inline-block align-middle">
                          <Badge tone="muted">still blank</Badge>
                        </span>
                      )}
                    </span>
                    <div className="flex-1">
                      <CoverageBar value={t.coverage_score} low={t.coverage_score > 0 && t.coverage_score < LOW_COVERAGE} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {suggestedTopics.length > 0 && (
              <div className="mt-3.5">
                <div className={navLabel} style={{ padding: "0 0 8px" }}>
                  Suggested after the last session
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {suggestedTopics.map((t) => (
                    <PromoteChip key={t.id} topicId={t.id} name={t.name} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card className="px-[22px] py-5">
            <h3>What Anna knows</h3>
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

          <Card className="px-[22px] py-5">
            <h3>Export</h3>
            <p className="text-[13px] text-muted">
              Take everything Anna has learned with you — nothing is locked in.
            </p>
            <ExportCard seriesId={series.id} />
          </Card>

          <VaultCard seriesId={series.id} link={vaultLink} />
        </div>
      </div>

      <StoryBar
        seriesId={series.id}
        talkHref={
          series.subject_user_id == null
            ? `/app/series/${series.id}/handoff`
            : `/app/series/${series.id}/interview`
        }
      />
    </div>
  );
}
