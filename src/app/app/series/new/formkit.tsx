"use client";

import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { inputClasses } from "@/components/ui/Input";

/** A pickable subject/access-list candidate — the org roster, pre-shaped for this UI. */
export type MemberOption = {
  userId: string;
  name: string;
  email: string;
  pending: boolean;
  photoUrl: string | null;
};

export { inputClasses };

export const textareaClasses = `${inputClasses} min-h-[92px] resize-y`;

/**
 * The wizard's own Field. Uppercase, slightly larger labels and darker hints
 * than the shared <Field>, matching the Create Series Mobile design doc's
 * "larger labels, darker secondary text" treatment. Scoped to this flow on
 * purpose so the rest of the app's forms keep their mixed-case labels.
 */
export function WizardField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-[18px] block">
      <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-soft">{label}</span>
      {children}
      {hint && <div className="mt-[5px] text-[13px] leading-snug text-ink-soft">{hint}</div>}
    </label>
  );
}

/** Matches `.steps`/`.st`/`.st.now`/`.st.done`/`.bar` in postaudio-mockups.css. */
export function StepsIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ["Basics", "Assign", "Guide", "Review"];
  return (
    <div className="mb-6 flex items-center gap-2.5">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const now = n === step;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <span
              className={
                "flex items-center gap-1.5 text-[13px] font-semibold " +
                (now ? "text-ink" : done ? "text-green-deep" : "text-faint")
              }
            >
              <span
                className={
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                  (now
                    ? "bg-ink text-paper"
                    : done
                      ? "bg-green-tint text-green-deep"
                      : "bg-[rgba(33,30,26,0.07)] text-faint")
                }
              >
                {done ? "✓" : n}
              </span>
              {label}
            </span>
            {n < 4 && <span className="h-px w-8 bg-line-strong" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

/** Matches `.radio-card`/`.radio-card.on` in postaudio-mockups.css. */
export function RadioCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <label
      onClick={onClick}
      className={
        "block cursor-pointer rounded-sm border px-4 py-3.5 transition-colors " +
        (selected ? "border-green bg-green-tint" : "border-line-strong bg-card hover:border-ink-soft")
      }
    >
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      <div className="mt-1 text-[12.5px] leading-snug text-ink-soft">{description}</div>
    </label>
  );
}

/** Matches `.chip-row`/`.chip`/`.chip.amber`/`.chip-input` in postaudio-mockups.css. */
export function ChipEditor({
  items,
  onChange,
  placeholder,
  tone = "default",
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  tone?: "default" | "amber";
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value]);
    }
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && items.length > 0) {
      onChange(items.slice(0, -1));
    }
  }

  const chipClasses =
    tone === "amber"
      ? "inline-flex items-center gap-1.5 rounded-pill bg-amber-tint px-3 py-1 text-[12.5px] text-amber"
      : "inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-card px-3 py-1 text-[12.5px] text-ink-soft";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className={chipClasses}>
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label={`Remove ${item}`}
            className={tone === "amber" ? "text-amber/70 hover:text-amber" : "text-faint hover:text-ink"}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        className="w-[170px] rounded-pill border border-dashed border-line-strong bg-transparent px-3.5 py-1 text-[12.5px] text-ink placeholder:text-faint focus:border-green focus:outline-none"
      />
    </div>
  );
}
