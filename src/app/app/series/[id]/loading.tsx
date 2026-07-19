/**
 * Instant loading state for everything under /app/series/[id] — the hub plus
 * knowledge, settings and interview. Every page here blocks on several
 * Supabase round trips (getViewer → getSeries → per-page queries), and
 * without this file a StoryBar tap gives zero feedback until the server
 * finishes rendering. Next prefetches this fallback with the link, so
 * navigation swaps to the skeleton immediately while the real page streams
 * in.
 */
export default function SeriesLoading() {
  return (
    <div className="animate-pulse" aria-busy>
      <div className="mb-2 h-[15px] w-40 rounded bg-paper-2" />
      <div className="h-8 w-64 max-w-full rounded bg-paper-2" />
      <div className="mt-2 h-[15px] w-52 max-w-full rounded bg-paper-2" />

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[74px] rounded-card border border-line bg-card" />
        ))}
      </div>

      <div className="mt-[18px] flex flex-col gap-[18px]">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-card border border-line bg-card px-[22px] py-5">
            <div className="h-5 w-36 rounded bg-paper-2" />
            <div className="mt-3 h-[14px] w-full rounded bg-paper-2" />
            <div className="mt-2 h-[14px] w-3/4 rounded bg-paper-2" />
            <div className="mt-2 h-[14px] w-5/6 rounded bg-paper-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
