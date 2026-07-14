import { getPlatformStats, getPlatformGrowth, listPlatformUsers, type PlatformUserRow } from "@/db/queries/admin";
import { daysSince } from "@/lib/time";
import { DashboardUsers, type DashboardUserRow, type DashboardUserStatus } from "./DashboardUsers";

export const metadata = { title: "Dashboard — Operator — PostAud.io" };

// Matches the "Dormant > 30 days" KPI tile — distinct constant from the
// account-level DORMANT_DAYS (42) used elsewhere in admin.ts; this dashboard
// mirrors getPlatformGrowth's own GROWTH_DORMANT_DAYS threshold.
const DASHBOARD_DORMANT_DAYS = 30;

function computeStatus(u: PlatformUserRow): DashboardUserStatus {
  // Invited: every org membership this user has is still a pending
  // invite — nobody has accepted anything yet.
  if (u.orgs.length > 0 && u.orgs.every((o) => !o.accepted)) return "invited";
  if (!u.lastActivity) return "dormant";
  return daysSince(u.lastActivity) > DASHBOARD_DORMANT_DAYS ? "dormant" : "active";
}

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
  const maxWeekly = Math.max(1, ...growth.weekly.map((w) => w.count));

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
        <div className="flex h-[64px] items-end gap-[5px]">
          {growth.weekly.map((w, i) => {
            const heightPct = Math.max(4, Math.round((w.count / maxWeekly) * 100));
            const opacity = 0.25 + (i / Math.max(1, growth.weekly.length - 1)) * 0.75;
            return (
              <div
                key={w.weekStart}
                className="flex-1 rounded-t-[3px] bg-green"
                style={{ height: `${heightPct}%`, opacity }}
                title={`Week of ${w.weekStart}: ${w.count} new user${w.count === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
        <div className="text-[12px] text-green-deep">+{growth.newThisWeek} this week</div>
      </div>

      <DashboardUsers rows={dashboardRows} />
    </div>
  );
}
