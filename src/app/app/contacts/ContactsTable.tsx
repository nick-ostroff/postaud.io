"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string;
  email: string | null;
  created_at?: string;
};

export function ContactsTable({ initial }: { initial: Contact[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [contacts, setContacts] = useState(initial);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setErrorMsg(null);
    setAdding(false);
  }

  async function onAdd() {
    setSaveState("saving");
    setErrorMsg(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName || null,
        last_name: lastName || null,
        phone_e164: phone.trim(),
        email: email || null,
      }),
    });
    setSaveState("idle");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErrorMsg(j?.error?.message ?? `Failed (HTTP ${res.status})`);
      return;
    }
    const { contact } = await res.json();
    setContacts((c) => [contact, ...c]);
    resetForm();
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setContacts((c) => c.filter((x) => x.id !== id));
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j?.error?.message ?? "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-neutral-600">People you can send interview invites to.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Add contact
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Add contact</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="First name" value={firstName} onChange={setFirstName} />
            <Input label="Last name"  value={lastName}  onChange={setLastName} />
            <Input label="Phone (E.164)" value={phone} onChange={setPhone} placeholder="+15555551234" required />
            <Input label="Email" value={email} onChange={setEmail} placeholder="optional" />
          </div>
          {errorMsg && (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMsg}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={onAdd}
              disabled={saveState === "saving" || !phone.trim()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <div className="text-sm font-medium">No contacts yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Add a recipient to invite to an interview.
          </p>
        </div>
      ) : (
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
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{c.phone_e164}</td>
                  <td className="px-4 py-3 text-neutral-600">{c.email ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-xs text-neutral-400 hover:text-rose-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-600">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}
