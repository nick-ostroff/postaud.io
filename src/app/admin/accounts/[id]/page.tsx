import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/db/queries/admin";
import { setStatusAction } from "./actions";

type Params = Promise<{ id: string }>;

export default async function AccountDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();
  const { organization, members, recentRequests, auditLog } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/accounts" className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          ← Accounts
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{organization.name}</h1>
            <p className="mt-1 text-[14px] text-neutral-500">
              {organization.plan} · {organization.credits_remaining} credits ·{" "}
              <span className={organization.status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                {organization.status}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/accounts/${organization.id}/credits`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-blue-700"
            >
              Adjust credits
            </Link>
            <form action={setStatusAction}>
              <input type="hidden" name="orgId" value={organization.id} />
              <input
                type="hidden"
                name="nextStatus"
                value={organization.status === "active" ? "suspended" : "active"}
              />
              <button
                type="submit"
                className={
                  organization.status === "active"
                    ? "rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-[#111] px-4 py-2 text-[14px] font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    : "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#111] px-4 py-2 text-[14px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                }
              >
                {organization.status === "active" ? "Suspend" : "Unsuspend"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">Members</h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{m.email}</td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{m.role}</td>
                  <td className="px-4 py-2 text-neutral-500">{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">
          Recent interview requests
        </h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No interview requests yet.
                  </td>
                </tr>
              )}
              {recentRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{r.contact_phone || "—"}</td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{r.status}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">Audit log</h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No audit entries.
                  </td>
                </tr>
              )}
              {auditLog.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                    {new Date(a.at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">
                    {a.actor_email ?? a.actor_user_id ?? "system"}
                  </td>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{a.action}</td>
                  <td className="px-4 py-2 font-mono text-[12px] text-neutral-500">
                    {a.meta ? JSON.stringify(a.meta) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
