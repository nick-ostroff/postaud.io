import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StoryRail } from "@/components/nav/StoryRail";
import { ReorderableSeriesGrid } from "@/components/series/ReorderableSeriesGrid";
import { SeriesCard } from "@/components/series/SeriesCard";
import { getSeriesForUser, getSeriesSummaries, getViewer } from "@/db/queries";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import { staleness } from "@/server/series/staleness";

/** Same cards as the home grid (Task 7 brief) — every series this viewer can
 * see (RLS-scoped), without the stat tiles. */
export default async function SeriesListPage() {
  const { supabase, organization, role } = await getViewer();
  const allSeries = organization ? await getSeriesForUser(supabase) : [];
  const series = allSeries.filter((s) => s.status !== "archived");
  const summaries = await getSeriesSummaries(supabase, series.map((s) => s.id));
  const memoriesTotal = series.reduce((sum, s) => sum + (summaries[s.id]?.memoriesCount ?? 0), 0);

  // The rail is the only series nav on phones, so it stays on screen here too —
  // same circles as home, with "All series" ringed as the current view.
  const now = new Date();
  const railStories = series.map((s) => ({
    id: s.id,
    title: s.title,
    photoUrl: subjectPhotoUrl(s),
    waiting: staleness(
      summaries[s.id]?.lastSessionAt ? new Date(summaries[s.id].lastSessionAt as string) : null,
      now,
    ).stale,
  }));

  return (
    <div>
      <div className="lg:hidden">
        <StoryRail
          stories={railStories}
          activeId={null}
          canCreate={role === "admin"}
          showAllLink
          allActive
        />
      </div>

      <div className="mb-2 text-[12.5px] text-faint">
        <Link href="/app" className="text-muted">
          Home
        </Link>{" "}
        / Series
      </div>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">Series</h1>
          <div className="mt-[3px] text-[13.5px] text-muted">
            {series.length} {series.length === 1 ? "story" : "stories"} · {memoriesTotal}{" "}
            {memoriesTotal === 1 ? "memory" : "memories"}
          </div>
        </div>
        <Link href="/app/series/new" className="hover:no-underline">
          <Button variant="primary">＋ New</Button>
        </Link>
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
        <ReorderableSeriesGrid
          canReorder={role === "admin"}
          items={series.map((s) => ({
            id: s.id,
            card: <SeriesCard series={s} summary={summaries[s.id]} showSettings={role === "admin"} />,
          }))}
        />
      )}
    </div>
  );
}
