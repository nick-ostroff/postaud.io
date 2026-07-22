"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "+ <topic>" dashed chip for a suggested topic. Clicking it marks the
 * suggestion accepted (`/api/topics/[id]/promote` — flips suggested off so
 * the chip doesn't reappear and the topic joins the interviewer's coverage
 * compass) and adds it to the question queue, so it shows up in the
 * Question queue card and the next session actually asks it.
 */
export function PromoteChip({
  topicId,
  seriesId,
  name,
}: {
  topicId: string;
  seriesId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function promote() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/topics/${topicId}/promote`, { method: "POST" });
      if (!res.ok) {
        setPending(false);
        return;
      }
      // Best-effort queue add: the promote already hid the chip, so a failed
      // queue write shouldn't resurrect it — the topic still steers coverage.
      await fetch(`/api/series/${seriesId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: name }),
      }).catch(() => {});
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={promote}
      disabled={pending}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-dashed border-line-strong bg-transparent px-3 py-1 text-[12.5px] text-muted transition-colors hover:border-green hover:text-green-deep disabled:cursor-not-allowed disabled:opacity-50"
    >
      ＋ {name}
    </button>
  );
}
