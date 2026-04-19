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
          <h1 className="text-2xl font-semibold tracking-tight">Sends</h1>
          <p className="mt-1 text-sm text-neutral-600">Every interview request, ever.</p>
        </div>
        <Link
          href="/app/sends/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New send
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <div className="text-sm font-medium">No sends yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Pick a template and a contact, and PostAud will dispatch the invite.
          </p>
          <Link
            href="/app/sends/new"
            className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Send your first interview
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white">
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
              {rows.map((r) => {
                const c = contacts.get(r.contact_id);
                const t = templates.get(r.template_id);
                const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone_e164 : "—";
                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-neutral-500">{c?.phone_e164}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{t?.name ?? "(deleted)"}</td>
                    <td className="px-4 py-3 text-neutral-600">{fmtDate(r.sent_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status as SendStatus} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/app/sends/${r.id}`} className="text-sm font-medium text-neutral-900 hover:underline">
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
