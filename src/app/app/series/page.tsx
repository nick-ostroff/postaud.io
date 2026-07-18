import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SeriesCard } from "@/components/series/SeriesCard";
import { getSeriesForUser, getSeriesSummaries, getViewer } from "@/db/queries";

/** Same cards as the home grid (Task 7 brief) — every series this viewer can
 * see (RLS-scoped), without the stat tiles. */
export default async function SeriesListPage() {
  const { supabase, organization, role } = await getViewer();
  const allSeries = organization ? await getSeriesForUser(supabase) : [];
  const series = allSeries.filter((s) => s.status !== "archived");
  const summaries = await getSeriesSummaries(supabase, series.map((s) => s.id));

  return (
    <div>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">Series</h1>
          <div className="mt-[3px] text-[13.5px] text-muted">Every story your workspace is building.</div>
        </div>
        <Link href="/app/series/new" className="hover:no-underline">
          <Button variant="primary">＋ New series</Button>
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
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} summary={summaries[s.id]} showSettings={role === "admin"} />
          ))}
        </div>
      )}
    </div>
  );
}
