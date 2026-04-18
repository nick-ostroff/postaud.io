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
  const telUri = `tel:${request.pooledNumber},,,${request.dialCode}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          PostAud.io
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Hi {request.firstName}</h1>
        <p className="mt-3 text-neutral-600">
          {request.senderName} asked you to answer a few quick questions for{" "}
          <em className="text-neutral-900">{request.templateTitle}</em>.
          <br />
          About {request.estMinutes} minutes over the phone.
        </p>
      </div>

      <ol className="mt-8 space-y-2 text-sm text-neutral-700">
        <Step n={1}>Tap the button below — your phone dials a short, friendly AI interview.</Step>
        <Step n={2}>Answer the questions out loud. Say "next" or just pause when you're done.</Step>
        <Step n={3}>Hang up when the call wraps. {request.senderName} gets your answers automatically.</Step>
      </ol>

      <label className="mt-8 flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>I understand this call will be recorded so {request.senderName} can review my answers.</span>
      </label>

      {consent ? (
        <a
          href={telUri}
          className="mt-5 block rounded-xl bg-neutral-900 px-6 py-5 text-center text-lg font-medium text-white transition hover:bg-neutral-800"
        >
          Tap to call
        </a>
      ) : (
        <button
          disabled
          className="mt-5 block w-full cursor-not-allowed rounded-xl bg-neutral-200 px-6 py-5 text-center text-lg font-medium text-neutral-500"
        >
          Tap to call
        </button>
      )}

      <p className="mt-3 text-center text-xs text-neutral-500">
        You'll dial {request.pooledNumber}. No account needed.
      </p>
    </main>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
