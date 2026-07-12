import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  getInterview,
  getInterviewFacts,
  getInterviewSummary,
  getSeries,
  getSeriesKnowledge,
  getViewer,
  listInterviewsForSeries,
} from "@/db/queries";
import { pickNewestSuggestedTopic } from "@/server/topics/pick";
import { ProcessingRecap } from "./ProcessingRecap";

type Params = Promise<{ id: string }>;

function formatAudioOffset(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `audio ${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The post-session recap ("What we heard today", mockup #1e) — the
 * interviewee's one and only stop after "I'm done for today". Access is the
 * same `can_view_series` RLS every knowledge-base read uses (via
 * `getInterview` + `getSeries`), so anyone who can see the series can see
 * its recaps, not only whoever conducted this particular session.
 *
 * Pre-Task-12 (and for a while after any real session), the pipeline hasn't
 * written `interview_summaries` yet — that state renders a warm "still
 * writing this up" placeholder via the client `ProcessingRecap`, which
 * polls with `router.refresh()`, while any facts that already landed still
 * show in "Saved today" underneath (there may be none yet).
 */
export default async function RecapPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const interview = await getInterview(supabase, id);
  if (!interview) notFound();

  const series = await getSeries(supabase, interview.series_id);
  if (!series) notFound();

  const [summary, facts, knowledge, sessions] = await Promise.all([
    getInterviewSummary(supabase, id),
    getInterviewFacts(supabase, id),
    getSeriesKnowledge(supabase, series.id),
    listInterviewsForSeries(supabase, series.id),
  ]);

  const session = sessions.find((s) => s.id === id) ?? null;
  const durationLabel =
    session?.durationSec != null ? `${Math.round(session.durationSec / 60)} minutes` : null;
  const sessionLabel = session ? `Session ${session.sessionNumber}` : "This session";

  const nextTopic = pickNewestSuggestedTopic(knowledge.topics);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-1 pb-4 pt-2">
      <h1 className="text-[27px]">What we heard today</h1>
      <p className="text-[13px] text-muted">
        {sessionLabel}
        {durationLabel ? ` · ${durationLabel} with Anna` : " · with Anna"}
      </p>

      <div className="mt-3">
        {summary ? (
          <p className="serif text-[16px] leading-[1.55] text-ink-soft">{summary.short}</p>
        ) : (
          <ProcessingRecap />
        )}
      </div>

      <div className="mb-1 mt-7 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
        Saved today
      </div>
      {facts.length === 0 ? (
        <p className="text-[13.5px] text-muted">
          Nothing saved here yet — check back once Anna finishes writing this session up.
        </p>
      ) : (
        <Card className="px-4 py-1">
          {facts.map((f) => {
            const meta = [f.topicName, formatAudioOffset(f.audioOffsetSec)].filter(Boolean).join(" · ");
            return (
              <div key={f.id} className="flex gap-2.5 border-b border-line py-3 last:border-b-0">
                <span aria-hidden className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-green" />
                <div>
                  <div className="serif text-[14.5px] italic leading-[1.5]">{f.statement}</div>
                  {meta && <div className="mt-0.5 text-[11.5px] text-faint">{meta}</div>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {nextTopic && (
        <div className="mt-4 rounded-card border border-green-tint bg-green-tint px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-green-deep">Next time</div>
          <div className="serif mt-1 text-[15.5px]">Next time, Anna would love to hear about {nextTopic.name}.</div>
        </div>
      )}

      <Link href="/app" className="mt-7">
        <Button variant="primary" size="big" className="w-full justify-center">
          Done
        </Button>
      </Link>
    </div>
  );
}
