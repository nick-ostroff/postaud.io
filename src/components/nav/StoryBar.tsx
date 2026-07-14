import Link from "next/link";

/**
 * The floating story bar (Home mockup 1a) — a compact dark pill carrying the
 * story's three actions: Talk (the primary, in green), Insights (the
 * knowledge base) and Settings (access). It's scoped to one series, so it
 * only renders on screens that have a story in hand; account-level screens
 * (profile, members) drop it. Mobile-only — the desktop sidebar plus each
 * page's own buttons already cover this.
 */
export function StoryBar({
  seriesId,
  talkHref,
  talkLabel = "Talk",
}: {
  seriesId: string;
  talkHref: string;
  talkLabel?: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(22px,env(safe-area-inset-bottom))] lg:hidden">
      <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-dark p-1.5 shadow-pop">
        <Link
          href={talkHref}
          className="flex items-center gap-2 rounded-pill bg-green px-4 py-2.5 text-white hover:no-underline"
        >
          <span aria-hidden className="flex items-center gap-[1.5px]">
            <span className="block h-2 w-[2px] rounded-[1px] bg-white" />
            <span className="block h-3 w-[2px] rounded-[1px] bg-white" />
            <span className="block h-[7px] w-[2px] rounded-[1px] bg-white" />
          </span>
          <span className="text-[12.5px] font-semibold">{talkLabel}</span>
        </Link>
        <Link
          href={`/app/series/${seriesId}/knowledge`}
          aria-label="Insights"
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-[15px] text-[rgba(240,237,230,0.75)] hover:text-paper hover:no-underline"
        >
          <span aria-hidden>✦</span>
        </Link>
        <Link
          href={`/app/series/${seriesId}/access`}
          aria-label="Story settings"
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-[rgba(240,237,230,0.75)] hover:text-paper hover:no-underline"
        >
          <span aria-hidden className="block h-[15px] w-[15px] rounded-full border-[1.6px] border-current" />
        </Link>
      </div>
    </div>
  );
}
