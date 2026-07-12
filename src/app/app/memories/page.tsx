import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import {
  getMemoriesForSeries,
  getSeriesForUser,
  getSubjectSeries,
  getViewer,
  type MemoryRow,
} from "@/db/queries";

type SearchParams = Promise<{ filter?: string; series?: string }>;

const FILTERS = [
  { value: "newest", label: "Newest" },
  { value: "people", label: "People" },
  { value: "places", label: "Places" },
  { value: "needs_review", label: "Needs review" },
] as const;
type FilterValue = (typeof FILTERS)[number]["value"];

function isFilterValue(v: string | undefined): v is FilterValue {
  return FILTERS.some((f) => f.value === v);
}

/** "today" / "3 days ago" / "2 weeks ago" / "4 months ago" — same register as staleness.ts's relative labels. */
function relativeDate(iso: string, now: Date): string {
  const diffDays = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 14) return `${diffDays} days ago`;
  if (diffDays < 56) {
    const weeks = Math.round(diffDays / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  const months = Math.round(diffDays / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function filterHref(filterValue: FilterValue, seriesId: string | null): string {
  const params = new URLSearchParams();
  if (filterValue !== "newest") params.set("filter", filterValue);
  if (seriesId) params.set("series", seriesId);
  const qs = params.toString();
  return `/app/memories${qs ? `?${qs}` : ""}`;
}

function applyFilter(memories: MemoryRow[], filter: FilterValue): MemoryRow[] {
  if (filter === "people") return memories.filter((m) => m.hasPerson);
  if (filter === "places") return memories.filter((m) => m.hasPlace);
  if (filter === "needs_review") return memories.filter((m) => m.status === "needs_review");
  return memories;
}

/**
 * "Your memories — in your own words" (mockup #1f) — the interviewee's full
 * memory list. A non-admin caller sees every series they're the subject of
 * (usually just one); an admin isn't a subject of anything, so they get a
 * series switcher (`?series=`) instead, browsing one series' memories at a
 * time. Filter pills are plain links (`?filter=`) — this stays a server
 * component, no client-side state needed for the list itself.
 */
export default async function MemoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter: rawFilter, series: seriesParam } = await searchParams;
  const filter: FilterValue = isFilterValue(rawFilter) ? rawFilter : "newest";

  const { user, supabase, role } = await getViewer();
  const isAdmin = role === "admin";

  let seriesIds: string[] = [];
  let seriesOptions: { id: string; title: string }[] = [];
  let activeSeriesId: string | null = null;
  let heading = "Your memories — in your own words";

  if (isAdmin) {
    const allSeries = (await getSeriesForUser(supabase)).filter((s) => s.status !== "archived");
    seriesOptions = allSeries.map((s) => ({ id: s.id, title: s.title }));
    const requested = seriesParam ? allSeries.find((s) => s.id === seriesParam) : undefined;
    const active = requested ?? allSeries[0] ?? null;
    activeSeriesId = active?.id ?? null;
    seriesIds = active ? [active.id] : [];
    heading = active ? `${active.subject_name}'s memories — in their own words` : "Memories";
  } else {
    const subjectSeries = await getSubjectSeries(supabase, user.id);
    seriesIds = subjectSeries.map((s) => s.id);
  }

  const memories = await getMemoriesForSeries(supabase, seriesIds);
  const filtered = applyFilter(memories, filter);
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-1 pb-4 pt-2">
      <h1 className="text-[24px] leading-[1.25]">{heading}</h1>

      {isAdmin && seriesOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {seriesOptions.map((s) => {
            const on = s.id === activeSeriesId;
            return (
              <Link
                key={s.id}
                href={filterHref(filter, s.id)}
                className={
                  "rounded-pill px-3 py-1 text-[12.5px] font-medium " +
                  (on
                    ? "bg-green-tint text-green-deep font-semibold"
                    : "border border-line-strong bg-card text-muted hover:text-ink hover:no-underline")
                }
              >
                {s.title}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-1 mt-3.5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <Link
              key={f.value}
              href={filterHref(f.value, activeSeriesId)}
              className={
                "rounded-pill px-3.5 py-1.5 text-[13px] font-medium " +
                (on
                  ? "bg-green-tint text-green-deep font-semibold"
                  : "border border-line-strong bg-card text-muted hover:text-ink hover:no-underline")
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted">
          {memories.length === 0
            ? "Nothing saved here yet — memories will show up as sessions are recorded."
            : "Nothing matches this filter yet."}
        </p>
      ) : (
        <div>
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={`/app/memories/${m.id}`}
              className="flex items-start gap-2.5 border-b border-line py-3.5 last:border-b-0 hover:bg-[rgba(33,30,26,0.02)] hover:no-underline"
            >
              <div className="flex-1">
                <div className="serif text-[15px] italic leading-[1.5] text-ink">{m.statement}</div>
                <div className="mt-[5px] flex flex-wrap items-center gap-1.5 text-[11.5px] text-faint">
                  {m.status === "needs_review" && (
                    <Badge tone="amber">
                      <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-current" />
                      needs review
                    </Badge>
                  )}
                  <span>
                    {[m.topicName, relativeDate(m.createdAt, now)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>
              <span aria-hidden className="pt-[3px] text-[13px] text-faint">
                ▸
              </span>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-3.5 text-center text-[13px] text-faint">
        {memories.length} {memories.length === 1 ? "memory" : "memories"} saved so far.
      </p>
    </div>
  );
}
