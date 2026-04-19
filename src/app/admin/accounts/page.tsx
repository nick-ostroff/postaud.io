import Link from "next/link";
import { listOrganizations } from "@/db/queries/admin";

type SearchParams = Promise<{ q?: string; offset?: string }>;

export default async function AccountsListPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, offset: offsetStr } = await searchParams;
  const offset = Number.isFinite(Number(offsetStr)) ? Number(offsetStr) : 0;
  const pageSize = 50;
  const rows = await listOrganizations({ search: q, limit: pageSize, offset });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Accounts</h1>
        <form className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by org name or owner email"
            className="w-80 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-[14px] font-medium text-white dark:text-neutral-900 hover:opacity-90"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111]">
        <table className="w-full text-[14px]">
          <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Credits</th>
              <th className="px-4 py-3 font-medium text-right">Interviews (mo)</th>
              <th className="px-4 py-3 font-medium">Created</th>
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
                    className="font-medium text-neutral-900 dark:text-white hover:text-blue-600"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {r.owner_email ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{r.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      r.status === "active"
                        ? "inline-flex rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[12px] font-medium text-emerald-800 dark:text-emerald-300"
                        : "inline-flex rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[12px] font-medium text-rose-800 dark:text-rose-300"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                  {r.credits_remaining}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {r.interviews_this_month}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px] text-neutral-500">
        <div>
          Showing {offset + 1}–{offset + rows.length}
        </div>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={`/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), offset: String(Math.max(0, offset - pageSize)) })}`}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:hover:bg-[#161616]"
            >
              Previous
            </Link>
          )}
          {rows.length === pageSize && (
            <Link
              href={`/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), offset: String(offset + pageSize) })}`}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:hover:bg-[#161616]"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
