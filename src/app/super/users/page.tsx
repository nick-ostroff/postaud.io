import Link from "next/link";
import { getPlatformStats, listPlatformUsers } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";

export const metadata = { title: "Users — Operator — PostAud.io" };

type SearchParams = Promise<{ q?: string; offset?: string }>;

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

export default async function SuperUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, offset: offsetStr } = await searchParams;
  const offset = Number.isFinite(Number(offsetStr)) && Number(offsetStr) > 0 ? Number(offsetStr) : 0;
  const pageSize = 50;

  const [stats, { rows, total }] = await Promise.all([
    getPlatformStats(),
    listPlatformUsers({ search: q, limit: pageSize, offset }),
  ]);

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/super/users?${qs}` : "/super/users";
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">Users</h1>
          <p className="mt-1 text-[13.5px] text-neutral-500">Everyone on the platform.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11.5px] font-medium text-neutral-600 dark:bg-white/5 dark:text-neutral-400">
          Metadata only — content requires impersonation
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatTile n={stats.totalUsers} label="users" />
        <StatTile n={stats.activeSeries} label="active series" />
        <StatTile n={stats.interviewsThisWeek} label="interviews this week" />
        <StatTile n={stats.totalFacts} label="facts extracted, all time" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <form className="ml-auto w-full max-w-xs sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-[#1c1c1e] dark:text-white"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#111]">
        <table className="w-full min-w-[880px] text-[13.5px]">
          <thead className="bg-neutral-50 text-left text-neutral-600 dark:bg-[#161616] dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Accounts</th>
              <th className="px-4 py-3 font-medium">Subject of</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                  No users match.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-neutral-50 dark:hover:bg-[#161616]">
                <td className="px-4 py-3">
                  <Link
                    href={`/super/users/${u.id}`}
                    className="font-medium text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
                    {u.displayName ?? u.email.split("@")[0]}
                  </Link>
                  <div className="text-[12px] text-neutral-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {u.orgs.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {u.orgs.map((o) => (
                        <Link
                          key={o.id}
                          href={`/super/accounts/${o.id}`}
                          className={
                            "rounded-full px-2 py-0.5 text-[11.5px] font-medium " +
                            (o.accepted
                              ? "bg-neutral-100 text-neutral-600 hover:text-emerald-700 dark:bg-white/10 dark:text-neutral-300"
                              : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300")
                          }
                          title={o.accepted ? o.role : `${o.role} · invited, not accepted`}
                        >
                          {o.name} · {o.role}
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">
                  {u.subjectOfCount === 0 ? <span className="text-neutral-400">—</span> : u.subjectOfCount}
                </td>
                <td className="px-4 py-3 text-neutral-500">{relativeTime(u.lastActivity)}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-3 text-right">
                  <ImpersonateButton userId={u.id} label="⚿ Log in as" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-neutral-500">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} users · sorted by last
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
