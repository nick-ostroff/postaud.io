"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SUPER_NAV_ITEMS, isSuperNavActive } from "./SuperNav";

/**
 * Mobile-only ☰ "Sections" trigger + dark overlay menu — the sidebar's
 * destinations plus operator identity and sign-out, for phones where the
 * left sidebar is hidden (see SuperShell). Closes on navigation.
 */
export function SuperMobileMenu({ operatorEmail }: { operatorEmail: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the overlay on navigation. Adjusted during render (not an effect)
  // per React's "you might not need an effect" guidance — avoids the
  // cascading-render lint error from setState inside useEffect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const initial = operatorEmail ? operatorEmail[0]!.toUpperCase() : "S";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label="Open sections menu"
        className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-medium text-white/80"
      >
        <span aria-hidden>☰</span> Sections
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close sections menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45"
          />
          <div className="absolute inset-x-0 top-0 flex flex-col gap-1 bg-[#1B1814] px-5 pb-6 pt-5 text-[#F0EDE6] shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/50">Sections</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close sections menu"
                className="text-xl leading-none text-white/70"
              >
                ×
              </button>
            </div>

            {SUPER_NAV_ITEMS.map((item) => {
              const active = isSuperNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "rounded-lg bg-green/28 px-3 py-2.5 text-[14px] font-semibold text-white"
                      : "rounded-lg px-3 py-2.5 text-[14px] text-[rgba(240,237,230,0.7)]"
                  }
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-4 flex items-center gap-[9px] border-t border-white/10 px-3 pt-4">
              <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-green/25 text-[11px] font-semibold text-mint">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#F0EDE6]">Operator</div>
                <div className="truncate text-[10.5px] text-[rgba(240,237,230,0.5)]">{operatorEmail}</div>
              </div>
            </div>

            <Link href="/app" className="px-3 py-2 text-[13px] font-medium text-[rgba(240,237,230,0.6)]">
              ← Back to app
            </Link>

            <form action="/auth/sign-out" method="POST" className="px-3">
              <button type="submit" className="text-[13px] font-medium text-[rgba(240,237,230,0.6)] hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
