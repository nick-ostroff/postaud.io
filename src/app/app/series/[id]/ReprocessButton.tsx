"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Admin-only "Reprocess" action for a session row whose pipeline run left a
 * `process_error` behind — posts to `/api/interviews/[id]/reprocess` (Task
 * 13) and refreshes the page so the row's fact count / error state updates.
 * Shown only when `process_error` is set (see SeriesDetailPage).
 */
export function ReprocessButton({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reprocess() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/reprocess`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok !== false) {
        router.refresh();
      } else {
        setError(body?.error ?? "Reprocess failed.");
      }
    } catch {
      setError("Reprocess failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={reprocess}
        disabled={pending}
        className="cursor-pointer text-[12px] font-medium text-green-deep underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Reprocessing…" : "Reprocess"}
      </button>
      {error && <span className="text-[11.5px] text-amber">{error}</span>}
    </span>
  );
}
