"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { StoryRail, type RailStory } from "./StoryRail";

/**
 * The story a rail tap selected on the home dashboard, shared between the
 * layout-owned rail strip (which sets it) and MobileHome (which reads it) —
 * both live under different parts of the tree, so plain props can't connect
 * them. Null until the first tap; consumers fall back to the server-derived
 * initial story.
 */
const ActiveStoryContext = createContext<{
  activeId: string | null;
  setActiveId: (id: string) => void;
}>({ activeId: null, setActiveId: () => {} });

export function useActiveStory() {
  return useContext(ActiveStoryContext);
}

export function ActiveStoryProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <ActiveStoryContext.Provider value={{ activeId, setActiveId }}>
      {children}
    </ActiveStoryContext.Provider>
  );
}

/**
 * The dark full-bleed story-rail strip under the mobile top nav. Lives in the
 * /app layout so it stays mounted across navigations — tapping a circle only
 * re-renders the page below, never this strip. Which circle is ringed comes
 * from the URL client-side: the series detail route rings that series, the
 * series list rings "All series", and home rings the story the dashboard is
 * showing (switched instantly in client state, no navigation).
 *
 * Renders only on the screens that carry circles today — home, the series
 * list, and series detail; every other route returns null.
 */
export function AppRailStrip({
  stories,
  canCreate,
  showOnHome,
}: {
  stories: RailStory[];
  canCreate: boolean;
  /** False when /app renders the interviewee home, which has no rail. */
  showOnHome: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeId, setActiveId } = useActiveStory();

  const detailMatch = pathname.match(/^\/app\/series\/([^/]+)$/);
  const detailId = detailMatch && detailMatch[1] !== "new" ? detailMatch[1] : null;
  const onHome = pathname === "/app";
  const onList = pathname === "/app/series";
  if (!(onList || detailId !== null || (onHome && showOnHome))) return null;

  const homeActiveId = activeId ?? searchParams.get("story") ?? stories[0]?.id ?? null;

  // Same instant switch MobileHome used to own: swap the dashboard story in
  // client state and keep ?story= shareable via replaceState (no navigation).
  function selectStory(id: string) {
    setActiveId(id);
    window.history.replaceState(window.history.state, "", `/app?story=${id}`);
  }

  // pt-5 balances the strip: 20px top − the rail's own -mt-2/pt-1 nets the
  // same 16px above the circles as the 16px below the labels.
  return (
    <div
      className={
        "bg-dark px-5 pb-2 pt-5 lg:hidden" +
        // On series detail the dark header continues below (mockup 5), so the
        // strip draws the divider between rail and header content.
        (detailId !== null ? " border-b border-dark-line" : "")
      }
    >
      <StoryRail
        tone="dark"
        linkBase="series"
        stories={stories}
        activeId={onHome ? homeActiveId : detailId}
        canCreate={canCreate}
        showAllLink
        allActive={onList}
        onSelect={onHome ? selectStory : undefined}
      />
    </div>
  );
}
