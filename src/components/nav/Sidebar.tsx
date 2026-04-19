"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/app",                  label: "Dashboard" },
  { href: "/app/templates",        label: "Templates" },
  { href: "/app/contacts",         label: "Contacts" },
  { href: "/app/sends",            label: "Sends" },
  { href: "/app/settings",         label: "Settings" },
  { href: "/app/settings/billing", label: "Billing" },
];

type Props = {
  orgName: string;
  email: string;
  creditsRemaining: number;
  creditsTotal: number;
};

export function Sidebar({ orgName, email, creditsRemaining, creditsTotal }: Props) {
  const pathname = usePathname();
  const pct = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a]">
      <div className="px-5 pb-4 pt-5">
        <Link href="/app" className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 hover:opacity-80 transition-opacity">
          PostAud<span className="text-neutral-400 dark:text-neutral-500">.io</span>
        </Link>
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{orgName}</div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 text-[13px] font-medium mt-2">
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
                "rounded-lg px-3 py-2 transition-colors " +
                (active
                  ? "bg-neutral-900 dark:bg-neutral-800 text-white dark:text-neutral-50"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-neutral-200")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-200 dark:border-neutral-800 px-5 py-4 text-xs font-medium">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Credits</span>
          <span className="text-neutral-900 dark:text-neutral-100">
            {creditsRemaining}
            <span className="text-neutral-400 dark:text-neutral-600"> / {creditsTotal}</span>
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full bg-neutral-900 dark:bg-neutral-200" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <div className="truncate text-neutral-700 dark:text-neutral-300">{email}</div>
          <form action="/auth/sign-out" method="POST">
            <button className="mt-2 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors">
              Sign out →
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
