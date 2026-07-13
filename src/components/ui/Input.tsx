import type { InputHTMLAttributes } from "react";

/** Input styling WITHOUT a width — callers own their own width. Matches `.input` in postaudio-mockups.css. */
export const inputBase =
  "rounded-sm border border-line-strong bg-card px-[13px] py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

/** The common case: a full-width input. */
export const inputClasses = `w-full ${inputBase}`;

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClasses} ${className}`} {...rest} />;
}
