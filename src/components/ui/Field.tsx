import type { ReactNode } from "react";

/** Matches `.field` (label + `.hint`) in postaudio-mockups.css. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-[18px] block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <div className="mt-[5px] text-xs text-muted">{hint}</div>}
    </label>
  );
}
