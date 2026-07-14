import type { GrowthBucket, PlatformUserRow } from "@/db/queries/admin";
import { daysSince } from "@/lib/time";

// Pure/presentational helpers shared by the /super dashboard, the users
// list, and the user detail page. Deliberately NOT "use client" — every
// named export of a "use client" module becomes a server-throwing stub in
// Next 16, so anything called directly from a server component (page.tsx,
// users/page.tsx, users/[id]/page.tsx) must live in a plain module like this
// one instead of the client-only DashboardUsers.tsx.

export type DashboardUserStatus = "active" | "dormant" | "invited";
export type DashboardUserRow = PlatformUserRow & { status: DashboardUserStatus };

// Shared status derivation — used by the dashboard, the users list, and the
// user detail page so "Active"/"Dormant"/"Invited" always means the same
// thing everywhere in the operator console.
const STATUS_DORMANT_DAYS = 30;

export function computeStatus(u: Pick<PlatformUserRow, "orgs" | "lastActivity">): DashboardUserStatus {
  // Invited: every org membership this user has is still a pending
  // invite — nobody has accepted anything yet.
  if (u.orgs.length > 0 && u.orgs.every((o) => !o.accepted)) return "invited";
  if (!u.lastActivity) return "dormant";
  return daysSince(u.lastActivity) > STATUS_DORMANT_DAYS ? "dormant" : "active";
}

export function displayName(row: { displayName: string | null; email: string }): string {
  return row.displayName ?? row.email.split("@")[0];
}

export function initialOf(row: { displayName: string | null; email: string }): string {
  return (row.displayName ?? row.email).slice(0, 1).toUpperCase();
}

/** Compact "invited N · assignees N · subjects N" line — real counts only,
 *  shared by the desktop table's Network column, the panel, and mobile cards. */
export function networkLabel(row: { network: { invited: number; assignees: number; subjects: number } }): string {
  const { invited, assignees, subjects } = row.network;
  const parts: string[] = [];
  if (invited > 0) parts.push(`invited ${invited}`);
  if (assignees > 0) parts.push(`assignees ${assignees}`);
  if (subjects > 0) parts.push(`subjects ${subjects}`);
  return parts.length > 0 ? parts.join(" · ") : "organic";
}

export function Avatar({
  row,
  size = 30,
}: {
  row: { displayName: string | null; email: string };
  size?: number;
}) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full bg-green-tint font-semibold text-green-deep"
      style={{ width: size, height: size, fontSize: size > 34 ? 15 : 11.5 }}
    >
      {initialOf(row)}
    </span>
  );
}

/** 12-week spark-bar growth chart — shared by the dashboard and the usage
 *  page. Presentational only (no hooks), so it's safe to render directly
 *  from a Server Component page.tsx. */
export function GrowthSparkBars({ weekly }: { weekly: GrowthBucket[] }) {
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.count));
  return (
    <div className="flex h-[64px] items-end gap-[5px]">
      {weekly.map((w, i) => {
        const heightPct = Math.max(4, Math.round((w.count / maxWeekly) * 100));
        const opacity = 0.25 + (i / Math.max(1, weekly.length - 1)) * 0.75;
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
  );
}

export function StatusPill({ status }: { status: DashboardUserStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-tint px-2.5 py-[3px] text-[11px] font-semibold text-green-deep">
        Active
      </span>
    );
  }
  if (status === "invited") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-tint px-2.5 py-[3px] text-[11px] font-semibold text-amber">
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-ink/8 px-2.5 py-[3px] text-[11px] font-semibold text-muted">
      Dormant
    </span>
  );
}
