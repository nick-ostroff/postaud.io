import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CoverageBar } from "@/components/ui/CoverageBar";
import {
  getSeries,
  getSeriesAccessSummary,
  getSeriesKnowledge,
  getSeriesSummaries,
  getViewer,
  listInterviewsForSeries,
} from "@/db/queries";
import { PromoteChip } from "./PromoteChip";

/** Coverage below this reads as amber — matches the card grid's threshold. */
const LOW_COVERAGE = 0.4;

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
  const { supabase } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  const [summaries, knowledge, sessions, access] = await Promise.all([
    getSeriesSummaries(supabase, [id]),
    getSeriesKnowledge(supabase, id),
    listInterviewsForSeries(supabase, id),
    getSeriesAccessSummary(supabase, id),
  ]);

  const summary = summaries[id];

  const queueTopics = knowledge.topics
    .filter((t) => !t.suggested)
    .sort((a, b) => a.position - b.position);
  const suggestedTopics = knowledge.topics.filter((t) => t.suggested);

  const people = knowledge.entities.filter((e) => e.kind === "person");
  // Entities of kind 'date' double as timeline anchors (name = the year/date
  // label, detail = what happened) — sorted lexicographically, which works
  // for same-length year strings; take the last 3 for "3 latest".
  const timeline = knowledge.entities
    .filter((e) => e.kind === "date")
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-3);

  const subjectSubtitle = series.subject_relationship
    ? `${series.subject_name} · ${series.subject_relationship}`
    : series.subject_name;

  return (
    <div>
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
              <Avatar name={series.subject_name} size="md" tone="plain" />
              {subjectSubtitle}
            </Chip>
            <Chip kicker="covered">
              <span className="inline-block w-16">
                <CoverageBar value={summary.meanCoverage} low={summary.meanCoverage < LOW_COVERAGE} />
              </span>
            </Chip>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href={`/app/series/${series.id}/access`}>
            <Button variant="ghost">Access</Button>
          </Link>
          {series.subject_user_id == null && (
            <Link href={`/app/series/${series.id}/handoff`}>
              <Button variant="secondary">Hand the mic</Button>
            </Link>
          )}
          <Link href={`/app/series/${series.id}/interview`}>
            <Button variant="primary" size="big">
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
                {sessions.length === 0 ? "none yet" : `${sessions.length} so far`}
              </span>
            </div>

            {sessions.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted">
                No sessions yet — start the first interview to begin filling this in.
              </p>
            ) : (
              <div className="mt-1">
                {sessions.map((s) => {
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
                      </div>
                      <div className="serif mt-1 text-[14.5px] leading-[1.5] text-ink-soft">
                        {s.summaryShort ?? "Summary pending — check back soon."}
                      </div>
                    </div>
                  );
                })}
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
                  <div key={t.id} className="flex items-center gap-3 py-[9px]">
                    <span className="w-[190px] shrink-0 text-[13.5px] font-medium">
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
                      <div className="serif text-[15px]">{t.detail}</div>
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
                    <Avatar name={a.name} tone={a.badge === "owner" ? "green" : "plain"} />
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
              <Link href={`/app/series/${series.id}/access`} className="text-[13px] font-medium">
                Manage access →
              </Link>
            </div>
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Export</h3>
            <p className="text-[13px] text-muted">
              Take everything Anna has learned with you — nothing is locked in.
            </p>
            <Button variant="secondary" className="mt-2" disabled title="Export controls arrive soon">
              ↧ Markdown / text
            </Button>
            <div className="mt-1.5 text-xs text-faint">Real export controls are on the way.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
