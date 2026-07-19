import { StoryBar } from "@/components/nav/StoryBar";
import { storyTalkHref } from "@/lib/story-talk-href";
import { getSeries, getViewer } from "@/db/queries";

/**
 * Series segment layout: renders the floating story bar ONCE for every screen
 * under /app/series/[id], so it survives navigation between the overview,
 * insights, and settings screens instead of unmounting with each page. The
 * live interview screen covers it with its own full-screen z-50 stage, so it
 * needs no special casing here.
 *
 * Pages still do their own auth + notFound handling — if the series isn't
 * visible to this viewer the bar is simply dropped and the page's own
 * handling decides what renders.
 */
export default async function SeriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organization } = await getViewer();
  const series = organization ? await getSeries(supabase, id) : null;

  return (
    <>
      {children}
      {series && (
        <StoryBar
          seriesId={series.id}
          title={series.title}
          talkHref={storyTalkHref(series.id, series.subject_user_id)}
        />
      )}
    </>
  );
}
