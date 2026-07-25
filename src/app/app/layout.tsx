import type { Viewport } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ActiveStoryProvider, AppRailStrip } from "@/components/nav/AppRailStrip";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { Sidebar } from "@/components/nav/Sidebar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { getSeriesForUser, getSeriesSummaries, getViewer } from "@/db/queries";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { resolveImpersonationBanner } from "@/lib/auth/impersonation-banner";
import { ROLE_LABELS } from "@/lib/roles";
import { pickIntervieweeSeries } from "@/server/interviewee/select-series";
import { profilePhotoUrl } from "@/server/profile/photo-url";
import { subjectPhotoUrl } from "@/server/series/photo-url";
import { staleness } from "@/server/series/staleness";

// The mobile top nav is the dark ink surface, so the iOS status bar /
// Android chrome above it must match — overrides the root's paper tint
// for everything under /app.
export const viewport: Viewport = {
  themeColor: "#211E1A",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase, organization, role, acceptedAt } = await getViewer();

  // Invited members must finish the /welcome accept flow (set password, see
  // role + accessible series, accept) before reaching anything under /app —
  // enforced centrally here so no individual page/route can be missed.
  // `/welcome` itself lives outside `/app` (not wrapped by this layout), so
  // this can't loop.
  if (organization && !acceptedAt) {
    redirect("/welcome");
  }

  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "You";
  const avatarUrl = profilePhotoUrl(user.user_metadata?.avatar_path as string | undefined);
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";

  const cookieStore = await cookies();
  const cookiePairs = cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
  const banner = resolveImpersonationBanner(cookiePairs);

  // While impersonating, the session belongs to the target user — who is not
  // an admin — so this is false and the Operator link hides itself. No
  // special-casing needed.
  const platformAdmin = await isPlatformAdmin();

  // The mobile story rail lives here — one dark strip under the top nav that
  // persists across navigations (layouts don't re-render on route changes), so
  // switching circles never redraws it. Built once per full load; which routes
  // show it, and which circle is ringed, is decided client-side in AppRailStrip.
  const allSeries = organization ? await getSeriesForUser(supabase) : [];
  const activeSeries = allSeries.filter((s) => s.status !== "archived");
  const summaries = await getSeriesSummaries(supabase, activeSeries.map((s) => s.id));
  const now = new Date();
  const railStories = activeSeries.map((s) => ({
    id: s.id,
    title: s.title,
    photoUrl: subjectPhotoUrl(s),
    waiting: staleness(
      summaries[s.id]?.lastSessionAt ? new Date(summaries[s.id].lastSessionAt as string) : null,
      now,
    ).stale,
  }));

  // Mirror the home page's interviewee decision: when /app renders the
  // one-job interviewee home (non-admin subject, not snoozed today), the rail
  // strip stays hidden there — that screen has no circles.
  let showRailOnHome = true;
  if (role !== "admin") {
    const candidates = activeSeries.filter(
      (s) => s.status === "active" && s.subject_user_id === user.id,
    );
    if (candidates.length > 0) {
      const chosen = pickIntervieweeSeries(candidates, summaries);
      if (chosen && cookieStore.get(`snooze-${chosen.id}`)?.value !== "1") {
        showRailOnHome = false;
      }
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      {banner && <ImpersonationBanner session={banner.session} expired={banner.expired} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar name={name} role={roleLabel} isPlatformAdmin={platformAdmin} avatarUrl={avatarUrl} />
        <ActiveStoryProvider>
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Below `lg` the sidebar is hidden and this carries the nav instead. */}
            <AppTopNav name={name} avatarUrl={avatarUrl} />
            <Suspense>
              <AppRailStrip
                stories={railStories}
                canCreate={role === "admin"}
                showOnHome={showRailOnHome}
              />
            </Suspense>
            {/* The bottom padding clears the floating story bar on mobile. */}
            <main className="min-w-0 flex-1 px-5 py-6 pb-28 lg:px-9 lg:py-[30px] lg:pb-11">
              <InstallPrompt />
              {children}
            </main>
          </div>
        </ActiveStoryProvider>
      </div>
    </div>
  );
}
