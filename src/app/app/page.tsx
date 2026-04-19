import Link from "next/link";
import { getViewer } from "@/db/queries";

const PLAN_CREDITS: Record<string, number> = {
  free: 3, starter: 20, growth: 100, scale: 400,
};

export default async function DashboardHome() {
  const { user, organization, supabase } = await getViewer();

  const creditsRemaining = organization?.credits_remaining ?? 0;
  const creditsTotal = PLAN_CREDITS[organization?.plan ?? "free"] ?? 3;

  const { count: templateCount } = await supabase
    .from("interview_templates")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: sendCount } = await supabase
    .from("interview_requests")
    .select("id", { count: "exact", head: true });

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Welcome, {user.email?.split("@")[0]}. You have {creditsRemaining} interview credits left this cycle.
          </p>
        </div>
        <Link
          href="/app/templates/new"
          className="rounded-lg bg-neutral-900 dark:bg-neutral-800 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors shadow-sm"
        >
          New template
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Credits left" value={creditsRemaining}       sub={`of ${creditsTotal}`} />
        <StatCard label="Templates"    value={templateCount ?? 0}     sub="active" />
        <StatCard label="Sends"        value={sendCount ?? 0}         sub="all time" />
        <StatCard label="Plan"         value={organization?.plan ?? "free"} />
      </div>

      {(sendCount ?? 0) === 0 && (
        <div className="mt-10 rounded-[2rem] border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#111] p-12 text-center transition-colors">
          <div className="text-[15px] text-neutral-900 dark:text-neutral-50 font-medium tracking-tight">No sends yet</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            Create a template, then send an invite from the Sends page. The recipient will
            get a text with a tap-to-call link and the AI takes it from there.
          </p>
          <Link
            href="/app/templates/new"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            Create your first template
          </Link>
        </div>
      )}
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
