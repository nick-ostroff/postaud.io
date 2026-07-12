"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/super/accounts", label: "Accounts" },
  { href: "/super/series", label: "Series" },
];

export function OpNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md px-3 py-1.5 text-[13px] font-semibold text-[#F7F5F0] bg-white/10"
                : "rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/55 hover:text-[#F7F5F0]"
            }
          >
            {item.label}
          </Link>
        );
      })}
      <span
        className="cursor-default select-none rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/30"
        title="Coming soon"
      >
        Activity
      </span>
    </nav>
  );
}
