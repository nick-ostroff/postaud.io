"use client";

import { useState } from "react";
import Link from "next/link";
import { StoryBar } from "@/components/nav/StoryBar";
import { StoryRail, type RailStory } from "@/components/nav/StoryRail";
import { SeriesPhotoEditor } from "@/components/series/SeriesPhotoEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MobileStory } from "./stories";

export type { MobileStory };

/**
 * The mobile home dashboard (Home mockup 1a/1b): the story rail switches
 * which story the whole screen is about, then a continue card, three roll-up
 * tiles, and the most recent memories — with the floating Talk bar scoped to
 * the selected story. The desktop card grid on `/app` is the same data, laid
 * out for a mouse; only one of the two is ever visible.
 *
 * Every story arrives fully built, so switching is instant client state — no
 * server round-trip per tap. The URL's `?story=` is kept in sync via
 * history.replaceState (no navigation) so a reload or shared link lands on the
 * same story.
 */
export function MobileHome({
  railStories,
  stories,
  initialActiveId,
  canCreate,
  canEditPhoto,
}: {
  railStories: RailStory[];
  stories: MobileStory[];
  initialActiveId: string | null;
  canCreate: boolean;
  /** Admins can tap the story avatar next to the title to add/change its photo. */
  canEditPhoto: boolean;
}) {
  const [activeId, setActiveId] = useState(initialActiveId);
  const active = stories.find((s) => s.id === activeId) ?? stories[0] ?? null;

  function selectStory(id: string) {
    setActiveId(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `/app?story=${id}`);
    }
  }

  return (
    <div className="lg:hidden">
      <StoryRail
        stories={railStories}
        activeId={active?.id ?? null}
        canCreate={canCreate}
        onSelect={selectStory}
      />

      {active === null ? (
        <Card className="mt-5 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="serif text-xl">No stories yet</div>
          <p className="text-[13.5px] text-muted">
            A story is one person&apos;s life, told over many conversations. Start one and Anna takes it from
            there.
          </p>
          {canCreate && (
            <Link href="/app/series/new" className="mt-1 hover:no-underline">
              <Button variant="primary" size="big">
                ＋ New series
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3 border-t border-line pt-4">
            <SeriesPhotoEditor
              key={active.id}
              seriesId={active.id}
              name={active.title}
              photoUrl={active.photoUrl}
              canEdit={canEditPhoto}
              size="lg"
            />
            <div>
              <h1 className="text-[23px]">{active.title}</h1>
              <div className="mt-0.5 text-xs text-muted">{active.subtitle}</div>
            </div>
          </div>

          <div className="mt-3.5 flex flex-col gap-3 rounded-[14px] border border-green-tint bg-green-tint p-4">
            <div className="text-xs text-ink-soft">
              {active.nextTopic
                ? `Next up · ${active.nextTopic}`
                : active.sessionsCount > 0
                  ? "Pick up wherever you left off"
                  : "The first conversation is the hardest to start — and the easiest to have"}
            </div>
            <Link
              href={
                active.handoff
                  ? `/app/series/${active.id}/handoff`
                  : `/app/series/${active.id}/interview`
              }
              className="flex items-center justify-center gap-2.5 rounded-pill bg-green py-3.5 text-[15px] font-semibold text-white hover:bg-green-deep hover:no-underline"
            >
              <span aria-hidden className="block h-2.5 w-2.5 rounded-[3px] bg-white" />
              {active.sessionsCount > 0 ? "Continue talking" : "Start talking"}
            </Link>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <MiniStat n={String(active.memoriesCount)} label="memories" />
            <MiniStat n={`${active.coveragePct}%`} label="covered" />
            <MiniStat
              n={active.sharedCount > 0 ? String(active.sharedCount) : "—"}
              label={active.sharedCount > 0 ? "shared" : "private"}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Recent memories
            </div>
            {active.recentMemories.length === 0 ? (
              <Card className="px-[15px] py-3 text-[13.5px] text-muted">
                Nothing saved yet — the first conversation changes that.
              </Card>
            ) : (
              active.recentMemories.map((m, i) => (
                <Card key={i} className="serif px-[15px] py-3 text-sm leading-[1.5]">
                  {m}
                </Card>
              ))
            )}
            <Link href="/app/memories" className="mt-1 text-[13px] font-medium text-green-deep">
              All memories →
            </Link>
          </div>

          <StoryBar
            seriesId={active.id}
            title={active.title}
            talkHref={
              active.handoff ? `/app/series/${active.id}/handoff` : `/app/series/${active.id}/interview`
            }
          />
        </>
      )}
    </div>
  );
}

function MiniStat({ n, label }: { n: string; label: string }) {
  return (
    <Card className="px-3 py-3 text-center shadow-none">
      <div className="serif text-[19px] leading-none">{n}</div>
      <div className="mt-1 text-[10.5px] text-muted">{label}</div>
    </Card>
  );
}
