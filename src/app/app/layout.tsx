import { Sidebar } from "@/components/nav/Sidebar";
import { getViewer } from "@/db/queries";

const PLAN_CREDITS: Record<string, number> = {
  free: 3, starter: 20, growth: 100, scale: 400,
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await getViewer();

  const orgName = organization?.name ?? "Workspace";
  const email = user.email ?? "—";
  const creditsRemaining = organization?.credits_remaining ?? 0;
  const creditsTotal = PLAN_CREDITS[organization?.plan ?? "free"] ?? 3;

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar
        orgName={orgName}
        email={email}
        creditsRemaining={creditsRemaining}
        creditsTotal={creditsTotal}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
