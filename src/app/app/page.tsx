import { getViewer } from "@/db/queries";

const PLAN_CREDITS: Record<string, number> = {
  free: 3, starter: 20, growth: 100, scale: 400,
};

export default async function DashboardHome() {
  const { user, organization } = await getViewer();

  const creditsRemaining = organization?.credits_remaining ?? 0;
  const creditsTotal = PLAN_CREDITS[organization?.plan ?? "free"] ?? 3;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Welcome, {user.email?.split("@")[0]}. You have {creditsRemaining} interview credits left this cycle.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Credits left" value={creditsRemaining} sub={`of ${creditsTotal}`} />
        <StatCard label="Plan" value={organization?.plan ?? "free"} />
      </div>

      <div className="mt-10 rounded-[2rem] border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#111] p-12 text-center transition-colors">
        <div className="text-[15px] text-neutral-900 dark:text-neutral-50 font-medium tracking-tight">Voice interviews are coming soon</div>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
          The browser voice-interview flow is being rebuilt for V1. Check back shortly.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] px-6 py-5 shadow-sm transition-colors">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">{value}</div>
        {sub && <div className="text-xs font-medium text-neutral-500 dark:text-neutral-500">{sub}</div>}
      </div>
    </div>
  );
}
