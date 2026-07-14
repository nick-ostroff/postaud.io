import Link from "next/link";
import { getPlatformStats, listSeriesRegistry, type SeriesRegistryRow } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";

export const metadata = { title: "Series registry — Operator — PostAud.io" };

type SearchParams = Promise<{ q?: string; type?: string; offset?: string }>;

type SubjectFilter = "all" | "person" | "self" | "organization" | "no_account";

const TYPE_PILLS: Array<{ key: SubjectFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "person", label: "Person" },
  { key: "self", label: "Self" },
  { key: "organization", label: "Organization" },
  { key: "no_account", label: "No-account" },
];

function isSubjectFilter(v: string | undefined): v is SubjectFilter {
  return v === "all" || v === "person" || v === "self" || v === "organization" || v === "no_account";
}

const SERIES_COLS = "1fr 190px 130px 100px 100px 110px 150px";

function ActivityCell({ row }: { row: SeriesRegistryRow }) {
  if (row.stale) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-tint px-2.5 py-1 text-[11.5px] font-semibold text-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Stale — {relativeTime(row.lastActivity)}
      </span>
    );
  }
  return <span className="text-muted">{relativeTime(row.lastActivity)}</span>;
}

export default async function SeriesRegistryPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, type: typeParam, offset: offsetStr } = await searchParams;
  const type = isSubjectFilter(typeParam) ? typeParam : "all";
  const offset = Number.isFinite(Number(offsetStr)) && Number(offsetStr) > 0 ? Number(offsetStr) : 0;
  const pageSize = 50;

  const [stats, { rows, total }] = await Promise.all([
    getPlatformStats(),
    listSeriesRegistry({ search: q, subjectType: type, limit: pageSize, offset }),
  ]);

  function pillHref(key: SubjectFilter) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key !== "all") params.set("type", key);
    const qs = params.toString();
    return qs ? `/super/series?${qs}` : "/super/series";
  }

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type !== "all") params.set("type", type);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/super/series?${qs}` : "/super/series";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-ink">Series registry</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {stats.activeSeries.toLocaleString()} active series across all accounts — titles and counts only.
          </p>
        </div>
        <span className="rounded-full bg-ink/8 px-3 py-1.5 text-[11.5px] font-medium text-muted">
          Metadata only
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_PILLS.map((p) => (
            <Link
              key={p.key}
              href={pillHref(p.key)}
              className={
                p.key === type
                  ? "rounded-full border border-green/40 bg-green-tint px-3.5 py-1.5 text-[12.5px] font-semibold text-green-deep"
                  : "rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-paper-2"
              }
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="ml-auto w-full max-w-xs sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search series or owner…"
            className="w-full rounded-[10px] border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-green focus:outline-none focus:ring-1 focus:ring-green"
          />
          {type !== "all" && <input type="hidden" name="type" value={type} />}
        </form>
      </div>

      {/* Desktop (lg+): full table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white lg:block">
        <div
          className="grid min-w-[1080px] items-center gap-x-3.5 border-b border-line px-[18px] py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
          style={{ gridTemplateColumns: SERIES_COLS }}
        >
          <div>Series</div>
          <div>Owner</div>
          <div>Subject</div>
          <div>Sessions</div>
          <div>Facts</div>
          <div>Members</div>
          <div>Last activity</div>
        </div>
        {rows.length === 0 && (
          <div className="px-[18px] py-12 text-center text-[13px] text-muted">No series match.</div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid min-w-[1080px] items-center gap-x-3.5 border-b border-line px-[18px] py-3.5 text-[12.5px] last:border-b-0 hover:bg-paper-2"
            style={{ gridTemplateColumns: SERIES_COLS }}
          >
            <div className="truncate font-serif text-[15px] text-ink">{r.title}</div>
            <Link
              href={`/super/accounts/${r.organizationId}`}
              className="truncate text-ink-soft hover:text-green-deep"
            >
              {r.organizationName}
            </Link>
            <div className="text-muted">{r.subjectDisplay}</div>
            <div className="font-serif text-[14px] tabular-nums text-ink">{r.sessions}</div>
            <div className="font-mono text-[12px] font-medium tabular-nums text-ink-soft">
              {r.facts.toLocaleString()}
            </div>
            <div className="tabular-nums text-muted">{r.membersWithAccess}</div>
            <div>
              <ActivityCell row={r} />
            </div>
          </div>
        ))}
      </div>

      {/* Mobile (<lg): stacked cards */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {rows.length === 0 && (
          <div className="rounded-xl border border-line bg-white px-4 py-10 text-center text-[13px] text-muted">
            No series match.
          </div>
        )}
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/super/accounts/${r.organizationId}`}
            className="flex flex-col gap-1.5 rounded-xl border border-line bg-white px-4 py-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 truncate font-serif text-[15px] text-ink">{r.title}</div>
              <div className="flex-none font-mono text-[12px] font-medium tabular-nums text-ink-soft">
                {r.facts.toLocaleString()} facts
              </div>
            </div>
            <div className="truncate text-[12px] text-muted">
              {r.organizationName} · {r.subjectDisplay} · {r.sessions} session{r.sessions === 1 ? "" : "s"} ·{" "}
              {r.membersWithAccess} member{r.membersWithAccess === 1 ? "" : "s"} ·{" "}
              {r.stale ? (
                <span className="font-medium text-amber">stale, {relativeTime(r.lastActivity)}</span>
              ) : (
                relativeTime(r.lastActivity)
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} active series · sorted by
          last activity
        </div>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={pageHref(Math.max(0, offset - pageSize))}
              className="rounded-lg border border-line-strong px-3 py-1.5 font-medium text-ink-soft hover:bg-paper-2"
            >
              Previous
            </Link>
          )}
          {offset + rows.length < total && (
            <Link
              href={pageHref(offset + pageSize)}
              className="rounded-lg border border-line-strong px-3 py-1.5 font-medium text-ink-soft hover:bg-paper-2"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
