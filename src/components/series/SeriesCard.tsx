import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CoverageBar } from "@/components/ui/CoverageBar";
import type { Series } from "@/db/types";
import type { SeriesSummary, SeriesWithSubject } from "@/db/queries";
import { subjectPhotoUrl } from "@/server/series/photo-url";
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
 *
 * The card click is a stretched overlay link rather than a wrapping anchor,
 * so the admin-only settings gear can be a real link of its own (nested
 * anchors are invalid HTML) — it sits above the overlay via z-index.
 */
export function SeriesCard({
  series,
  summary,
  showSettings = false,
}: {
  series: SeriesWithSubject;
  summary: SeriesSummary;
  showSettings?: boolean;
}) {
  const { stale, label } = staleness(
    summary.lastSessionAt ? new Date(summary.lastSessionAt) : null,
    new Date(),
  );
  const memoriesWord = summary.memoriesCount === 1 ? "memory" : "memories";
  const sessionsWord = summary.sessionsCount === 1 ? "session" : "sessions";

  return (
    <Card className="relative h-full px-[22px] py-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={series.subject_name} size="lg" tone="plain" src={subjectPhotoUrl(series)} />
          <div className="min-w-0">
            <div className="serif truncate text-[19px]">{series.title}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted">{subjectLine(series)}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {stale && (
            <Badge tone="amber">
              <span aria-hidden>●</span> {label}
            </Badge>
          )}
          {showSettings && (
            <Link
              href={`/app/series/${series.id}/settings`}
              aria-label={`${series.title} settings`}
              className="relative z-10 -m-1.5 rounded-sm p-1.5 text-faint hover:bg-[rgba(33,30,26,0.06)] hover:text-ink"
            >
              {/* Same gear as the sidebar's Settings item (19×19 mockup icon set). */}
              <svg aria-hidden viewBox="0 0 19 19" fill="none" stroke="currentColor" className="h-[17px] w-[17px]">
                <circle cx="9.5" cy="9.5" r="2.6" strokeWidth="1.6" />
                <path d="M9.5 2.5v2.2m0 9.6v2.2m7-7h-2.2m-9.6 0H2.5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </Link>
          )}
        </div>
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
      <Link href={`/app/series/${series.id}`} className="absolute inset-0" aria-label={series.title} />
    </Card>
  );
}
