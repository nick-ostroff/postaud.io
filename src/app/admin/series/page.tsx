import Link from "next/link";
import { getPlatformStats, listSeriesRegistry } from "@/db/queries/admin";
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
    return qs ? `/admin/series?${qs}` : "/admin/series";
  }

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type !== "all") params.set("type", type);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/admin/series?${qs}` : "/admin/series";
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">Series registry</h1>
          <p className="mt-1 text-[13.5px] text-neutral-500">
            {stats.activeSeries.toLocaleString()} active series across all accounts. Titles and counts only — no
            content.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11.5px] font-medium text-neutral-600 dark:bg-white/5 dark:text-neutral-400">
          Metadata only
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_PILLS.map((p) => (
            <Link
              key={p.key}
              href={pillHref(p.key)}
              className={
                p.key === type
                  ? "rounded-full border border-emerald-600/40 bg-emerald-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300"
                  : "rounded-full border border-neutral-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
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
            placeholder="Search series or accounts…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-[#1c1c1e] dark:text-white"
          />
          {type !== "all" && <input type="hidden" name="type" value={type} />}
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#111]">
        <table className="w-full min-w-[920px] text-[13.5px]">
          <thead className="bg-neutral-50 text-left text-neutral-600 dark:bg-[#161616] dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Series</th>
              <th className="px-4 py-3 font-medium">Subject type</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Facts</th>
              <th className="px-4 py-3 font-medium">Members w/ access</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-neutral-500">
                  No series match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-[#161616]">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/accounts/${r.organizationId}`}
                    className="text-neutral-700 hover:text-emerald-700 dark:text-neutral-300 dark:hover:text-emerald-400"
                  >
                    {r.organizationName}
                  </Link>
                </td>
                <td className="px-4 py-3 font-serif text-[15px] text-neutral-900 dark:text-white">{r.title}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11.5px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                    {r.subjectDisplay}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">{r.sessions}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">{r.facts}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">{r.membersWithAccess}</td>
                <td className="px-4 py-3">
                  {r.stale ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" /> Stale — {relativeTime(r.lastActivity)}
                    </span>
                  ) : (
                    <span className="text-neutral-500">{relativeTime(r.lastActivity)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-neutral-500">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} active series · sorted by
          last activity
        </div>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={pageHref(Math.max(0, offset - pageSize))}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-[#161616]"
            >
              Previous
            </Link>
          )}
          {offset + rows.length < total && (
            <Link
              href={pageHref(offset + pageSize)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-[#161616]"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
