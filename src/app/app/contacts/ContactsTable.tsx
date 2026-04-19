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

// Best-effort E.164 normalization for US numbers. Leaves anything already
// E.164-shaped or non-US alone; server-side Zod validation is the final gate.
function normalizeE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s|-|\(|\)/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

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
    const normalizedPhone = normalizeE164(phone);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName || null,
        last_name: lastName || null,
        phone_e164: normalizedPhone,
        email: email || null,
      }),
    });
    setSaveState("idle");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const fieldErrors = j?.error?.details?.fieldErrors as Record<string, string[]> | undefined;
      const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      setErrorMsg(j?.error?.message ?? firstFieldError ?? `Failed (HTTP ${res.status})`);
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Contacts</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">People you can send interview invites to.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-neutral-900 dark:bg-neutral-800 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors shadow-sm"
          >
            Add contact
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] p-6 shadow-sm transition-colors">
          <h2 className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">Add contact</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="First name" value={firstName} onChange={setFirstName} />
            <Input label="Last name"  value={lastName}  onChange={setLastName} />
            <Input label="Phone (E.164)" value={phone} onChange={setPhone} placeholder="+15555551234" required />
            <Input label="Email" value={email} onChange={setEmail} placeholder="optional" />
          </div>
          {errorMsg && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20 px-3 py-2.5 text-[13px] text-rose-700 dark:text-rose-400">
              {errorMsg}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button
              onClick={onAdd}
              disabled={saveState === "saving" || !phone.trim()}
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-[13px] font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#111] px-4 py-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#111] p-12 text-center transition-colors">
          <div className="text-[15px] font-medium text-neutral-900 dark:text-neutral-50 tracking-tight">No contacts yet</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            Add a recipient to invite to an interview.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] shadow-sm transition-colors text-[13px] font-medium">
          <table className="w-full text-left border-collapse">
            <thead className="bg-neutral-50 dark:bg-[#1a1a1c] text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-5 py-4 font-semibold">Name</th>
                <th className="px-5 py-4 font-semibold">Phone</th>
                <th className="px-5 py-4 font-semibold">Email</th>
                <th className="px-5 py-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-[#1a1a1c] transition-colors">
                  <td className="px-5 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || <span className="text-neutral-400 dark:text-neutral-600">—</span>}
                  </td>
                  <td className="px-5 py-3 text-neutral-700 dark:text-neutral-300">{c.phone_e164}</td>
                  <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">{c.email ?? <span className="text-neutral-400 dark:text-neutral-600">—</span>}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
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
      <span className="block text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
        {label}{required && <span className="ml-0.5 text-rose-500 dark:text-rose-400">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[13px] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:border-neutral-900 dark:focus:border-neutral-500 focus:outline-none transition-colors"
      />
    </label>
  );
}
