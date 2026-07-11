import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SeriesCard } from "@/components/series/SeriesCard";
import { getSeriesForUser, getSeriesSummaries, getViewer, listMembers } from "@/db/queries";

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardHome() {
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

  // TODO(Task 11): a non-admin who is the subject of exactly one active
  // series gets a dedicated one-job "interviewee home" instead of this grid
  // — built in Task 11. Until then everyone (admins and members alike) sees
  // the standard grid below, which RLS already scopes to what this viewer
  // can see, so nothing is exposed early.
  const soleActiveSubjectSeries = series.filter(
    (s) => s.status === "active" && s.subject_user_id === user.id,
  );
  const isSoleIntervieweeHome = role !== "admin" && soleActiveSubjectSeries.length === 1;

  const storyWord = series.length === 1 ? "story" : "stories";
  const subtitle = isSoleIntervieweeHome
    ? "Your story, in progress."
    : `The ${organization?.name ?? "workspace"} workspace — ${series.length} ${storyWord} in motion.`;

  return (
    <div>
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
  );
}
