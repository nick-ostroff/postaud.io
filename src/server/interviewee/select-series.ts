import type { Series } from "@/db/types";
import type { SeriesSummary } from "@/db/queries";

/**
 * Which series the interviewee home screen should center on, when a viewer
 * is the subject of more than one active series: the single series if
 * there's only one, otherwise whichever was interviewed most recently
 * (series never interviewed sort last).
 */
export function pickIntervieweeSeries(
  series: Series[],
  summaries: Record<string, SeriesSummary>,
): Series | null {
  if (series.length === 0) return null;
  if (series.length === 1) return series[0];

  return [...series].sort((a, b) => {
    const aTime = timeOf(summaries[a.id]?.lastSessionAt ?? null);
    const bTime = timeOf(summaries[b.id]?.lastSessionAt ?? null);
    return bTime - aTime;
  })[0];
}

function timeOf(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}
