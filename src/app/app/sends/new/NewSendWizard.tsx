"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Template = { id: string; name: string; sms_body: string; output_type: string };
type Contact = { id: string; first_name: string | null; last_name: string | null; phone_e164: string; email: string | null };

export function NewSendWizard({
  templates, initialContacts, creditsRemaining,
}: {
  templates: Template[];
  initialContacts: Contact[];
  creditsRemaining: number;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [contacts, setContacts] = useState(initialContacts);
  const [contactId, setContactId] = useState(initialContacts[0]?.id ?? "");

  const [addingContact, setAddingContact] = useState(initialContacts.length === 0);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [contactErr, setContactErr] = useState<string | null>(null);

  const [sendState, setSendState] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templateId, templates],
  );
  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contactId, contacts],
  );

  const firstName = selectedContact?.first_name ?? "there";
  const smsPreview = selectedTemplate
    ? selectedTemplate.sms_body
        .replaceAll("{first_name}", firstName)
        .replaceAll("{link}", "postaud.io/c/abc123")
    : "";

  async function onAddContact() {
    setContactErr(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: newFirst || null,
        last_name: newLast || null,
        phone_e164: newPhone.trim(),
        email: null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setContactErr(j?.error?.message ?? `Failed (HTTP ${res.status})`);
      return;
    }
    const { contact } = await res.json();
    setContacts((c) => [contact, ...c]);
    setContactId(contact.id);
    setNewFirst(""); setNewLast(""); setNewPhone("");
    setAddingContact(false);
  }

  async function onSend() {
    setSendState("sending");
    setErrorMsg(null);
    const res = await fetch("/api/interview-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, contact_id: contactId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSendState("error");
      setErrorMsg(j?.error?.message ?? `Send failed (HTTP ${res.status})`);
      return;
    }
    const { id } = await res.json();
    router.push(`/app/sends/${id}`);
    router.refresh();
  }

  const canSend =
    templateId &&
    contactId &&
    creditsRemaining > 0 &&
    sendState !== "sending";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/app/sends" className="hover:underline">Sends</Link>
        <span>/</span>
        <span className="text-neutral-700">New</span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Send an interview</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Pick a template and a recipient. {creditsRemaining} credit{creditsRemaining === 1 ? "" : "s"} left.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Section title="1. Template">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Section>

          <Section
            title="2. Recipient"
            action={
              !addingContact && (
                <button
                  onClick={() => setAddingContact(true)}
                  className="text-sm font-medium text-neutral-900 hover:underline"
                >
                  + Add new
                </button>
              )
            }
          >
            {addingContact ? (
              <div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label="First name" value={newFirst} onChange={setNewFirst} />
                  <Input label="Last name"  value={newLast}  onChange={setNewLast} />
                  <Input label="Phone (E.164)" value={newPhone} onChange={setNewPhone} placeholder="+15555551234" required />
                </div>
                {contactErr && (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {contactErr}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={onAddContact}
                    disabled={!newPhone.trim()}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                  >
                    Save contact
                  </button>
                  {contacts.length > 0 && (
                    <button
                      onClick={() => setAddingContact(false)}
                      className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50"
                    >
                      Pick existing
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              >
                {contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "(no name)";
                  return (
                    <option key={c.id} value={c.id}>
                      {name} — {c.phone_e164}
                    </option>
                  );
                })}
              </select>
            )}
          </Section>

          <Section title="3. Confirm">
            {errorMsg && (
              <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {errorMsg}
              </div>
            )}
            <button
              onClick={onSend}
              disabled={!canSend}
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {sendState === "sending" ? "Sending…" : "Send invite"}
            </button>
            {creditsRemaining <= 0 && (
              <p className="mt-2 text-xs text-rose-700">
                No credits left on this plan. Upgrade in <Link href="/app/settings/billing" className="underline">Billing</Link>.
              </p>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              Twilio sends the SMS immediately. You can view the token and dial code on
              the send detail page.
            </p>
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="SMS preview">
            <div className="rounded-xl bg-neutral-900 p-4 text-neutral-100">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                SMS to {selectedContact?.phone_e164 ?? "—"}
              </div>
              <div className="mt-1 text-sm">{smsPreview}</div>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
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
