import { getPlatformStats, getPlatformGrowth, listPlatformUsers } from "@/db/queries/admin";
import { DashboardUsers } from "./DashboardUsers";
import { computeStatus, GrowthSparkBars, type DashboardUserRow } from "./user-display";

export const metadata = { title: "Dashboard — Operator — PostAud.io" };

function KpiTile({
  label,
  value,
  sub,
  valueTone = "ink",
  subTone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  valueTone?: "ink" | "amber";
  subTone?: "muted" | "green";
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`mt-1.5 font-serif text-[26px] leading-tight ${valueTone === "amber" ? "text-amber" : "text-ink"}`}>
        {value}
      </div>
      {sub && (
        <div className={`mt-0.5 text-[12px] ${subTone === "green" ? "text-green-deep" : "text-muted"}`}>{sub}</div>
      )}
    </div>
  );
}

export default async function SuperDashboardPage() {
  const [stats, growth, { rows }] = await Promise.all([
    getPlatformStats(),
    getPlatformGrowth(),
    listPlatformUsers({ limit: 50 }),
  ]);

  const dashboardRows: DashboardUserRow[] = rows.map((u) => ({ ...u, status: computeStatus(u) }));

  const avgSeriesPerUser = stats.totalUsers > 0 ? (stats.activeSeries / stats.totalUsers).toFixed(1) : "0.0";
  const dormantPct = stats.totalUsers > 0 ? Math.round((growth.dormantCount / stats.totalUsers) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-serif text-[26px] text-ink">Dashboard</h1>
        <p className="mt-1 text-[13.5px] text-muted">Platform pulse — metadata only.</p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Users"
          value={stats.totalUsers.toLocaleString()}
          sub={`+${growth.newThisWeek} this week`}
          subTone="green"
        />
        <KpiTile
          label="Active series"
          value={stats.activeSeries.toLocaleString()}
          sub={`${avgSeriesPerUser} per user avg`}
        />
        <KpiTile
          label="Interviews this week"
          value={stats.interviewsThisWeek.toLocaleString()}
          sub="sessions logged"
        />
        <KpiTile label="Facts captured" value={stats.totalFacts.toLocaleString()} sub="the compounding asset" />
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

      <DashboardUsers rows={dashboardRows} />
    </div>
  );
}
