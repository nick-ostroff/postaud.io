type AvatarTone = "green" | "warm" | "warm-dark" | "plain";
type AvatarSize = "md" | "lg";

const toneClasses: Record<AvatarTone, string> = {
  green: "bg-green-tint text-green-deep",
  warm: "bg-amber-tint text-amber",
  /* amber legible on the dark sidebar (`.acct` avatar in the desktop mockups) */
  "warm-dark": "bg-[oklch(0.52_0.06_50_/_0.35)] text-[oklch(0.85_0.05_50)]",
  plain: "bg-[rgba(33,30,26,0.08)] text-muted",
};

const sizeClasses: Record<AvatarSize, string> = {
  md: "w-8 h-8 text-xs",
  lg: "w-11 h-11 text-[15px]",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Initials avatar matching `.avatar`/`.avatar.lg`/`.avatar.warm`/`.avatar.plain`
 * in postaudio-mockups.css. Pass `src` to show a cropped photo instead — it
 * fills the same circle and falls back to initials when absent.
 */
export function Avatar({
  name,
  tone = "green",
  size = "md",
  src,
}: {
  name: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  src?: string | null;
}) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${sizeClasses[size]}`;
  if (src) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }
  return <span className={`${base} ${toneClasses[tone]}`}>{initials(name)}</span>;
}
