import Link from "next/link";

export type RailStory = {
  id: string;
  title: string;
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
 * one per series, the active one ringed. Tapping one repaints the whole
 * dashboard: it's a plain link back to `/app?story=<id>`, so switching is a
 * server render with no client state to keep in sync.
 */
export function StoryRail({
  stories,
  activeId,
  canCreate = false,
}: {
  stories: RailStory[];
  activeId: string | null;
  canCreate?: boolean;
}) {
  return (
    <nav aria-label="Your stories" className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-1 pt-4">
      {stories.map((s) => {
        const active = s.id === activeId;
        return (
          <Link
            key={s.id}
            href={`/app?story=${s.id}`}
            aria-current={active ? "true" : undefined}
            className="flex shrink-0 flex-col items-center gap-1.5 hover:no-underline"
          >
            <span
              className={
                "relative grid h-[52px] w-[52px] place-items-center rounded-full bg-green-tint text-base font-semibold text-green-deep " +
                (active ? "ring-2 ring-green ring-offset-2 ring-offset-paper" : "")
              }
            >
              {initials(s.title)}
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
