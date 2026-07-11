"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";

const workspaceItems = [
  { href: "/app", label: "Home", icon: "⌂" },
  { href: "/app/series", label: "Series", icon: "▤" },
  { href: "/app/members", label: "Members", icon: "☺" },
];

const youItems = [{ href: "/app/settings", label: "Settings", icon: "⚙" }];

type Props = {
  name: string;
  role: string;
};

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname();
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] font-medium " +
        (active
          ? "bg-green-tint text-green-deep font-semibold"
          : "text-ink-soft hover:bg-[rgba(33,30,26,0.05)] hover:no-underline")
      }
    >
      <span aria-hidden>{icon}</span> {label}
    </Link>
  );
}

export function Sidebar({ name, role }: Props) {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-1 border-r border-line bg-paper-2 p-3.5">
      <div className="serif px-2.5 pb-[18px] text-[19px]">
        post<b className="font-semibold text-green-deep">aud</b>.io
      </div>

      <div className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
        Workspace
      </div>
      {workspaceItems.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}

      <div className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
        You
      </div>
      {youItems.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-line p-2.5">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink">{name}</div>
          <div className="text-xs text-faint">{role}</div>
        </div>
      </div>
      <form action="/auth/sign-out" method="POST" className="px-2.5">
        <button className="text-xs font-medium text-faint hover:text-ink">Sign out →</button>
      </form>
    </aside>
  );
}
