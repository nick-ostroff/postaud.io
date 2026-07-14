"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SuperNavItem = { href: string; label: string; mobileLabel?: string };

/**
 * Shared destinations for the desktop sidebar, the mobile bottom bar, and
 * the mobile Sections overlay — one list so all three surfaces can't drift.
 * Dashboard/Users/Series/Usage; Dashboard/Series/Usage routes ship in later
 * tasks (R3/R4) but the links are correct now.
 */
export const SUPER_NAV_ITEMS: SuperNavItem[] = [
  { href: "/super", label: "Dashboard", mobileLabel: "Pulse" },
  { href: "/super/users", label: "Users" },
  { href: "/super/series", label: "Series" },
  { href: "/super/usage", label: "Usage" },
];

/** Dashboard is active only on an exact match; every other item via startsWith. */
export function isSuperNavActive(pathname: string | null, href: string): boolean {
  if (href === "/super") return pathname === "/super";
  return pathname?.startsWith(href) ?? false;
}

/** Desktop sidebar nav — active item gets a mint dot + tinted background. */
export function SuperSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-[3px]">
      {SUPER_NAV_ITEMS.map((item) => {
        const active = isSuperNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "flex items-center gap-[9px] rounded-lg bg-green/28 px-3 py-[9px] text-[13px] font-semibold text-white"
                : "flex items-center gap-[9px] rounded-lg px-3 py-[9px] text-[13px] text-[rgba(240,237,230,0.6)] hover:text-white"
            }
          >
            <span
              aria-hidden
              className={active ? "h-[5px] w-[5px] flex-none rounded-full bg-mint" : "h-[5px] w-[5px] flex-none rounded-full bg-transparent"}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile fixed bottom tab bar — same four destinations, active tab in green. */
export function SuperBottomBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-line bg-white lg:hidden">
      {SUPER_NAV_ITEMS.map((item) => {
        const active = isSuperNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-green"
                : "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted"
            }
          >
            {item.mobileLabel ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}
