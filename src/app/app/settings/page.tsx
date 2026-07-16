import Link from "next/link";
import { ProfileNameEditor } from "@/components/profile/ProfileNameEditor";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { Card } from "@/components/ui/Card";
import { getSeriesForUser, getSeriesSummaries, getViewer } from "@/db/queries";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { ROLE_LABELS } from "@/lib/roles";
import { profilePhotoUrl } from "@/server/profile/photo-url";

/**
 * Profile (mobile mockup 2a) — the account view the top-nav avatar opens:
 * who you are, your totals across every story, and the account-level actions.
 * On mobile this is also the only way out of the app, since the sidebar that
 * carries "Sign out" on desktop isn't rendered below `lg`.
 *
 * Workspace name/plan/credits stay read-only — those change through the
 * operator console, not self-serve.
 */
export default async function SettingsPage() {
  const { user, supabase, organization, role } = await getViewer();
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";
  const platformAdmin = await isPlatformAdmin();

  const emailPrefix = user.email?.split("@")[0] || "You";
  const name = (user.user_metadata?.full_name as string | undefined) || emailPrefix;
  const photoUrl = profilePhotoUrl(user.user_metadata?.avatar_path as string | undefined);

  const series = organization
    ? (await getSeriesForUser(supabase)).filter((s) => s.status !== "archived")
    : [];
  const summaries = await getSeriesSummaries(supabase, series.map((s) => s.id));
  const memoriesTotal = Object.values(summaries).reduce((sum, s) => sum + s.memoriesCount, 0);
  const sessionsTotal = Object.values(summaries).reduce((sum, s) => sum + s.sessionsCount, 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col items-center gap-2.5 lg:items-start">
        <ProfilePhotoEditor name={name} photoUrl={photoUrl} />
        <div className="text-center lg:text-left">
          <ProfileNameEditor name={name} fallback={emailPrefix} />
          <div className="mt-0.5 text-[13px] text-muted">
            {user.email} · {roleLabel}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <MiniStat n={String(series.length)} label={series.length === 1 ? "story" : "stories"} />
        <MiniStat n={String(memoriesTotal)} label="memories" />
        <MiniStat n={String(sessionsTotal)} label="sessions" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <Row href="/app/memories" label="Your memories" />
        <Row href="/app/series" label="All stories" />
        <Row href="/app/members" label="Members &amp; roles" />
        {platformAdmin && <Row href="/super" label="Operator console" />}
      </Card>

      {organization && (
        <Card className="mt-4 px-[22px] py-5">
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

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
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
