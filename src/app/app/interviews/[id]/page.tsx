import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  getInterview,
  getInterviewFacts,
  getInterviewMessages,
  getInterviewSummary,
  getSeries,
  getSeriesKnowledge,
  getViewer,
  listInterviewsForSeries,
} from "@/db/queries";
import { pickNewestSuggestedTopic } from "@/server/topics/pick";
import { PromoteChip } from "../../series/[id]/PromoteChip";
import { ReprocessButton } from "../../series/[id]/ReprocessButton";

type Params = Promise<{ id: string }>;

/** Turns shown before the "Show all N turns" details wrapper kicks in. */
const VISIBLE_TURNS = 8;

function formatSessionDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "22 min" style — matches the series hub's session-list duration format. */
function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const mins = Math.round(sec / 60);
  return `${mins} min`;
}

function formatOffset(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Owner-facing results for one session (mockup #1e) — deeper than the
 * interviewee's `/interviews/[id]/recap`: the full transcript, every new
 * memory with its audio timestamp, and the suggested topics that came out
 * of it. Access follows the same `can_view_series` RLS as every other
 * knowledge-base read.
 */
export default async function InterviewResultsPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, role } = await getViewer();
  const isAdmin = role === "admin";

  const interview = await getInterview(supabase, id);
  if (!interview) notFound();

  const series = await getSeries(supabase, interview.series_id);
  if (!series) notFound();

  const [summary, facts, messages, knowledge, sessions] = await Promise.all([
    getInterviewSummary(supabase, id),
    getInterviewFacts(supabase, id),
    getInterviewMessages(supabase, id),
    getSeriesKnowledge(supabase, series.id),
    listInterviewsForSeries(supabase, series.id),
  ]);

  const session = sessions.find((s) => s.id === id) ?? null;
  const sessionLabel = session ? `Session ${session.sessionNumber}` : "Session";

  const headSub = [
    formatSessionDate(interview.started_at),
    formatDuration(interview.duration_sec),
    interview.audio_path ? "audio saved" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const suggestedTopics = knowledge.topics.filter((t) => t.suggested);
  const nextTopic = pickNewestSuggestedTopic(knowledge.topics);

  const firstTurns = messages.slice(0, VISIBLE_TURNS);
  const restTurns = messages.slice(VISIBLE_TURNS);

  const showProcessingNote = interview.status === "completed" && !!interview.process_error;

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
        / {sessionLabel}
      </div>

      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">{sessionLabel}</h1>
          {headSub && <p className="mt-1 text-[13px] text-muted">{headSub}</p>}
        </div>
        <Link href={`/app/series/${series.id}`}>
          <Button variant="ghost">← Back to {series.title}</Button>
        </Link>
      </div>

      {showProcessingNote && (
        <Card className="mb-3.5 border-amber-tint bg-amber-tint px-[22px] py-4">
          <div className="text-[13.5px] font-semibold text-amber">Processing hit a snag</div>
          <p className="mt-1 text-[13px] text-ink-soft">{interview.process_error}</p>
          {isAdmin && (
            <div className="mt-2">
              <ReprocessButton interviewId={interview.id} />
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-3.5">
          <Card className="px-[22px] py-5">
            <h3>What we heard</h3>
            {summary ? (
              <>
                <p className="serif mt-1.5 text-[17px] leading-[1.5]">{summary.short}</p>
                {Array.isArray(summary.bullets) && summary.bullets.length > 0 && (
                  <ul className="mt-3.5 flex flex-col gap-2">
                    {(summary.bullets as unknown[]).map((b, i) => (
                      <li key={i} className="relative pl-[20px] text-[13.5px] leading-[1.55] text-ink-soft">
                        <span
                          aria-hidden
                          className="absolute left-0.5 top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-green bg-green-tint"
                        />
                        {String(b)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="serif mt-1.5 text-[15px] leading-[1.5] text-ink-soft">
                Anna is still listening back and writing this session up — check back in a bit.
              </p>
            )}
          </Card>

          <Card className="px-[22px] py-5">
            <div className="flex items-center justify-between">
              <h3>
                {facts.length} new {facts.length === 1 ? "memory" : "memories"}
              </h3>
              {facts.length > 0 && <Badge>saved to {series.title}</Badge>}
            </div>
            {facts.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">No new memories from this session yet.</p>
            ) : (
              <div className="mt-1">
                {facts.map((f) => {
                  const meta = [f.topicName, formatOffset(f.audioOffsetSec) ? `▶ ${formatOffset(f.audioOffsetSec)}` : null]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={f.id} className="flex gap-2.5 border-b border-line py-3 last:border-b-0 last:pb-0">
                      <span aria-hidden className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-green" />
                      <div>
                        <div className="serif text-[14.5px] leading-[1.5]">{f.statement}</div>
                        {meta && <div className="mt-0.5 text-[11.5px] text-faint">{meta}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="px-[22px] py-5">
            <h3>Transcript</h3>
            {messages.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">No transcript recorded for this session.</p>
            ) : (
              <>
                <div className="mt-1">
                  {firstTurns.map((m) => (
                    <TurnRow key={m.id} message={m} subjectName={series.subject_name} />
                  ))}
                </div>
                {restTurns.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[13px] font-medium text-green-deep">
                      Show all {messages.length} turns ↓
                    </summary>
                    <div className="mt-1">
                      {restTurns.map((m) => (
                        <TurnRow key={m.id} message={m} subjectName={series.subject_name} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card className="px-[22px] py-5">
            <h3>Where to go next</h3>
            <p className="mb-1 text-[13px] text-muted">
              Topics Anna thinks are worth exploring — add them and she&apos;ll bring them up next time.
            </p>
            {suggestedTopics.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-muted">Nothing waiting to be explored — the queue is clear.</p>
            ) : (
              <div className="mt-1 mb-3 flex flex-wrap items-center gap-2">
                {suggestedTopics.map((t) => (
                  <PromoteChip key={t.id} topicId={t.id} name={t.name} />
                ))}
              </div>
            )}
            <Link href={`/app/series/${series.id}`}>
              <Button variant="primary" className="w-full justify-center">
                Open the topic queue
              </Button>
            </Link>
          </Card>

          {nextTopic && (
            <Card className="px-[22px] py-5">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Next time</div>
              <p className="spoken mt-1.5 text-[15px] leading-[1.5]">
                &ldquo;Next time, Anna would love to hear about {nextTopic.name}.&rdquo;
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TurnRow({
  message,
  subjectName,
}: {
  message: { id: string; role: "interviewer" | "subject"; text: string };
  subjectName: string;
}) {
  const isSubject = message.role === "subject";
  const who = isSubject ? subjectName : "Anna";
  return (
    <div className="border-b border-line py-2.5 last:border-b-0">
      <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">{who}</div>
      <p className={isSubject ? "spoken text-[14px] leading-[1.6]" : "text-[14px] leading-[1.6]"}>{message.text}</p>
    </div>
  );
}
