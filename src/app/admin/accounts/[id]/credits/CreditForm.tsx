"use client";

import { useState } from "react";
import { adjustCreditsAction } from "../actions";

export function CreditForm({ orgId }: { orgId: string }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await adjustCreditsAction(formData);
        } finally {
          setPending(false);
        }
      }}
      className="space-y-5"
    >
      <input type="hidden" name="orgId" value={orgId} />
      <div>
        <label className="block text-[14px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Delta (signed integer — positive to add, negative to deduct)
        </label>
        <input
          name="delta"
          type="number"
          required
          step={1}
          placeholder="e.g. 10 or -3"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-[14px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Reason (required — shown in the audit log)
        </label>
        <textarea
          name="reason"
          required
          minLength={3}
          rows={3}
          placeholder="e.g. Comp for outage on 2026-04-15"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Apply adjustment"}
      </button>
    </form>
  );
}
