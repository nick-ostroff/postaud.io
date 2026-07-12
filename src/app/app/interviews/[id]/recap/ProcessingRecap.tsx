"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 15; // ~60s

/**
 * Placeholder shown in place of the summary paragraph while Task 12's
 * pipeline hasn't written `interview_summaries` yet. Polls the server via
 * `router.refresh()` every 4s — once the row lands, the parent server
 * component stops rendering this component at all (replaced by the real
 * summary), which naturally tears down the interval via the effect cleanup.
 * After ~60s of no luck, gives up polling and settles on a "check back
 * later" message instead of refreshing forever.
 */
export function ProcessingRecap() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (gaveUp) return;
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router, gaveUp]);

  return (
    <p className="serif text-[16px] leading-[1.55] text-ink-soft">
      {gaveUp
        ? "This is taking a little longer than usual — check back in a bit and the recap will be waiting for you."
        : "Anna is still listening back and writing this up — this page will update on its own in a moment."}
    </p>
  );
}
