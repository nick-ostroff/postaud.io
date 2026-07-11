"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "+ <topic>" dashed chip for a suggested topic — posts to
 * `/api/topics/[id]/promote` (moves it from "suggested" into the queue) and
 * refreshes the page so it reappears in the topic queue list above.
 */
export function PromoteChip({ topicId, name }: { topicId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function promote() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/topics/${topicId}/promote`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        setPending(false);
      }
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
