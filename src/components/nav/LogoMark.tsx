/** The waveform-in-a-square mark from the mobile nav (`.tmark` in the mockups). */
export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  const bars = [
    { h: 0.25, w: 2, o: 0.55 },
    { h: 0.46, w: 2, o: 0.8 },
    { h: 0.33, w: 2, o: 0.8 },
    { h: 0.46, w: 4, o: 1 },
  ];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center gap-[1.5px] rounded-md bg-green ${className}`}
      style={{ width: size, height: size }}
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className="block rounded-[1px] bg-white"
          style={{ width: b.w, height: Math.round(size * b.h), opacity: b.o }}
        />
      ))}
    </span>
  );
}

/** Mark + lowercase wordmark, as it appears in the mobile top nav. */
export function LogoLockup({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className={`text-sm font-semibold tracking-[-0.02em] ${dark ? "text-paper" : "text-ink"}`}>
        postaud<span className={dark ? "text-mint" : "text-green"}>.io</span>
      </span>
    </span>
  );
}
