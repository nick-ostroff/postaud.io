"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30; // ~2 min

/**
 * Invisible poller mounted by the series page while any listed session is
 * still missing its summary ("Summary pending — check back soon."). Refreshes
 * the server component via `router.refresh()` every 4s so the summary and
 * memories chip resolve in place — same pattern as the recap page's
 * ProcessingRecap. Once every session has a summary the parent stops
 * rendering this component, which tears down the interval; after ~2 min of
 * no luck it gives up quietly (the cron backstop will have either landed the
 * summary or recorded an error by then).
 */
export function PendingSummaryRefresher() {
  const router = useRouter();
  const pollCount = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
