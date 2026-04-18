"use client";

import { useState } from "react";
import Link from "next/link";
import type { MockTemplate, MockQuestion, OutputType } from "@/lib/mocks";

const OUTPUT_OPTIONS: { value: OutputType; label: string; sub: string }[] = [
  { value: "transcript.plain", label: "Plain transcript", sub: "Just the cleaned text" },
  { value: "summary.concise",  label: "Concise summary",  sub: "Short + 5 bullets" },
  { value: "qa.structured",    label: "Structured Q&A",   sub: "JSON of question→answer" },
  { value: "blog.draft",       label: "Blog draft",       sub: "Markdown article" },
  { value: "crm.note",         label: "CRM note",         sub: "Paste-ready paragraph" },
  { value: "webhook.json",     label: "Webhook JSON",     sub: "Full payload for your webhook" },
];

function nextId(qs: MockQuestion[]) {
  const n = qs.length + 1;
  return `q${n}_${Math.random().toString(36).slice(2, 6)}`;
}

export function TemplateBuilder({ initial }: { initial?: MockTemplate }) {
  const [name, setName] = useState(initial?.name ?? "Untitled template");
  const [intro, setIntro] = useState(initial?.intro_message ?? "");
  const [smsBody, setSmsBody] = useState(
    initial?.sms_body ?? "Hi {first_name}, tap to answer a quick call: {link}",
  );
  const [outputType, setOutputType] = useState<OutputType>(initial?.output_type ?? "summary.concise");
  const [webhookUrl, setWebhookUrl] = useState(initial?.webhook_url ?? "");
  const [questions, setQuestions] = useState<MockQuestion[]>(initial?.questions ?? []);

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { id: nextId(qs), position: qs.length, prompt: "", allow_followup: true, max_seconds: 90, required: true },
    ]);
  }
  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id).map((q, i) => ({ ...q, position: i })));
  }
  function move(id: string, dir: -1 | 1) {
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((q, i) => ({ ...q, position: i }));
    });
  }
  function updateQuestion(id: string, patch: Partial<MockQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/app/templates" className="hover:underline">Templates</Link>
        <span>/</span>
        <span className="text-neutral-700">Edit</span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-2xl font-semibold tracking-tight bg-transparent outline-none focus:bg-neutral-100 px-1 -mx-1 rounded"
        />
        <div className="flex gap-2">
          <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50">
            Archive
          </button>
          <button
            onClick={() => alert("Mock save — wiring lands when Supabase is connected.")}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Save
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* left: editor */}
        <div className="lg:col-span-2 space-y-6">
          <Section title="Introduction">
            <label className="block text-xs font-medium text-neutral-600">Intro message (read at start of call)</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />

            <label className="mt-4 block text-xs font-medium text-neutral-600">SMS body</label>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Tokens: <code>{"{first_name}"}</code>, <code>{"{link}"}</code>
            </p>
          </Section>

          <Section title="Questions" action={<button onClick={addQuestion} className="text-sm font-medium text-neutral-900 hover:underline">+ Add question</button>}>
            {questions.length === 0 && (
              <div className="rounded-md border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-500">
                No questions yet. Click "Add question" to start.
              </div>
            )}
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-2 flex w-6 flex-col items-center text-xs text-neutral-400">
                      <span className="mb-1 font-semibold text-neutral-700">{i + 1}</span>
                      <button onClick={() => move(q.id, -1)} className="hover:text-neutral-900" aria-label="Move up">↑</button>
                      <button onClick={() => move(q.id, +1)} className="hover:text-neutral-900" aria-label="Move down">↓</button>
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={q.prompt}
                        onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                        placeholder="What's the main thing you hope to get out of our call?"
                        rows={2}
                        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                      />
                      <input
                        value={q.hint ?? ""}
                        onChange={(e) => updateQuestion(q.id, { hint: e.target.value })}
                        placeholder="Hint (optional)"
                        className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-600 focus:border-neutral-900 focus:outline-none"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-600">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                          />
                          Required
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={q.allow_followup}
                            onChange={(e) => updateQuestion(q.id, { allow_followup: e.target.checked })}
                          />
                          Allow 1 AI follow-up
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          Max seconds
                          <input
                            type="number"
                            min={15}
                            max={300}
                            value={q.max_seconds}
                            onChange={(e) => updateQuestion(q.id, { max_seconds: Number(e.target.value) })}
                            className="w-16 rounded-md border border-neutral-300 px-2 py-0.5 text-right"
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => removeQuestion(q.id)}
                      className="text-xs text-neutral-400 hover:text-rose-600"
                      aria-label="Remove question"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Output">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OUTPUT_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={
                    "cursor-pointer rounded-lg border p-3 text-sm transition-colors " +
                    (outputType === o.value
                      ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900"
                      : "border-neutral-200 bg-white hover:border-neutral-300")
                  }
                >
                  <input
                    type="radio"
                    name="output"
                    className="sr-only"
                    checked={outputType === o.value}
                    onChange={() => setOutputType(o.value)}
                  />
                  <div className="font-medium">{o.label}</div>
                  <div className="text-xs text-neutral-500">{o.sub}</div>
                </label>
              ))}
            </div>

            <label className="mt-5 block text-xs font-medium text-neutral-600">Webhook URL (optional)</label>
            <div className="mt-1 flex gap-2">
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.zapier.com/..."
                className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                Send test
              </button>
            </div>
          </Section>
        </div>

        {/* right: preview */}
        <aside className="space-y-6">
          <Section title="Preview">
            <div className="rounded-xl bg-neutral-900 p-4 text-neutral-100 shadow-sm">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">SMS</div>
              <div className="mt-1 text-sm">
                {smsBody
                  .replace("{first_name}", "Sarah")
                  .replace("{link}", "postaud.io/c/abc123")}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
              <div className="text-xs font-medium text-neutral-500">Call intro</div>
              <p className="mt-1 italic text-neutral-700">"Hi Sarah — {intro || "…"}"</p>
              <div className="mt-3 text-xs font-medium text-neutral-500">Then asks</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-neutral-700">
                {questions.length === 0 && <li className="text-neutral-400">No questions yet</li>}
                {questions.map((q) => (
                  <li key={q.id}>{q.prompt || <span className="text-neutral-400">(empty)</span>}</li>
                ))}
              </ol>
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
