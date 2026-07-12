type AvatarTone = "green" | "warm" | "plain";
type AvatarSize = "md" | "lg";

const toneClasses: Record<AvatarTone, string> = {
  green: "bg-green-tint text-green-deep",
  warm: "bg-amber-tint text-amber",
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

/** Initials avatar matching `.avatar`/`.avatar.lg`/`.avatar.warm`/`.avatar.plain` in postaudio-mockups.css. */
export function Avatar({ name, tone = "green", size = "md" }: { name: string; tone?: AvatarTone; size?: AvatarSize }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${toneClasses[tone]} ${sizeClasses[size]}`}
    >
      {initials(name)}
    </span>
  );
}
