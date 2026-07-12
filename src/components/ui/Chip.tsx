import type { ReactNode } from "react";

/** Matches `.chip` (+ `.chip .k` kicker) in postaudio-mockups.css. */
export function Chip({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-card px-3 py-1 text-[12.5px] text-ink-soft">
      {kicker && (
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">{kicker}</span>
      )}
      {children}
    </span>
  );
}
