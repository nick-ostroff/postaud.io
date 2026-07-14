import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ink" | "ghost" | "quiet-danger";
type ButtonSize = "md" | "big";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex items-center gap-2 cursor-pointer font-semibold rounded-pill border transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  secondary: "bg-card border-line-strong text-ink hover:border-ink-soft",
  primary: "bg-green border-green text-white hover:bg-green-deep hover:border-green-deep",
  // Ink, not green: the mockups reserve green for the action that *commits*
  // something (accept an invite, start talking) and use ink for the plain
  // "get me in" CTA — sign in, next step of a wizard.
  ink: "bg-ink border-ink text-paper hover:bg-ink-soft hover:border-ink-soft",
  ghost: "border-transparent bg-transparent text-muted hover:text-ink hover:border-transparent hover:no-underline",
  "quiet-danger": "text-amber border-amber-tint bg-amber-tint",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "text-[13.5px] px-[18px] py-[9px]",
  big: "text-[15.5px] px-[28px] py-[14px]",
};

/**
 * Single source of truth for button styling — used both by the `<Button>`
 * element below and by anywhere else that needs the same look on a
 * non-`<button>` element (e.g. a `<Link>` that should look like a button
 * without nesting an actual `<button>` inside an `<a>`, which is invalid
 * HTML).
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

/** Pill-shaped button matching `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-quiet-danger` in postaudio-mockups.css. */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...buttonProps
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...buttonProps} />;
}
