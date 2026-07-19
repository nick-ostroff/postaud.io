import Link from "next/link";

/**
 * The Talk destination for a series: stories whose subject has no account go
 * through the hand-the-mic flow; the rest go straight to the live interview.
 * Shared by every screen that renders the StoryBar so the ternary lives once.
 */
export function storyTalkHref(
  seriesId: string,
  subjectUserId: string | null,
): string {
  return subjectUserId == null
    ? `/app/series/${seriesId}/handoff`
    : `/app/series/${seriesId}/interview`;
}

/**
 * The floating story bar (Home mockup 1a) — a compact dark pill carrying the
 * story's title and its three actions: Talk (the primary, in green), Insights
 * (the knowledge base) and Settings (the series settings page). It's scoped to
 * one series, so it only renders on screens that have a story in hand —
 * the overview, insights, and settings screens — and the title doubles as the
 * way back to the overview from the subpages. Account-level screens (profile,
 * members) drop it. Mobile-only — the desktop sidebar plus each page's own
 * buttons already cover this.
 */
export function StoryBar({
  seriesId,
  title,
  talkHref,
  talkLabel = "Talk",
  active,
}: {
  seriesId: string;
  /** Series title shown in the pill, linking back to the series overview. */
  title: string;
  talkHref: string;
  talkLabel?: string;
  /** Which section this bar is rendered on — brightens that icon. */
  active?: "insights" | "settings";
}) {
  const idleIcon = "text-[rgba(240,237,230,0.75)] hover:text-paper";
  const activeIcon = "bg-[rgba(240,237,230,0.14)] text-paper";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(22px,env(safe-area-inset-bottom))] lg:hidden">
      <div className="pointer-events-auto flex flex-col items-center rounded-[26px] bg-dark p-1.5 shadow-pop">
        <div className="flex items-center gap-1">
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
            aria-current={active === "insights" ? "page" : undefined}
            className={`grid h-[38px] w-[38px] place-items-center rounded-full text-[15px] hover:no-underline ${
              active === "insights" ? activeIcon : idleIcon
            }`}
          >
            <span aria-hidden>✦</span>
          </Link>
          <Link
            href={`/app/series/${seriesId}/settings`}
            aria-label="Story settings"
            aria-current={active === "settings" ? "page" : undefined}
            className={`grid h-[38px] w-[38px] place-items-center rounded-full hover:no-underline ${
              active === "settings" ? activeIcon : idleIcon
            }`}
          >
            <span
              aria-hidden
              className="block h-[15px] w-[15px] rounded-full border-[1.6px] border-current"
            />
          </Link>
        </div>
        <Link
          href={`/app/series/${seriesId}`}
          className="max-w-[176px] truncate px-3 pb-1 pt-0.5 text-[11px] font-medium text-[rgba(240,237,230,0.7)] hover:text-paper hover:no-underline"
        >
          {title}
        </Link>
      </div>
    </div>
  );
}
