import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CoverageBar } from "@/components/ui/CoverageBar";
import type { Series } from "@/db/types";
import type { SeriesSummary } from "@/db/queries";
import { staleness } from "@/server/series/staleness";

/** Coverage below this reads as amber in the bar — matches the detail page's
 * topic-queue rows so "needs attention" means the same thing everywhere. */
const LOW_COVERAGE = 0.4;

function subjectLine(series: Series): string {
  if (series.subject_relationship) return `${series.subject_name} · ${series.subject_relationship}`;
  if (series.subject_kind === "organization") return `${series.subject_name} · an organization`;
  if (series.subject_kind === "self") return `${series.subject_name} · interviews themself`;
  return series.subject_name;
}

/**
 * A single series card — shared between the workspace home grid and the
 * `/app/series` list so the two never drift out of sync (per the Task 7
 * brief: "list = same cards as home").
 */
export function SeriesCard({ series, summary }: { series: Series; summary: SeriesSummary }) {
  const { stale, label } = staleness(
    summary.lastSessionAt ? new Date(summary.lastSessionAt) : null,
    new Date(),
  );
  const memoriesWord = summary.memoriesCount === 1 ? "memory" : "memories";
  const sessionsWord = summary.sessionsCount === 1 ? "session" : "sessions";

  return (
    <Link href={`/app/series/${series.id}`} className="block">
      <Card className="h-full px-[22px] py-5 transition-colors hover:border-line-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="serif truncate text-[19px]">{series.title}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted">{subjectLine(series)}</div>
          </div>
          {stale && (
            <Badge tone="amber">
              <span aria-hidden>●</span> {label}
            </Badge>
          )}
        </div>
        <div className="mt-2.5">
          <CoverageBar value={summary.meanCoverage} low={summary.meanCoverage < LOW_COVERAGE} />
        </div>
        <div className="mt-[9px] flex items-center justify-between gap-2.5 text-[12.5px] text-muted">
          <span>
            {summary.memoriesCount} {memoriesWord} · {summary.sessionsCount} {sessionsWord}
          </span>
          {!stale && <span className="text-faint">{label}</span>}
        </div>
      </Card>
    </Link>
  );
}
