import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CoverageBar } from "@/components/ui/CoverageBar";
import {
  getSeries,
  getSeriesKnowledge,
  getSeriesSummaries,
  getViewer,
  listInterviewsForSeries,
  type SeriesKnowledge,
} from "@/db/queries";
import { staleness } from "@/server/series/staleness";
import { PromoteChip } from "../PromoteChip";

/** Coverage below this reads as amber — matches the hub + card-grid threshold (Task 7 convention). */
const LOW_COVERAGE = 0.4;

const navLabel = "text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint";

type Params = Promise<{ id: string }>;

type VisibleFact = SeriesKnowledge["facts"][number];

/**
 * Facts worth showing as "saved knowledge" — everything not superseded.
 * needs_review/retell_queued facts still count (saved knowledge, just
 * flagged) — same rule as getSeriesSummaries/getInterviewFacts, so the hub
 * and this page always agree on the memory count.
 */
function visibleFacts(facts: SeriesKnowledge["facts"]): VisibleFact[] {
  return facts.filter((f) => f.status !== "superseded");
}

function formatOffset(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function KnowledgePage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  const [summaries, knowledge, sessions] = await Promise.all([
    getSeriesSummaries(supabase, [id]),
    getSeriesKnowledge(supabase, id),
    listInterviewsForSeries(supabase, id),
  ]);
  const summary = summaries[id];

  const facts = visibleFacts(knowledge.facts);
  const memoriesCount = facts.length;
  const memoriesWord = memoriesCount === 1 ? "memory" : "memories";

  const queueTopics = knowledge.topics
    .filter((t) => !t.suggested)
    .sort((a, b) => a.position - b.position);
  const suggestedTopics = knowledge.topics.filter((t) => t.suggested);
  const blankTopics = queueTopics.filter((t) => t.coverage_score === 0);

  const people = knowledge.entities.filter((e) => e.kind === "person");
  const places = knowledge.entities.filter((e) => e.kind === "place");

  // Timeline: date entities joined to their facts via fact_entities, sorted
  // lexically by name (dates like "1975" / "spring 1975" sort well enough as
  // a heuristic). Each item's text is the linked fact's statement — the most
  // recently created fact touching that date, since `facts` here is already
  // newest-first — falling back to the entity's own `detail` if somehow no
  // visible fact references it.
  const factsByDateEntity = new Map<string, VisibleFact[]>();
  for (const f of facts) {
    for (const e of f.entities) {
      if (e.kind !== "date") continue;
      const bucket = factsByDateEntity.get(e.id) ?? [];
      bucket.push(f);
      factsByDateEntity.set(e.id, bucket);
    }
  }
  const timeline = knowledge.entities
    .filter((e) => e.kind === "date")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      id: e.id,
      year: e.name,
      statement: factsByDateEntity.get(e.id)?.[0]?.statement ?? e.detail,
    }))
    .filter((t) => t.statement);

  const needsReviewFacts = knowledge.facts.filter((f) => f.status === "needs_review");
  const topicNameById = new Map(knowledge.topics.map((t) => [t.id, t.name] as const));
  const sessionNumberById = new Map(sessions.map((s) => [s.id, s.sessionNumber] as const));

  const { stale, label: freshnessLabel } = staleness(
    summary.lastSessionAt ? new Date(summary.lastSessionAt) : null,
    new Date(),
  );
  const sessionsWord = summary.sessionsCount === 1 ? "session" : "sessions";

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
        /{" "}
        <Link href={`/app/series/${series.id}`} className="text-muted">
          {series.title}
        </Link>{" "}
        / Knowledge
      </div>

      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">What we know so far</h1>
          <p className="mt-1 text-[13px] text-muted">
            {series.title} · {series.subject_name} · {summary.sessionsCount} {sessionsWord}
          </p>
        </div>
        <Badge tone={stale ? "amber" : "green"}>
          <span aria-hidden>●</span> {freshnessLabel}
        </Badge>
      </div>

      <Card className="mb-3.5 px-[22px] py-5">
        <p className="serif text-[26px] leading-[1.2]">
          <b className="font-semibold text-green-deep">
            {memoriesCount} {memoriesWord}
          </b>{" "}
          saved for the family.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-6 text-[13px] text-muted">
          <span>
            <b className="font-semibold text-ink">{queueTopics.length}</b> topics
          </span>
          <span>
            <b className="font-semibold text-ink">{people.length}</b> people ·{" "}
            <b className="font-semibold text-ink">{places.length}</b> places
          </span>
          {timeline.length > 0 && (
            <span>
              <b className="font-semibold text-ink">{timeline.length}</b> timeline moments,{" "}
              {timeline[0].year} → {timeline[timeline.length - 1].year}
            </span>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-3.5">
          <Card className="px-[22px] py-5">
            <h3>Coverage</h3>
            <p className="mb-2 text-[13px] text-muted">
              How much of each topic Anna has explored so far.
            </p>

            {queueTopics.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                No topics yet — they&apos;ll show up here once the first session runs.
              </p>
            ) : (
              <div>
                {queueTopics.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col items-stretch gap-1.5 py-[7px] sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="text-[13.5px] font-medium sm:w-[210px] sm:shrink-0">
                      {t.name}
                      {t.coverage_score === 0 && (
                        <span className="ml-1.5 inline-block align-middle">
                          <Badge tone="muted">still blank</Badge>
                        </span>
                      )}
                    </span>
                    <div className="flex-1">
                      <CoverageBar value={t.coverage_score} low={t.coverage_score < LOW_COVERAGE} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {blankTopics.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone="amber">still blank</Badge>
                <span className="text-[12.5px] text-muted">
                  Anna hasn&apos;t touched {blankTopics.map((t) => t.name).join(", ")} yet — nudge{" "}
                  {blankTopics.length === 1 ? "it" : "them"} up the queue for the next session.
                </span>
              </div>
            )}
          </Card>

          <Card className="px-[22px] py-5">
            <h3>People</h3>
            <p className="mb-1 text-[13px] text-muted">
              Everyone who keeps coming up in {series.subject_name}&apos;s stories.
            </p>
            {people.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">No one identified yet.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <Chip key={p.id}>
                    {p.name}
                    {p.detail && (
                      <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">{p.detail}</span>
                    )}
                  </Chip>
                ))}
              </div>
            )}

            <div className={navLabel} style={{ padding: "16px 0 8px" }}>
              Places
            </div>
            {places.length === 0 ? (
              <p className="text-[13.5px] text-muted">No places identified yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <Chip key={p.id}>{p.name}</Chip>
                ))}
              </div>
            )}
          </Card>

          <Card className="px-[22px] py-5">
            <h3 className="mb-2">Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                No timeline moments yet — dates Anna hears about will show up here.
              </p>
            ) : (
              <div className="relative pl-[22px] before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-[1.5px] before:bg-line-strong before:content-['']">
                {timeline.map((t) => (
                  <div key={t.id} className="relative pb-[18px] last:pb-1">
                    <div className="absolute -left-[22px] top-[5px] h-[11px] w-[11px] rounded-full border-[2.5px] border-paper bg-green" />
                    <div className="text-[11.5px] font-bold tracking-[0.08em] text-green-deep">{t.year}</div>
                    <div className="serif text-[15px]">{t.statement}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card className="px-[22px] py-5">
            <h3>Where to go next</h3>
            <p className="mb-1 text-[13px] text-muted">Suggested from the last few sessions.</p>
            {suggestedTopics.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">
                No new suggestions yet — they&apos;ll show up after the next session.
              </p>
            ) : (
              <div className="mt-1 mb-3 flex flex-wrap items-center gap-2">
                {suggestedTopics.map((t) => (
                  <PromoteChip key={t.id} topicId={t.id} name={t.name} />
                ))}
              </div>
            )}
            <Link href={`/app/series/${series.id}`}>
              <Button variant="secondary" className="w-full justify-center">
                Open the topic queue
              </Button>
            </Link>
          </Card>

          {needsReviewFacts.length > 0 && (
            <Card className="px-[22px] py-5">
              <Badge tone="amber">
                {needsReviewFacts.length} needs review
              </Badge>
              <div className="mt-2.5">
                {needsReviewFacts.map((f) => {
                  const meta = [
                    (f.topic_id && topicNameById.get(f.topic_id)) || null,
                    f.source_interview_id && sessionNumberById.get(f.source_interview_id)
                      ? `Session ${sessionNumberById.get(f.source_interview_id)}`
                      : null,
                    formatOffset(f.audio_offset_sec),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={f.id} className="flex gap-2.5 border-b border-line py-2.5 last:border-b-0 last:pb-0">
                      <span aria-hidden className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-amber" />
                      <div>
                        <div className="serif text-[14px] leading-[1.5]">{f.statement}</div>
                        {meta && <div className="mt-0.5 text-[11.5px] text-faint">{meta}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link href="/app/memories" className="mt-2.5 inline-block text-[13px] font-medium">
                Review it →
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
