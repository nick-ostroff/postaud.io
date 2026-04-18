import Link from "next/link";
import { mockSends } from "@/lib/mocks";
import { StatusBadge } from "@/components/ui/Badge";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(sec?: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SendsPage() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sends</h1>
          <p className="mt-1 text-sm text-neutral-600">Every interview request, ever.</p>
        </div>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          New send
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Template</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {mockSends.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.contact.first_name} {s.contact.last_name}</div>
                  <div className="text-xs text-neutral-500">{s.contact.phone_e164}</div>
                </td>
                <td className="px-4 py-3 max-w-xs truncate">{s.template_name}</td>
                <td className="px-4 py-3 text-neutral-600">{fmtDate(s.sent_at)}</td>
                <td className="px-4 py-3 text-neutral-600 tabular-nums">{fmtDuration(s.duration_sec)}</td>
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
