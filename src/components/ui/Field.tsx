import type { ReactNode } from "react";

/** Matches `.field` (label + `.hint`) in postaudio-mockups.css. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-[18px]">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">{label}</label>
      {children}
      {hint && <div className="mt-[5px] text-xs text-faint">{hint}</div>}
    </div>
  );
}
