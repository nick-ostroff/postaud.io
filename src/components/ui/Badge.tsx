import type { ReactNode } from "react";

type BadgeTone = "green" | "amber" | "muted";

const toneClasses: Record<BadgeTone, string> = {
  green: "bg-green-tint text-green-deep",
  amber: "bg-amber-tint text-amber",
  muted: "bg-[rgba(33,30,26,0.07)] text-muted",
};

/** Matches `.badge`/`.badge-amber`/`.badge-muted` in postaudio-mockups.css. */
export function Badge({ tone = "green", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-[10px] py-[3px] text-[11.5px] font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
