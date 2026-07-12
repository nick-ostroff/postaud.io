/** Matches `.cov-row`/`.cov`/`.cov.low` in postaudio-mockups.css. `value` is 0..1. */
export function CoverageBar({ value, low = false }: { value: number; low?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2">
        <div
          className={`block h-full rounded-full ${low ? "bg-amber" : "bg-green"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-[34px] shrink-0 text-right text-xs font-semibold text-muted">{pct}%</span>
    </div>
  );
}
