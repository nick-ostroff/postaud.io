import Link from "next/link";
import { getPlatformStats, listAccountsConsole, type ActivityStatus } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";

export const metadata = { title: "Users & accounts — Operator — PostAud.io" };

type SearchParams = Promise<{ q?: string; status?: string; offset?: string }>;

const STATUS_PILLS: Array<{ key: "all" | ActivityStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" },
  { key: "invited", label: "Invited" },
];

function isActivityStatus(v: string | undefined): v is "all" | ActivityStatus {
  return v === "all" || v === "active" || v === "dormant" || v === "invited";
}

function StatTile({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-[#111]">
      <div className="font-serif text-[28px] leading-tight text-neutral-900 dark:text-white">
        {n.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[12px] text-neutral-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Active
      </span>
    );
  }
  if (status === "dormant") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Dormant
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> Invited
    </span>
  );
}

function networkNote(invited: number, noAccount: number): string {
  if (invited === 0) return "—";
  const acctNote = noAccount === 0 ? "no subjects w/o account" : `${noAccount} subject${noAccount === 1 ? "" : "s"} w/o account`;
  return `invited ${invited} · ${acctNote}`;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status: statusParam, offset: offsetStr } = await searchParams;
  const status = isActivityStatus(statusParam) ? statusParam : "all";
  const offset = Number.isFinite(Number(offsetStr)) && Number(offsetStr) > 0 ? Number(offsetStr) : 0;
  const pageSize = 50;

  const [stats, { rows, total }] = await Promise.all([
    getPlatformStats(),
    listAccountsConsole({ search: q, status, limit: pageSize, offset }),
  ]);

  function pillHref(key: "all" | ActivityStatus) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key !== "all") params.set("status", key);
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">Users &amp; accounts</h1>
          <p className="mt-1 text-[13.5px] text-neutral-500">
            Everyone on the platform, and who they&apos;ve brought with them.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11.5px] font-medium text-neutral-600 dark:bg-white/5 dark:text-neutral-400">
          Metadata only — content requires audited impersonation
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatTile n={stats.totalUsers} label="users" />
        <StatTile n={stats.activeSeries} label="active series" />
        <StatTile n={stats.interviewsThisWeek} label="interviews this week" />
        <StatTile n={stats.totalFacts} label="facts extracted, all time" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1.5">
          {STATUS_PILLS.map((p) => (
            <Link
              key={p.key}
              href={pillHref(p.key)}
              className={
                p.key === status
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
            placeholder="Search accounts, owners, emails…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-[#1c1c1e] dark:text-white"
          />
          {status !== "all" && <input type="hidden" name="status" value={status} />}
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#111]">
        <table className="w-full min-w-[880px] text-[13.5px]">
          <thead className="bg-neutral-50 text-left text-neutral-600 dark:bg-[#161616] dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Account / owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Series</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Network</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-neutral-500">
                  No accounts match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-[#161616]">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/accounts/${r.id}`}
                    className="font-medium text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
                    {r.name}
                  </Link>
                  <div className="text-[12px] text-neutral-500">{r.owner_email ?? "—"}</div>
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600 dark:text-neutral-400">{r.plan}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.activity_status} />
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">{r.series_count}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">{r.member_count}</td>
                <td className="px-4 py-3 text-[12px] leading-snug text-neutral-500">
                  {networkNote(r.invited_count, r.subjects_without_account)}
                </td>
                <td className="px-4 py-3 text-neutral-500">{relativeTime(r.last_activity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-neutral-500">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} accounts · sorted by last
          activity
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
