"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * "Delete this session" on the session results page (admin-only danger zone).
 * First click reveals an inline confirm — same convention as
 * ArchiveSeriesButton — then DELETE /api/interviews/[id] removes the session,
 * its memories, transcript, and recording, and lands back on the series hub.
 */
export function DeleteSessionButton({
  interviewId,
  seriesId,
  memoriesCount,
}: {
  interviewId: string;
  seriesId: string;
  memoriesCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function destroy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't delete — try again.");
        setBusy(false);
        return;
      }
      router.push(`/app/series/${seriesId}`);
      router.refresh();
    } catch {
      setError("Couldn't delete — try again.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
        Delete this session
      </Button>
    );
  }

  const memoriesPhrase =
    memoriesCount === 0
      ? ""
      : memoriesCount === 1
        ? " and the memory it added"
        : ` and the ${memoriesCount} memories it added`;

  return (
    <div>
      <p className="text-[13px] text-muted">
        This removes the recording and transcript{memoriesPhrase}. It can&apos;t be undone.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="quiet-danger" onClick={destroy} disabled={busy}>
          {busy ? "Deleting…" : "Delete session"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
      </div>
    </div>
  );
}
