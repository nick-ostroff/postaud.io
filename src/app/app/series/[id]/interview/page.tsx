import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ConversationMode } from "@/db/types";
import { getSeries, getViewer, listPendingQueuedQuestions } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { canInterviewSeries } from "@/server/interviews/access";
import { personaFor } from "@/lib/voices";
import { StartInterviewError, startInterview } from "@/server/interviews/start";
import { LiveInterview } from "./LiveInterview";

type Params = Promise<{ id: string }>;
type Search = Promise<{ handoff?: string; mode?: string }>;

const MODES = ["flow", "quickfire"] as const;
function parseMode(raw: string | undefined): ConversationMode | null {
  return (MODES as readonly string[]).includes(raw ?? "") ? (raw as ConversationMode) : null;
}

/**
 * The live interview screen. Server component: verifies the caller can
 * interview this series, creates-or-resumes the in-progress interview row
 * (reusing Task 9's `startInterview` directly rather than round-tripping the
 * POST route), and hands the client component a session it can immediately
 * connect to. The 402 "no credits" case renders a warm top-up card instead of
 * dropping the user into a session that can't run.
 */
export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const { handoff, mode: modeParam } = await searchParams;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) notFound();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) notFound();

  const isHandoff = handoff === "1";

  // The mode comes from the series settings; an explicit ?mode= (the queue
  // page's "Answer these now") overrides it for that session. Deep mode is
  // retired — a stray legacy default coerces to flow rather than crashing.
  const seriesMode = series.conversation_mode === "deep" ? "flow" : series.conversation_mode;
  const mode: ConversationMode = parseMode(modeParam) ?? seriesMode;

  // Series-completion gate: a fixed session count or a total-minutes budget
  // ends the series once it's used up. A conductor with a session still
  // in_progress may always come back to finish it — the gate only stops NEW
  // sessions. Query failures skip the gate rather than blocking the start.
  const svc = serviceClient();
  const [doneRes, inProgressRes] = await Promise.all([
    svc
      .from("interviews")
      .select("duration_sec")
      .eq("series_id", series.id)
      .in("status", ["completed", "processed"]),
    svc
      .from("interviews")
      .select("id")
      .eq("series_id", series.id)
      .eq("conducted_by", user.id)
      .eq("status", "in_progress")
      .limit(1),
  ]);
  const doneRows = doneRes.error ? null : (doneRes.data ?? []);
  const hasResumable = !inProgressRes.error && (inProgressRes.data?.length ?? 0) > 0;
  if (doneRows && !hasResumable) {
    const usedSeconds = doneRows.reduce((sum, r) => sum + (r.duration_sec ?? 0), 0);
    const sessionsUsedUp = series.planned_sessions != null && doneRows.length >= series.planned_sessions;
    const timeUsedUp = series.total_minutes != null && usedSeconds >= series.total_minutes * 60;
    if (sessionsUsedUp || timeUsedUp) {
      return (
        <SeriesCompleteCard
          seriesId={series.id}
          interviewerName={personaFor(series.voice).name}
          reason={
            sessionsUsedUp
              ? `All ${series.planned_sessions} sessions are recorded.`
              : `All ${series.total_minutes} minutes of conversation time are used.`
          }
        />
      );
    }
  }

  let interviewId: string;
  try {
    const started = await startInterview(svc, {
      organizationId: organization.id,
      seriesId: series.id,
      conductedBy: user.id,
      handoff: isHandoff,
      creditsRemaining: organization.credits_remaining,
      mode,
    });
    interviewId = started.interviewId;
  } catch (err) {
    if (err instanceof StartInterviewError && err.code === "no_credits") {
      return (
        <OutOfCreditsCard
          seriesId={series.id}
          interviewerName={personaFor(series.voice).name}
          // Platform operators top up from the operator console; Stripe billing
          // is parked for V1, so everyone else gets an honest "not yet" instead
          // of a button that goes nowhere.
          topUpHref={(await isPlatformAdmin()) ? `/admin/accounts/${organization.id}/credits` : null}
        />
      );
    }
    throw err;
  }

  const pendingQueue = (await listPendingQueuedQuestions(supabase, series.id)).map((q) => ({
    id: q.id,
    text: q.text,
  }));

  return (
    <LiveInterview
      interviewId={interviewId}
      seriesId={series.id}
      seriesTitle={series.title}
      subjectName={series.subject_name}
      interviewerName={personaFor(series.voice).name}
      handoff={isHandoff}
      mode={mode}
      pendingQueue={pendingQueue}
    />
  );
}

function SeriesCompleteCard({
  seriesId,
  interviewerName,
  reason,
}: {
  seriesId: string;
  interviewerName: string;
  reason: string;
}) {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4">
      <Card className="max-w-md px-8 py-9 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-tint text-2xl">
          🎉
        </div>
        <h2 className="text-[22px]">This series is complete</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          {reason} Everything {interviewerName} learned is safe in the knowledge base. Want to keep
          going? Raise the total in the series settings.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2.5">
          <Link href={`/app/series/${seriesId}`}>
            <Button variant="primary" size="big">
              See the knowledge base
            </Button>
          </Link>
          <Link href={`/app/series/${seriesId}/settings`} className="text-[13px] font-medium text-muted">
            Series settings
          </Link>
        </div>
      </Card>
    </div>
  );
}

function OutOfCreditsCard({
  seriesId,
  interviewerName,
  topUpHref,
}: {
  seriesId: string;
  interviewerName: string;
  topUpHref: string | null;
}) {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4">
      <Card className="max-w-md px-8 py-9 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-tint text-2xl">
          ☕
        </div>
        <h2 className="text-[22px]">Out of interview credits</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          You&apos;ve used every interview credit on this workspace.{" "}
          {topUpHref
            ? `Top up to keep the conversations going — everything ${interviewerName} has already learned is safe and waiting.`
            : `Everything ${interviewerName} has already learned is safe and waiting — get in touch and we'll add more.`}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2.5">
          {topUpHref ? (
            <Link href={topUpHref}>
              <Button variant="primary" size="big">
                Top up credits
              </Button>
            </Link>
          ) : (
            <a href="mailto:hello@postaud.io?subject=More%20interview%20credits">
              <Button variant="primary" size="big">
                Ask for more credits
              </Button>
            </a>
          )}
          <Link href={`/app/series/${seriesId}`} className="text-[13px] font-medium text-muted">
            Back to the series
          </Link>
        </div>
      </Card>
    </div>
  );
}
