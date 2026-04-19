import Link from "next/link";
import { getViewer } from "@/db/queries";
import { StatusBadge } from "@/components/ui/Badge";
import type { SendStatus } from "@/lib/mocks";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function SendsPage() {
  const { supabase } = await getViewer();

  const { data: requests } = await supabase
    .from("interview_requests")
    .select("id, status, sent_at, completed_at, contact_id, template_id, dial_code")
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = requests ?? [];

  // Resolve contact + template names in a second pass to keep types simple.
  const contactIds = Array.from(new Set(rows.map((r) => r.contact_id)));
  const templateIds = Array.from(new Set(rows.map((r) => r.template_id)));

  const [{ data: contactRows }, { data: templateRows }] = await Promise.all([
    contactIds.length
      ? supabase.from("contacts").select("id, first_name, last_name, phone_e164").in("id", contactIds)
      : Promise.resolve({ data: [] }),
    templateIds.length
      ? supabase.from("interview_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = new Map((contactRows ?? []).map((c) => [c.id, c]));
  const templates = new Map((templateRows ?? []).map((t) => [t.id, t]));

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Sends</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Every interview request, ever.</p>
        </div>
        <Link
          href="/app/sends/new"
          className="rounded-lg bg-neutral-900 dark:bg-neutral-800 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors shadow-sm"
        >
          New send
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#111] p-12 text-center transition-colors">
          <div className="text-[15px] font-medium text-neutral-900 dark:text-neutral-50 tracking-tight">No sends yet</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            Pick a template and a contact, and PostAud will dispatch the invite.
          </p>
          <Link
            href="/app/sends/new"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            Send your first interview
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] shadow-sm transition-colors text-[13px] font-medium">
          <table className="w-full text-left border-collapse">
            <thead className="bg-neutral-50 dark:bg-[#1a1a1c] text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-5 py-4 font-semibold">Recipient</th>
                <th className="px-5 py-4 font-semibold">Template</th>
                <th className="px-5 py-4 font-semibold">Sent</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((r) => {
                const c = contacts.get(r.contact_id);
                const t = templates.get(r.template_id);
                const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone_e164 : "—";
                return (
                  <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-[#1a1a1c] transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-neutral-900 dark:text-neutral-100">{name}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500">{c?.phone_e164}</div>
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate text-neutral-700 dark:text-neutral-300">{t?.name ?? "(deleted)"}</td>
                    <td className="px-5 py-3 text-neutral-500 dark:text-neutral-500">{fmtDate(r.sent_at)}</td>
                    <td className="px-5 py-3"><StatusBadge status={r.status as SendStatus} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/app/sends/${r.id}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
