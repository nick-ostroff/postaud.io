import Link from "next/link";
import { mockOrg, mockSends, mockTemplates } from "@/lib/mocks";
import { StatusBadge } from "@/components/ui/Badge";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function DashboardHome() {
  const recent = mockSends.slice(0, 6);
  const completed = mockSends.filter((s) => s.status === "completed").length;
  const inFlight = mockSends.filter((s) => s.status === "sent" || s.status === "reminded").length;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Welcome back. You have {mockOrg.credits_remaining} interview credits left this cycle.
          </p>
        </div>
        <Link
          href="/app/sends?new=1"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New send
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Credits left"  value={mockOrg.credits_remaining} sub={`of ${mockOrg.credits_total}`} />
        <StatCard label="Completed"     value={completed} sub="this cycle" />
        <StatCard label="In flight"     value={inFlight}  sub="awaiting call" />
        <StatCard label="Templates"     value={mockTemplates.filter((t) => t.is_active).length} sub="active" />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Recent sends</h2>
        <Link href="/app/sends" className="text-sm text-neutral-700 hover:underline">View all →</Link>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Template</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {recent.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.contact.first_name} {s.contact.last_name}</div>
                  <div className="text-xs text-neutral-500">{s.contact.phone_e164}</div>
                </td>
                <td className="px-4 py-3">{s.template_name}</td>
                <td className="px-4 py-3 text-neutral-600">{fmtDate(s.sent_at)}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/app/sends/${s.id}`} className="text-sm font-medium text-neutral-900 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
