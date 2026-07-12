// Exported so other staleness checks (e.g. the operator console, see
// src/db/queries/admin.ts) can reuse the same threshold instead of drifting.
export const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 86_400_000;

export type Staleness = { stale: boolean; label: string };

function relativeDaysLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * Freshness of a series' most recent session, for the home/series-list cards
 * and the series detail head. Three exact labels (per the Task 7 brief):
 * never interviewed → "no sessions yet"; fresh → "last session <relative>";
 * stale (14+ days since the last session) → "going stale — interview soon".
 */
export function staleness(lastSessionAt: Date | null, now: Date): Staleness {
  if (!lastSessionAt) {
    return { stale: false, label: "no sessions yet" };
  }

  const diffDays = Math.floor((now.getTime() - lastSessionAt.getTime()) / MS_PER_DAY);

  if (diffDays >= STALE_AFTER_DAYS) {
    return { stale: true, label: "going stale — interview soon" };
  }

  return { stale: false, label: `last session ${relativeDaysLabel(diffDays)}` };
}
