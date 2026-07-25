import Link from "next/link";
import { ProfileNameEditor } from "@/components/profile/ProfileNameEditor";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { Card } from "@/components/ui/Card";
import { getSeriesForUser, getSeriesSummaries, getViewer, listMembers } from "@/db/queries";
import { listAuditLogs, listOrgUsage, type AuditLogRow } from "@/db/queries/activity";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { ROLE_LABELS } from "@/lib/roles";
import { profilePhotoUrl } from "@/server/profile/photo-url";
import type { InterviewUsage } from "@/db/types";
import { ActionsCard, SpendCard } from "./ActivityCards";

const AUDIT_LOG_LIMIT = 100;

/**
 * Profile (mobile mockup 2a) — the account view the top-nav avatar opens:
 * who you are, your totals across every story, and the account-level actions.
 * On mobile this is also the only way out of the app, since the sidebar that
 * carries "Sign out" on desktop isn't rendered below `lg`.
 *
 * Desktop fills the screen: account column on the left, and (for admins) the
 * workspace activity log — all-time spend and the audit trail — on the right.
 * The spend ledger includes sessions and series that were later deleted.
 *
 * Workspace name/plan/credits stay read-only — those change through the
 * operator console, not self-serve.
 */
export default async function SettingsPage() {
  const { user, supabase, organization, role } = await getViewer();
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";
  const platformAdmin = await isPlatformAdmin();
  const isAdmin = role === "admin";

  const emailPrefix = user.email?.split("@")[0] || "You";
  const name = (user.user_metadata?.full_name as string | undefined) || emailPrefix;
  const photoUrl = profilePhotoUrl(user.user_metadata?.avatar_path as string | undefined);

  const seriesAll = organization ? await getSeriesForUser(supabase) : [];
  const series = seriesAll.filter((s) => s.status !== "archived");
  const summaries = await getSeriesSummaries(supabase, series.map((s) => s.id));
  const memoriesTotal = Object.values(summaries).reduce((sum, s) => sum + s.memoriesCount, 0);
  const sessionsTotal = Object.values(summaries).reduce((sum, s) => sum + s.sessionsCount, 0);

  // Workspace activity (admin-only): the org-wide spend ledger + audit trail,
  // and enough interview/series context to label each live session's rows.
  let usageRows: InterviewUsage[] = [];
  let auditLogs: AuditLogRow[] = [];
  const sessionLabelById = new Map<string, string>();
  const nameByUserId = new Map<string, string>();
  if (organization && isAdmin) {
    const [usage, logs, interviewsRes, members] = await Promise.all([
      listOrgUsage(supabase),
      listAuditLogs(supabase, AUDIT_LOG_LIMIT),
      supabase.from("interviews").select("id, series_id, started_at").order("started_at", { ascending: true }),
      listMembers(supabase),
    ]);
    usageRows = usage;
    auditLogs = logs;

    const titleBySeries = new Map(seriesAll.map((s) => [s.id, s.title]));
    const counters = new Map<string, number>();
    for (const iv of interviewsRes.data ?? []) {
      const n = (counters.get(iv.series_id) ?? 0) + 1;
      counters.set(iv.series_id, n);
      sessionLabelById.set(iv.id, `${titleBySeries.get(iv.series_id) ?? "Series"} — Session ${n}`);
    }
    for (const m of members) {
      nameByUserId.set(m.user_id, m.users?.display_name || m.users?.email || "Member");
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col items-center gap-2.5 lg:items-start">
        <ProfilePhotoEditor name={name} photoUrl={photoUrl} />
        <div className="text-center lg:text-left">
          <ProfileNameEditor name={name} fallback={emailPrefix} />
          <div className="mt-0.5 text-[13px] text-muted">
            {user.email} · {roleLabel}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat n={String(series.length)} label={series.length === 1 ? "story" : "stories"} />
            <MiniStat n={String(memoriesTotal)} label="memories" />
            <MiniStat n={String(sessionsTotal)} label="sessions" />
          </div>

          <Card className="overflow-hidden">
            <Row href="/app/memories" label="Your memories" />
            <Row href="/app/series" label="All stories" />
            <Row href="/app/members" label="Members &amp; roles" />
            <Row href="/app/settings/tokens" label="Access tokens" />
            {platformAdmin && <Row href="/super" label="Operator console" />}
          </Card>

          {organization && (
            <Card className="px-[22px] py-5">
              <h3>Workspace</h3>
              <dl className="mt-3 flex flex-col gap-2 text-[13.5px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Name</dt>
                  <dd className="font-medium text-ink">{organization.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Plan</dt>
                  <dd className="font-medium capitalize text-ink">{organization.plan}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Credits remaining</dt>
                  <dd className="font-medium text-ink">{organization.credits_remaining}</dd>
                </div>
              </dl>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
            <form action="/auth/sign-out" method="POST">
              <button className="text-[13.5px] font-medium text-muted hover:text-ink">Sign out</button>
            </form>
            <Link href="/privacy" className="text-[13px] text-faint">
              Privacy
            </Link>
            <Link href="/terms" className="text-[13px] text-faint">
              Terms
            </Link>
          </div>
        </div>

        {organization && (
          <div className="flex flex-col gap-4">
            {isAdmin ? (
              <>
                <SpendCard rows={usageRows} sessionLabelById={sessionLabelById} />
                <ActionsCard logs={auditLogs} nameByUserId={nameByUserId} limit={AUDIT_LOG_LIMIT} />
              </>
            ) : (
              <Card className="px-[22px] py-5">
                <h3>Activity</h3>
                <p className="mt-1 text-[13px] text-muted">
                  Workspace spending and the audit trail are visible to workspace admins.
                </p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-[13.5px] text-ink last:border-b-0 hover:bg-[rgba(33,30,26,0.02)] hover:no-underline"
    >
      <span aria-hidden className="h-5 w-5 shrink-0 rounded-md bg-green-tint" />
      <span className="flex-1">{label}</span>
      <span aria-hidden className="text-faint">
        ›
      </span>
    </Link>
  );
}

function MiniStat({ n, label }: { n: string; label: string }) {
  return (
    <Card className="px-3 py-3 text-center shadow-none">
      <div className="serif text-[19px] leading-none">{n}</div>
      <div className="mt-1 text-[10.5px] text-muted">{label}</div>
    </Card>
  );
}
