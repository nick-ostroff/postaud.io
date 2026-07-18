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
  onSelect,
}: {
  stories: RailStory[];
  activeId: string | null;
  canCreate?: boolean;
  /** Switch stories client-side instead of navigating. */
  onSelect?: (id: string) => void;
}) {
  const avatarClass = "flex shrink-0 flex-col items-center gap-1.5 hover:no-underline";
  return (
    <nav aria-label="Your stories" className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-1 pt-4">
      {stories.map((s) => {
        const active = s.id === activeId;
        const inner = (
          <>
            <span
              className={
                "relative grid h-[52px] w-[52px] place-items-center rounded-full bg-green-tint text-base font-semibold text-green-deep " +
                (active ? "ring-2 ring-green ring-offset-2 ring-offset-paper" : "")
              }
            >
              {s.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initials(s.title)
              )}
              {s.waiting && (
                <span className="absolute -right-px -top-px h-3 w-3 rounded-full border-2 border-paper bg-[oklch(0.62_0.16_25)]" />
              )}
            </span>
            <span
              className={
                "max-w-[60px] truncate text-[10.5px] leading-tight " +
                (active ? "font-semibold text-ink" : "text-muted")
              }
            >
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
            href={`/app?story=${s.id}`}
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
          className="flex shrink-0 flex-col items-center gap-1.5 hover:no-underline"
        >
          <span className="grid h-[52px] w-[52px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-xl font-normal text-faint">
            ＋
          </span>
          <span className="text-[10.5px] leading-tight text-muted">New</span>
        </Link>
      )}
    </nav>
  );
}
