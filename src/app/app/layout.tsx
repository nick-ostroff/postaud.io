import { Sidebar } from "@/components/nav/Sidebar";
import { getViewer } from "@/db/queries";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  member: "Member",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getViewer();

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
