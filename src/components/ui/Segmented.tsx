"use client";

type SegmentedOption = { value: string; label: string };

type SegmentedProps = {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  name?: string;
};

/** Matches `.seg`/`.seg span.on` in postaudio-mockups.css. */
export function Segmented({ options, value, onChange, name }: SegmentedProps) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex gap-0.5 rounded-pill border border-line-strong bg-card p-[3px]"
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <span
            key={opt.value}
            role="radio"
            aria-checked={on}
            tabIndex={0}
            onClick={() => onChange?.(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange?.(opt.value);
              }
            }}
            className={
              "cursor-pointer rounded-pill px-4 py-1.5 text-[13px] font-semibold " +
              (on ? "bg-green-tint text-green-deep" : "text-muted")
            }
          >
            {opt.label}
          </span>
        );
      })}
    </div>
  );
}
