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

/** Mark + lowercase wordmark, as it appears in the mobile top nav. `size="md"`
 *  scales both the mark and wordmark up a notch for the app header; the default
 *  keeps the auth/welcome/offline lockups untouched. */
export function LogoLockup({ dark = false, size = "sm" }: { dark?: boolean; size?: "sm" | "md" }) {
  const markSize = size === "md" ? 28 : 24;
  const wordSize = size === "md" ? "text-base" : "text-sm";
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={markSize} />
      <span className={`${wordSize} font-semibold tracking-[-0.02em] ${dark ? "text-paper" : "text-ink"}`}>
        postaud<span className={dark ? "text-mint" : "text-green"}>.io</span>
      </span>
    </span>
  );
}
