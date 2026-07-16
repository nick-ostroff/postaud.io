import type { MemoryRow, SeriesAccessRow, SeriesSummary } from "@/db/queries";
import type { Series, Topic } from "@/db/types";
import { pickPersonalPromptTopic } from "@/server/topics/pick";

/** Recent memories shown on the mobile dashboard before "All memories →". */
export const RECENT_MEMORIES = 2;

export type MobileStory = {
  id: string;
  title: string;
  /** "about Marta · grandmother" */
  subtitle: string;
  memoriesCount: number;
  coveragePct: number;
  sharedCount: number;
  sessionsCount: number;
  /** The topic Anna wants next — drives the "Next up" line on the continue card. */
  nextTopic: string | null;
  recentMemories: string[];
  /** Subject has no account: the owner starts the session by handing them the phone. */
  handoff: boolean;
};

/**
 * Assemble the mobile dashboard's view of one story from its already-fetched
 * pieces. Pure so the whole rail can be built server-side up front and switched
 * client-side with no per-tap round-trip — see {@link ../MobileHome}.
 */
export function buildMobileStory({
  series,
  summary,
  topics,
  access,
  memories,
  viewerUserId,
}: {
  series: Series;
  summary: SeriesSummary;
  topics: Topic[];
  access: SeriesAccessRow[];
  /** This series' memories, newest first. */
  memories: MemoryRow[];
  viewerUserId: string;
}): MobileStory {
  const isOwnStory = series.subject_kind === "self" || series.subject_user_id === viewerUserId;
  return {
    id: series.id,
    title: series.title,
    subtitle: isOwnStory
      ? "about you"
      : [`about ${series.subject_name}`, series.subject_relationship].filter(Boolean).join(" · "),
    memoriesCount: summary.memoriesCount,
    coveragePct: Math.round(summary.meanCoverage * 100),
    // The owner is always in the access summary — "shared" counts everyone else.
    sharedCount: Math.max(0, access.length - 1),
    sessionsCount: summary.sessionsCount,
    nextTopic: pickPersonalPromptTopic(topics)?.name ?? null,
    recentMemories: memories.slice(0, RECENT_MEMORIES).map((m) => m.statement),
    handoff: series.subject_user_id == null,
  };
}
