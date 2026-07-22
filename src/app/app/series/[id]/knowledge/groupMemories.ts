import type { SeriesKnowledge, SessionRow } from "@/db/queries";

type FactRow = SeriesKnowledge["facts"][number];

export type MemoryGroup = {
  key: string;
  label: string;
  /** Session start (ISO) for dated headers; null for the "Earlier" bucket. */
  startedAt: string | null;
  facts: FactRow[];
};

/**
 * Memories grouped by the session that captured them, newest session first.
 * `facts` arrives newest-first (getSeriesKnowledge order); within a session we
 * flip to oldest-first so each session reads in the order it was told — same
 * convention as the recap page's "Saved today" list. Facts whose session isn't
 * in `sessions` (deleted, or saved outside one) land in a trailing "Earlier"
 * group so nothing silently drops out of the list.
 */
export function groupMemoriesBySession(facts: FactRow[], sessions: SessionRow[]): MemoryGroup[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s] as const));

  const buckets = new Map<string | null, FactRow[]>();
  for (const f of facts) {
    const key = f.source_interview_id && sessionById.has(f.source_interview_id) ? f.source_interview_id : null;
    const bucket = buckets.get(key) ?? [];
    bucket.push(f);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([interviewId, group]) => {
      const session = interviewId ? sessionById.get(interviewId) : undefined;
      return {
        group: {
          key: interviewId ?? "earlier",
          label: session ? `Session ${session.sessionNumber}` : "Earlier",
          startedAt: session?.startedAt ?? null,
          facts: [...group].reverse(),
        },
        // 0 sorts the Earlier bucket after every real session.
        sessionNumber: session?.sessionNumber ?? 0,
      };
    })
    .sort((a, b) => b.sessionNumber - a.sessionNumber)
    .map((entry) => entry.group);
}
