import Link from "next/link";
import { getPlatformStats, getPlatformGrowth, listPlatformUsers, type PlatformUserRow } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";
import { Avatar, StatusPill, computeStatus, displayName, networkLabel } from "../DashboardUsers";

export const metadata = { title: "Users — Operator — PostAud.io" };

type SearchParams = Promise<{ q?: string; offset?: string }>;

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-[10px] bg-paper px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="mt-0.5 font-serif text-[19px] text-ink">{value.toLocaleString()}</div>
    </div>
  );
}

const TABLE_COLS = "240px 110px 1fr 100px 100px 110px 90px 120px";

export default async function SuperUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, offset: offsetStr } = await searchParams;
  const offset = Number.isFinite(Number(offsetStr)) && Number(offsetStr) > 0 ? Number(offsetStr) : 0;
  const pageSize = 50;

  const [stats, growth, { rows, total }] = await Promise.all([
    getPlatformStats(),
    getPlatformGrowth(),
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-ink">Users</h1>
          <p className="mt-1 text-[13.5px] text-muted">Everyone on the platform — metadata only.</p>
        </div>
        <span className="rounded-full bg-ink/8 px-3 py-1.5 text-[11.5px] font-medium text-muted">
          Content requires impersonation
        </span>
      </div>

      {/* Mobile-only KPI mini-tiles */}
      <div className="flex gap-2.5 lg:hidden">
        <KpiTile label="New/wk" value={growth.newThisWeek} />
        <KpiTile label="Interviews" value={stats.interviewsThisWeek} />
        <KpiTile label="Facts" value={stats.totalFacts} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <form className="w-full sm:w-80">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="w-full rounded-[10px] border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-green focus:outline-none focus:ring-1 focus:ring-green"
          />
        </form>
        <div className="ml-auto text-[12.5px] text-muted">
          {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total.toLocaleString()}
        </div>
      </div>

      {/* Desktop (lg+): full table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white lg:block">
        <div
          className="grid min-w-[1080px] items-center gap-x-3.5 border-b border-line px-[18px] py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
          style={{ gridTemplateColumns: TABLE_COLS }}
        >
          <div>User</div>
          <div>Joined</div>
          <div>Network</div>
          <div>Series</div>
          <div>Facts</div>
          <div>Last active</div>
          <div>Status</div>
          <div></div>
        </div>
        {rows.length === 0 && (
          <div className="px-[18px] py-12 text-center text-[13px] text-muted">No users match.</div>
        )}
        {rows.map((u) => {
          const status = computeStatus(u);
          return (
            <div
              key={u.id}
              className="grid min-w-[1080px] items-center gap-x-3.5 border-b border-line px-[18px] py-3.5 text-[12.5px] last:border-b-0 hover:bg-paper-2"
              style={{ gridTemplateColumns: TABLE_COLS }}
            >
              <Link href={`/super/users/${u.id}`} className="flex min-w-0 items-center gap-2.5">
                <Avatar row={u} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{displayName(u)}</div>
                  <div className="truncate text-[11.5px] text-muted">{u.email}</div>
                </div>
              </Link>
              <div className="text-muted">{joinedLabel(u.createdAt)}</div>
              <div className="truncate text-ink-soft">{networkLabel(u)}</div>
              <div className="text-ink">{u.seriesCount} owned</div>
              <div className="font-mono text-[12px] font-medium tabular-nums text-ink-soft">
                {u.factsCount > 0 ? u.factsCount.toLocaleString() : "—"}
              </div>
              <div className="text-muted">{relativeTime(u.lastActivity)}</div>
              <div>
                <StatusPill status={status} />
              </div>
              <div className="text-right">
                <ImpersonateButton
                  userId={u.id}
                  label="Impersonate"
                  className="rounded-full border border-line-strong px-3 py-1.5 text-[11.5px] font-medium text-ink-soft hover:bg-paper-2 disabled:opacity-60"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile (<lg): stacked cards */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {rows.length === 0 && (
          <div className="rounded-xl border border-line bg-white px-4 py-10 text-center text-[13px] text-muted">
            No users match.
          </div>
        )}
        {rows.map((u: PlatformUserRow) => {
          const status = computeStatus(u);
          return (
            <Link
              key={u.id}
              href={`/super/users/${u.id}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5"
            >
              <Avatar row={u} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">{displayName(u)}</div>
                <div className="truncate text-[12px] text-muted">
                  invited {u.network.invited} · {u.seriesCount} series · {u.factsCount.toLocaleString()} facts
                </div>
              </div>
              <StatusPill status={status} />
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} users · sorted by last
          activity
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
