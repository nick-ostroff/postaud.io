import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { Sidebar } from "@/components/nav/Sidebar";
import { getViewer } from "@/db/queries";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { resolveImpersonationBanner } from "@/lib/auth/impersonation-banner";
import { ROLE_LABELS } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, role, acceptedAt } = await getViewer();

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
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";

  const cookieStore = await cookies();
  const cookiePairs = cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
  const banner = resolveImpersonationBanner(cookiePairs);

  // While impersonating, the session belongs to the target user — who is not
  // an admin — so this is false and the Operator link hides itself. No
  // special-casing needed.
  const platformAdmin = await isPlatformAdmin();

  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      {banner && <ImpersonationBanner session={banner.session} expired={banner.expired} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar name={name} role={roleLabel} isPlatformAdmin={platformAdmin} />
        <main className="min-w-0 flex-1 px-9 py-[30px] pb-11">{children}</main>
      </div>
    </div>
  );
}
