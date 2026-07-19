"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Talk destination for a series: stories whose subject has no account go
 * through the hand-the-mic flow; the rest go straight to the live interview.
 * Shared by every screen that renders the StoryBar so the ternary lives once.
 */
export function storyTalkHref(seriesId: string, subjectUserId: string | null): string {
  return subjectUserId == null
    ? `/app/series/${seriesId}/handoff`
    : `/app/series/${seriesId}/interview`;
}

/**
 * The floating story bar (Home mockup 1a) — a compact dark pill carrying the
 * story's three actions: Talk (the primary, in green), Insights (the
 * knowledge base) and Settings (the series settings page), with the story's
 * title on its own line below so the action row never changes size. It's
 * scoped to one series: the series segment layout renders it once so it
 * persists across the overview/insights/settings screens, and the mobile home
 * renders it for the active story. Account-level screens (profile, members)
 * drop it. The icon for the section currently on screen is brightened — a
 * client component so it can read the pathname itself. Mobile-only — the
 * desktop sidebar plus each page's own buttons already cover this.
 */
export function StoryBar({
  seriesId,
  title,
  talkHref,
  talkLabel = "Talk",
}: {
  seriesId: string;
  /** Series title shown under the actions, linking back to the series overview. */
  title: string;
  talkHref: string;
  talkLabel?: string;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith(`/app/series/${seriesId}/knowledge`)
    ? "insights"
    : pathname.startsWith(`/app/series/${seriesId}/settings`)
      ? "settings"
      : null;
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
