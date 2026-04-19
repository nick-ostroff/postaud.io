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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Welcome, {user.email?.split("@")[0]}. You have {creditsRemaining} interview credits left this cycle.
          </p>
        </div>
        <Link
          href="/app/templates/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
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
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <div className="text-sm font-medium">No sends yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Create a template, then send an invite from the Sends page. The recipient will
            get a text with a tap-to-call link and the AI takes it from there.
          </p>
          <Link
            href="/app/templates/new"
            className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
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
    <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-neutral-500">{sub}</div>}
      </div>
    </div>
  );
}
