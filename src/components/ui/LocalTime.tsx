"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function fmt(iso: string, viewerZone: boolean): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: viewerZone ? undefined : "UTC",
  });
}

/**
 * "Jul 22, 4:10 PM" in the viewer's timezone. The server can't know that
 * zone, so SSR and the hydration pass both render deterministic UTC (no
 * hydration mismatch); `hydrated` flips false→true right after, and the
 * re-render swaps in the browser's local formatting.
 */
export function LocalTime({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  return <span>{fmt(iso, hydrated)}</span>;
}
