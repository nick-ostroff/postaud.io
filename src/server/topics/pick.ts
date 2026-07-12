import type { Topic } from "@/db/types";

/**
 * The least-covered must-cover topic (excludes AI-suggested ones, which
 * aren't confirmed yet) — the thing Anna most needs to explore next.
 */
export function pickLowestCoverageMustCoverTopic(topics: Topic[]): Topic | null {
  const candidates = topics.filter((t) => t.must_cover && !t.suggested);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.coverage_score - b.coverage_score)[0];
}

/** The most recently created AI-suggested topic (proposed after the last session). */
export function pickNewestSuggestedTopic(topics: Topic[]): Topic | null {
  const candidates = topics.filter((t) => t.suggested);
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

/**
 * The interviewee home screen's personal prompt topic ("Sam would love to
 * hear about …"): prefer the least-covered thing Anna still needs to ask
 * about, falling back to whatever she suggested exploring next after the
 * last session. Null means there's nothing to anchor a specific prompt to —
 * the caller falls back to a generic invitation.
 */
export function pickPersonalPromptTopic(topics: Topic[]): Topic | null {
  return pickLowestCoverageMustCoverTopic(topics) ?? pickNewestSuggestedTopic(topics);
}
