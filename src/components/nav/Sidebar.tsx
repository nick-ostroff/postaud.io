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
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 pb-4 pt-5">
        <Link href="/app" className="text-lg font-semibold tracking-tight">
          PostAud<span className="text-neutral-400">.io</span>
        </Link>
        <div className="mt-1 text-xs text-neutral-500">{orgName}</div>
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
            {creditsRemaining}
            <span className="text-neutral-400"> / {creditsTotal}</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full bg-neutral-900" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 border-t border-neutral-200 pt-4">
          <div className="truncate text-neutral-700">{email}</div>
          <form action="/auth/sign-out" method="POST">
            <button className="mt-2 text-neutral-500 hover:text-neutral-900">
              Sign out →
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
