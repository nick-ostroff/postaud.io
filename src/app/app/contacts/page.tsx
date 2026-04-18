import { mockContacts } from "@/lib/mocks";

export default function ContactsPage() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-neutral-600">People you can send interview invites to.</p>
        </div>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          Add contact
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {mockContacts.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-3 text-neutral-700">{c.phone_e164}</td>
                <td className="px-4 py-3 text-neutral-600">{c.email ?? <span className="text-neutral-400">—</span>}</td>
                <td className="px-4 py-3 text-right text-xs text-neutral-500">
                  <button className="hover:text-neutral-900">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
