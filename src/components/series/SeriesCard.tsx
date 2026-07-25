import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Series } from "@/db/types";
import type { SeriesSummary, SeriesWithSubject } from "@/db/queries";
import { personaFor } from "@/lib/voices";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import { staleness } from "@/server/series/staleness";

const MODE_LABELS: Record<string, string> = { flow: "Flow", quickfire: "Quick fire", ritual: "Ritual" };

/** "Ellis · Flow · self-interview" — who asks, how, and who answers. */
function subtitleLine(series: Series): string {
  const persona = personaFor(series.voice);
  // Legacy deep rows read as Flow — deep is no longer a selectable mode.
  const mode = MODE_LABELS[series.conversation_mode] ?? "Flow";
  const subject =
    series.subject_kind === "self"
      ? "self-interview"
      : series.subject_relationship || series.subject_name;
  return `${persona.name} · ${mode} · ${subject}`;
}

/** Total talk time, compact for the stats row: whole minutes, "14 min". */
function talkLabel(sec: number): string | null {
  if (sec <= 0) return null;
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

/**
 * A single series card (mockup 4a: richer cards, no percentage) — shared
 * between the workspace home grid and the `/app/series` list so the two never
 * drift out of sync (per the Task 7 brief: "list = same cards as home").
 *
 * The card click is a stretched overlay link rather than a wrapping anchor,
 * so the admin-only settings kebab and the "Talk ›" action can be real links
 * of their own (nested anchors are invalid HTML) — they sit above the overlay
 * via z-index.
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
  const questionsWord = summary.questionsWaiting === 1 ? "question" : "questions";
  const talk = talkLabel(summary.talkSec);

  return (
    <Card className="relative flex h-full flex-col px-[22px] py-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={series.subject_name} size="lg" tone="plain" src={subjectPhotoUrl(series)} />
          <div className="min-w-0">
            <div className="serif truncate text-[19px]">{series.title}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted">{subtitleLine(series)}</div>
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
              <svg aria-hidden viewBox="0 0 19 19" fill="currentColor" className="h-[17px] w-[17px]">
                <circle cx="9.5" cy="4" r="1.5" />
                <circle cx="9.5" cy="9.5" r="1.5" />
                <circle cx="9.5" cy="15" r="1.5" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3.5 border-t border-line pt-3">
        <div className="text-[13px] text-muted">
          <span className="font-semibold text-ink">
            {summary.sessionsCount} {sessionsWord}
          </span>
          {talk && <> · {talk}</>}
          {" · "}
          {summary.memoriesCount} {memoriesWord}
        </div>
        <div className="mt-1 text-[12.5px] text-faint">
          {summary.lastSessionAt ? (
            <>
              Last · <LocalTime iso={summary.lastSessionAt} />
            </>
          ) : (
            "No sessions yet"
          )}
        </div>
      </div>

      {summary.questionsWaiting > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-line pt-3">
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-green-deep">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[oklch(0.62_0.16_25)]" />
            {summary.questionsWaiting} {questionsWord} waiting
          </span>
          <Link
            href={`/app/series/${series.id}/interview`}
            className="relative z-10 text-[13.5px] font-semibold"
          >
            Talk ›
          </Link>
        </div>
      )}

      <Link href={`/app/series/${series.id}`} className="absolute inset-0" aria-label={series.title} />
    </Card>
  );
}
