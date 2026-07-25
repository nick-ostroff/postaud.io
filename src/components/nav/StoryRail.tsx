import Link from "next/link";

export type RailStory = {
  id: string;
  title: string;
  /** Public URL of the series photo; the circle falls back to initials without it. */
  photoUrl?: string | null;
  /** Red dot on the avatar — this story has questions waiting (it's gone stale). */
  waiting?: boolean;
};

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * The story rail (Home mockup 1a/1b) — circular avatars under the top nav,
 * one per series, the active one ringed. With `onSelect` the whole dashboard
 * is already loaded, so tapping switches the active story in client state
 * instantly (no navigation); without it each avatar is a plain link back to
 * `/app?story=<id>` that re-renders the page on the server.
 */
export function StoryRail({
  stories,
  activeId,
  canCreate = false,
  showAllLink = false,
  allActive = false,
  tone = "paper",
  linkBase = "home",
  onSelect,
}: {
  stories: RailStory[];
  activeId: string | null;
  canCreate?: boolean;
  /** Leading "All series" circle → the /app/series card grid. The rail is the
   * only series nav on phones (the sidebar is desktop-only), so without this
   * the mobile card view is unreachable. */
  showAllLink?: boolean;
  /** Ring the "All series" circle — the rail is being shown on the card-grid
   * view itself, so that's the current "story". */
  allActive?: boolean;
  /** "dark" restyles rings/labels for --dark surfaces (series-detail header). */
  tone?: "paper" | "dark";
  /** Where a circle tap lands (when not using `onSelect`): "home" swaps the
   * story on the /app dashboard; "series" opens that series' detail screen —
   * used on the list + detail pages so switching never changes layout family. */
  linkBase?: "home" | "series";
  /** Switch stories client-side instead of navigating. */
  onSelect?: (id: string) => void;
}) {
  const dark = tone === "dark";
  const ring = dark
    ? "ring-2 ring-mint ring-offset-2 ring-offset-dark"
    : "ring-2 ring-green ring-offset-2 ring-offset-paper";
  const circleHover = dark
    ? "group-hover:border-mint group-hover:text-mint"
    : "group-hover:border-green group-hover:text-green-deep";
  const labelActive = dark ? "font-semibold text-paper" : "font-semibold text-ink";
  const labelIdle = dark
    ? "text-dark-muted transition-colors duration-150 group-hover:text-paper"
    : "text-muted transition-colors duration-150 group-hover:text-ink";
  const avatarClass = "group flex shrink-0 flex-col items-center gap-1.5 hover:no-underline";
  return (
    <nav aria-label="Your stories" className="-mx-5 -mt-2 flex gap-4 overflow-x-auto px-5 pb-2 pt-1">
      {showAllLink && (
        <Link href="/app/series" aria-current={allActive ? "page" : undefined} className={avatarClass}>
          <span
            className={
              `grid h-[66px] w-[66px] place-items-center rounded-full border-[1.5px] transition duration-150 ease-out group-hover:scale-105 ${circleHover} ` +
              (dark ? "border-dark-line bg-[rgba(247,245,240,0.06)] " : "border-line-strong bg-card ") +
              (allActive
                ? `${dark ? "text-mint" : "text-green-deep"} ${ring}`
                : dark
                  ? "text-dark-muted"
                  : "text-faint")
            }
          >
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
              <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
              <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
              <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
            </svg>
          </span>
          <span className={"max-w-[74px] truncate text-[11px] leading-tight " + (allActive ? labelActive : labelIdle)}>
            All series
          </span>
        </Link>
      )}
      {stories.map((s) => {
        const active = s.id === activeId;
        const inner = (
          <>
            <span
              className={
                "relative grid h-[66px] w-[66px] place-items-center rounded-full bg-green-tint text-lg font-semibold text-green-deep transition-transform duration-150 ease-out group-hover:scale-105 " +
                (active ? ring : "")
              }
            >
              {s.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initials(s.title)
              )}
              {s.waiting && (
                <span
                  className={`absolute -right-px -top-px h-3 w-3 rounded-full border-2 bg-[oklch(0.62_0.16_25)] ${dark ? "border-dark" : "border-paper"}`}
                />
              )}
            </span>
            <span className={"max-w-[74px] truncate text-[11px] leading-tight " + (active ? labelActive : labelIdle)}>
              {s.title}
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={active ? "true" : undefined}
            className={avatarClass}
          >
            {inner}
          </button>
        ) : (
          <Link
            key={s.id}
            href={linkBase === "series" ? `/app/series/${s.id}` : `/app?story=${s.id}`}
            aria-current={active ? "true" : undefined}
            className={avatarClass}
          >
            {inner}
          </Link>
        );
      })}

      {canCreate && (
        <Link
          href="/app/series/new"
          className="group flex shrink-0 flex-col items-center gap-1.5 hover:no-underline"
        >
          <span
            className={`grid h-[66px] w-[66px] place-items-center rounded-full border-[1.5px] border-dashed text-2xl font-normal transition duration-150 ease-out group-hover:scale-105 ${circleHover} ${
              dark ? "border-dark-line text-dark-muted" : "border-line-strong text-faint"
            }`}
          >
            ＋
          </span>
          <span className={`text-[11px] leading-tight ${dark ? "text-dark-muted" : "text-muted"}`}>New</span>
        </Link>
      )}
    </nav>
  );
}
