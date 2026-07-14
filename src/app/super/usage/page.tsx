import Link from "next/link";
import { getPlatformStats, getPlatformGrowth, listPlatformUsers } from "@/db/queries/admin";
import { Avatar, displayName, GrowthSparkBars } from "../user-display";

export const metadata = { title: "Usage — Operator — PostAud.io" };

function KpiTile({
  label,
  value,
  sub,
  valueTone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  valueTone?: "ink" | "amber";
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`mt-1.5 font-serif text-[26px] leading-tight ${valueTone === "amber" ? "text-amber" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

export default async function UsagePage() {
  const [stats, growth, { rows: users }] = await Promise.all([
    getPlatformStats(),
    getPlatformGrowth(),
    // listPlatformUsers returns rows sorted by recency, then paginated — so we
    // must pull the full set (the query caps its own users read at 2000) before
    // re-ranking by factsCount, or a dormant high-facts user past the page
    // boundary would be silently dropped from this ranking.
    listPlatformUsers({ limit: 2000 }),
  ]);

  const dormantPct = stats.totalUsers > 0 ? Math.round((growth.dormantCount / stats.totalUsers) * 100) : 0;

  const topByFacts = [...users].sort((a, b) => b.factsCount - a.factsCount).slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-serif text-[26px] text-ink">Usage</h1>
        <p className="mt-1 text-[13.5px] text-muted">Platform-wide usage — metadata only.</p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <KpiTile label="Facts captured" value={stats.totalFacts.toLocaleString()} sub="the compounding asset" />
        <KpiTile
          label="Interviews this week"
          value={stats.interviewsThisWeek.toLocaleString()}
          sub="sessions logged"
        />
        <KpiTile label="Active series" value={stats.activeSeries.toLocaleString()} sub="across all accounts" />
        <KpiTile
          label="Dormant > 30 days"
          value={growth.dormantCount.toLocaleString()}
          sub={`${dormantPct}% of users`}
          valueTone="amber"
        />
      </div>

      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white px-5 py-4">
        <div className="flex items-baseline">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Users · 12 weeks</div>
          <div className="ml-auto font-serif text-[20px] text-ink">{growth.totalUsers.toLocaleString()}</div>
        </div>
        <GrowthSparkBars weekly={growth.weekly} />
        <div className="text-[12px] text-green-deep">+{growth.newThisWeek} this week</div>
      </div>

      <div className="rounded-xl border border-line bg-white">
        <div className="border-b border-line px-5 py-3.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Top users by facts
        </div>
        {topByFacts.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-muted">No facts captured yet.</div>
        )}
        <div className="flex flex-col">
          {topByFacts.map((u, i) => (
            <Link
              key={u.id}
              href={`/super/users/${u.id}`}
              className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0 hover:bg-paper-2"
            >
              <div className="w-5 flex-none text-[12px] tabular-nums text-faint">{i + 1}</div>
              <Avatar row={u} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">{displayName(u)}</div>
                <div className="truncate text-[11.5px] text-muted">{u.email}</div>
              </div>
              <div className="flex-none font-serif text-[16px] tabular-nums text-ink">
                {u.factsCount.toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
