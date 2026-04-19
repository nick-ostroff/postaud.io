"use client";

import { useState } from "react";

type Props = {
  request: {
    firstName: string;
    senderName: string;
    templateTitle: string;
    estMinutes: number;
    pooledNumber: string;
    dialCode: string;
  };
};

export function RecipientGate({ request }: Props) {
  const [consent, setConsent] = useState(false);
  // Two commas → ~2s pause on iOS after connect, then auto-DTMF the code.
  const telUri = `tel:${request.pooledNumber},,${request.dialCode}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          PostAud.io
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Hi {request.firstName}</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          {request.senderName} asked you to answer a few quick questions for{" "}
          <em className="text-neutral-900 dark:text-neutral-50 font-medium not-italic">{request.templateTitle}</em>.
          <br />
          About {request.estMinutes} minutes over the phone.
        </p>
      </div>

      <ol className="mt-8 space-y-3 text-sm text-neutral-700 dark:text-neutral-300 font-medium">
        <Step n={1}>Tap the button below — your phone dials a short, friendly AI interview.</Step>
        <Step n={2}>Answer the questions out loud. Say "next" or just pause when you're done.</Step>
        <Step n={3}>Hang up when the call wraps. {request.senderName} gets your answers automatically.</Step>
      </ol>

      <label className="mt-8 flex items-start gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] p-5 text-sm cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-neutral-300 dark:border-neutral-700 bg-transparent text-blue-600 focus:ring-blue-500"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span className="text-neutral-800 dark:text-neutral-200 leading-relaxed">I understand this call will be recorded so {request.senderName} can review my answers.</span>
      </label>

      {consent ? (
        <a
          href={telUri}
          className="mt-6 block rounded-xl bg-blue-600 px-6 py-5 text-center text-lg font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          Tap to call
        </a>
      ) : (
        <button
          disabled
          className="mt-6 block w-full cursor-not-allowed rounded-xl bg-neutral-200 dark:bg-[#1c1c1e] px-6 py-5 text-center text-lg font-medium text-neutral-500 dark:text-neutral-600"
        >
          Tap to call
        </button>
      )}

      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500 font-medium">
        You'll dial {request.pooledNumber}. No account needed.
      </p>
    </main>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 dark:bg-neutral-100 text-xs font-semibold text-white dark:text-neutral-900">
        {n}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}
