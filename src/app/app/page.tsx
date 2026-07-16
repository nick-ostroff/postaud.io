import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SeriesCard } from "@/components/series/SeriesCard";
import {
  getMemoriesForSeries,
  getSeriesAccessSummary,
  getSeriesForUser,
  getSeriesKnowledge,
  getSeriesSummaries,
  getUserDisplayName,
  getViewer,
  listMembers,
} from "@/db/queries";
import { firstNameOf } from "@/lib/names";
import { pickIntervieweeSeries } from "@/server/interviewee/select-series";
import { staleness } from "@/server/series/staleness";
import { pickPersonalPromptTopic } from "@/server/topics/pick";
import { IntervieweeHome } from "./IntervieweeHome";
import { MobileHome } from "./MobileHome";
import { buildMobileStory, type MobileStory } from "./stories";

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type SearchParams = Promise<{ story?: string }>;

export default async function DashboardHome({ searchParams }: { searchParams: SearchParams }) {
  const { story: storyParam } = await searchParams;
  const { user, supabase, organization, role } = await getViewer();
  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "there";

  const allSeries = organization ? await getSeriesForUser(supabase) : [];
  const series = allSeries.filter((s) => s.status !== "archived");

  const [summaries, members] = await Promise.all([
    getSeriesSummaries(supabase, series.map((s) => s.id)),
    organization ? listMembers(supabase) : Promise.resolve([]),
  ]);

  const memoriesTotal = Object.values(summaries).reduce((sum, s) => sum + s.memoriesCount, 0);
  const sessionsThisMonth = Object.values(summaries).reduce((sum, s) => sum + s.sessionsThisMonth, 0);

  // A non-admin who is the subject of at least one active series gets a
  // dedicated one-job "interviewee home" instead of the workspace grid — if
  // they're the subject of several, whichever was interviewed most recently
  // wins. "Not today" dismisses that series for the rest of the day via a
  // cookie, falling through to the standard grid below (which RLS already
  // scopes to what this viewer can see, so nothing is exposed early).
  const intervieweeCandidates = series.filter(
    (s) => s.status === "active" && s.subject_user_id === user.id,
  );
  const isInterviewee = role !== "admin" && intervieweeCandidates.length > 0;

  if (isInterviewee) {
    const chosen = pickIntervieweeSeries(intervieweeCandidates, summaries);
    if (chosen) {
      const cookieStore = await cookies();
      const snoozed = cookieStore.get(`snooze-${chosen.id}`)?.value === "1";
      if (!snoozed) {
        const [knowledge, ownerName] = await Promise.all([
          getSeriesKnowledge(supabase, chosen.id),
          chosen.created_by ? getUserDisplayName(supabase, chosen.created_by) : Promise.resolve(null),
        ]);
        const promptTopic = pickPersonalPromptTopic(knowledge.topics);

        return (
          <IntervieweeHome
            name={name}
            seriesId={chosen.id}
            ownerFirstName={firstNameOf(ownerName) ?? "Your family"}
            topicName={promptTopic?.name ?? null}
            memoriesCount={summaries[chosen.id]?.memoriesCount ?? 0}
          />
        );
      }
    }
  }

  const storyWord = series.length === 1 ? "story" : "stories";
  const subtitle = `The ${organization?.name ?? "workspace"} workspace — ${series.length} ${storyWord} in motion.`;
  const isAdmin = role === "admin";

  // ---- the mobile dashboard ----
  // Build every story up front so the rail can switch between them client-side
  // with no per-tap server round-trip (see MobileHome). Memories come back in
  // one batched query and are grouped per series; knowledge + access are the
  // only per-series fetches, run in parallel.
  const now = new Date();
  const railStories = series.map((s) => ({
    id: s.id,
    title: s.title,
    waiting: staleness(
      summaries[s.id]?.lastSessionAt ? new Date(summaries[s.id].lastSessionAt as string) : null,
      now,
    ).stale,
  }));

  const allMemories = await getMemoriesForSeries(supabase, series.map((s) => s.id));
  const memoriesBySeries = new Map<string, typeof allMemories>();
  for (const m of allMemories) {
    const list = memoriesBySeries.get(m.seriesId);
    if (list) list.push(m);
    else memoriesBySeries.set(m.seriesId, [m]);
  }

  const mobileStories: MobileStory[] = await Promise.all(
    series.map(async (s) => {
      const [knowledge, access] = await Promise.all([
        getSeriesKnowledge(supabase, s.id),
        getSeriesAccessSummary(supabase, s.id),
      ]);
      return buildMobileStory({
        series: s,
        summary: summaries[s.id],
        topics: knowledge.topics,
        access,
        memories: memoriesBySeries.get(s.id) ?? [],
        viewerUserId: user.id,
      });
    }),
  );

  const initialStoryId =
    mobileStories.find((s) => s.id === storyParam)?.id ?? mobileStories[0]?.id ?? null;

  return (
    <div>
      <MobileHome
        railStories={railStories}
        stories={mobileStories}
        initialActiveId={initialStoryId}
        canCreate={isAdmin}
      />

      <div className="hidden lg:block">
      <div className="mb-[22px] flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">
            {greeting(new Date())}, {name}
          </h1>
          <div className="mt-[3px] text-[13.5px] text-muted">{subtitle}</div>
        </div>
        <Link href="/app/series/new">
          <Button variant="primary">＋ New series</Button>
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatTile n={String(series.length)} label="series" />
        <StatTile n={String(memoriesTotal)} label="memories saved" />
        <StatTile n={String(sessionsThisMonth)} label="sessions this month" />
        <StatTile n={String(members.length)} label="members" />
      </div>

      {series.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-8 py-16 text-center">
          <div className="serif text-xl">No series yet — create your first</div>
          <p className="max-w-sm text-[13.5px] text-muted">
            A series is one person&apos;s story. Set it up once and Anna runs the interviews from here.
          </p>
          <Link href="/app/series/new">
            <Button variant="primary" size="big" className="mt-2">
              ＋ New series
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} summary={summaries[s.id]} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
