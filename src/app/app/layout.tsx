import { redirect } from "next/navigation";
import { Sidebar } from "@/components/nav/Sidebar";
import { getViewer } from "@/db/queries";
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

  return (
    <div className="flex min-h-screen w-full bg-paper">
      <Sidebar name={name} role={roleLabel} />
      <main className="min-w-0 flex-1 px-9 py-[30px] pb-11">{children}</main>
    </div>
  );
}
