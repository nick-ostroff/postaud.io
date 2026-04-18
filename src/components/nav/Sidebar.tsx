"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mockOrg } from "@/lib/mocks";

const navItems = [
  { href: "/app",                  label: "Dashboard" },
  { href: "/app/templates",        label: "Templates" },
  { href: "/app/contacts",         label: "Contacts" },
  { href: "/app/sends",            label: "Sends" },
  { href: "/app/settings",         label: "Settings" },
  { href: "/app/settings/billing", label: "Billing" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 pb-4 pt-5">
        <Link href="/app" className="text-lg font-semibold tracking-tight">
          PostAud<span className="text-neutral-400">.io</span>
        </Link>
        <div className="mt-1 text-xs text-neutral-500">{mockOrg.name}</div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 text-sm">
        {navItems.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "rounded-md px-3 py-2 transition-colors " +
                (active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-200 px-5 py-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Credits</span>
          <span className="font-medium">
            {mockOrg.credits_remaining}
            <span className="text-neutral-400"> / {mockOrg.credits_total}</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-neutral-900"
            style={{
              width: `${(mockOrg.credits_remaining / mockOrg.credits_total) * 100}%`,
            }}
          />
        </div>
      </div>
    </aside>
  );
}
