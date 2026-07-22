import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ConversationMode } from "@/db/types";
import { getSeries, getViewer, listPendingQueuedQuestions } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { canInterviewSeries } from "@/server/interviews/access";
import { StartInterviewError, startInterview } from "@/server/interviews/start";
import { LiveInterview } from "./LiveInterview";

type Params = Promise<{ id: string }>;
type Search = Promise<{ handoff?: string; mode?: string }>;

const MODES = ["deep", "flow", "quickfire"] as const;
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

  const requestedMode = parseMode(modeParam);

  // "Ask me each time" → a pre-talk chooser before any mic/session setup.
  // An explicit ?mode= (picker choice, or the queue page's "Answer these now")
  // bypasses it.
  if (series.ask_mode_each_time && !requestedMode) {
    return <ModePicker seriesId={series.id} handoff={isHandoff} defaultMode={series.conversation_mode} />;
  }

  const mode: ConversationMode = requestedMode ?? series.conversation_mode;

  let interviewId: string;
  try {
    const started = await startInterview(serviceClient(), {
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
      handoff={isHandoff}
      mode={mode}
      pendingQueue={pendingQueue}
    />
  );
}

const MODE_CARDS: { mode: ConversationMode; title: string; blurb: string }[] = [
  { mode: "deep", title: "Deep dive", blurb: "A full guided conversation — follow the thread wherever it goes." },
  { mode: "flow", title: "Flow", blurb: "Answer, then choose where to go next. Save follow-ups for later." },
  { mode: "quickfire", title: "Quick fire", blurb: "One question after another from your queue and topics." },
];

function ModePicker({
  seriesId,
  handoff,
  defaultMode,
}: {
  seriesId: string;
  handoff: boolean;
  defaultMode: ConversationMode;
}) {
  const suffix = handoff ? "&handoff=1" : "";
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center font-serif text-[26px]">How do you want to talk today?</h1>
        <div className="mt-5 flex flex-col gap-3">
          {MODE_CARDS.map((c) => (
            <Link key={c.mode} href={`/app/series/${seriesId}/interview?mode=${c.mode}${suffix}`}>
              <Card
                className={`px-5 py-4 transition-colors hover:border-green-deep/50 ${
                  c.mode === defaultMode ? "border-green-deep/40 border-[1.5px]" : ""
                }`}
              >
                <div className="text-[15px] font-semibold">
                  {c.title}
                  {c.mode === defaultMode ? (
                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-green-deep">
                      default
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[13px] text-muted">{c.blurb}</div>
              </Card>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-center">
          <Link href={`/app/series/${seriesId}`} className="text-[13px] font-medium text-muted">
            Back to the series
          </Link>
        </p>
      </div>
    </div>
  );
}

function OutOfCreditsCard({ seriesId, topUpHref }: { seriesId: string; topUpHref: string | null }) {
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
            ? "Top up to keep the conversations going — everything Anna has already learned is safe and waiting."
            : "Everything Anna has already learned is safe and waiting — get in touch and we'll add more."}
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
