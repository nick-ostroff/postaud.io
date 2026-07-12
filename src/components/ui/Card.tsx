import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

/** Bare panel matching `.card` in postaudio-mockups.css — no built-in padding, compose with your own (e.g. `className="px-[22px] py-5"` for `.card-pad`). */
export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={`bg-card border border-line rounded-card shadow-card ${className}`} {...rest}>
      {children}
    </div>
  );
}
