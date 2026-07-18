"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { LogoLockup } from "@/components/nav/LogoMark";

/* Line icons from the `Postaudio Series Desktop` mockups (`.nico`, 19×19
   viewBox, stroke = currentColor). */
const icons = {
  home: (
    <path d="M3 8.2 9.5 3 16 8.2V16h-4.5v-4.5h-4V16H3V8.2z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  series: (
    <>
      <rect x="3" y="3.5" width="13" height="3" rx="1" strokeWidth="1.6" />
      <rect x="3" y="9" width="13" height="3" rx="1" strokeWidth="1.6" />
      <path d="M3 15.5h13" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  members: (
    <>
      <circle cx="7" cy="6.5" r="3" strokeWidth="1.6" />
      <path d="M2.5 15.5c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13.5" cy="7.5" r="2.2" strokeWidth="1.5" />
      <path d="M13 11.6c1.9.2 3.2 1.4 3.6 3.4" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="9.5" cy="9.5" r="2.6" strokeWidth="1.6" />
      <path d="M9.5 2.5v2.2m0 9.6v2.2m7-7h-2.2m-9.6 0H2.5" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  operator: (
    <path d="M9.5 2.8l5.2 2.1v4.2c0 3.1-2.1 5.4-5.2 6.7-3.1-1.3-5.2-3.6-5.2-6.7V4.9L9.5 2.8z" strokeWidth="1.6" strokeLinejoin="round" />
  ),
} as const;

type IconKey = keyof typeof icons;

const workspaceItems: { href: string; label: string; icon: IconKey }[] = [
  { href: "/app", label: "Home", icon: "home" },
  { href: "/app/series", label: "Series", icon: "series" },
  { href: "/app/members", label: "Members", icon: "members" },
];

const youItems: { href: string; label: string; icon: IconKey }[] = [
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

type Props = {
  name: string;
  role: string;
  isPlatformAdmin?: boolean;
  avatarUrl?: string | null;
};

function SectionLabel({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={`px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-[rgba(240,237,230,0.5)] ${first ? "" : "pt-6"}`}
    >
      {children}
    </div>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: IconKey }) {
  const pathname = usePathname();
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "mb-1 flex items-center gap-3 rounded-sm border px-2.5 py-2.5 text-[14.5px] hover:no-underline " +
        (active
          ? "border-[oklch(0.52_0.06_165_/_0.4)] bg-[oklch(0.52_0.06_165_/_0.28)] font-semibold text-white"
          : "border-transparent font-medium text-[rgba(240,237,230,0.75)] hover:bg-[rgba(240,237,230,0.07)] hover:text-[rgba(240,237,230,0.95)]")
      }
    >
      <svg aria-hidden viewBox="0 0 19 19" fill="none" stroke="currentColor" className="h-[17px] w-[17px] shrink-0">
        {icons[icon]}
      </svg>
      {label}
    </Link>
  );
}

export function Sidebar({ name, role, isPlatformAdmin = false, avatarUrl }: Props) {
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col bg-dark px-4 pb-5 pt-6 text-[#F0EDE6] lg:flex">
      <div className="px-2 pb-6">
        <LogoLockup dark size="md" />
      </div>

      <SectionLabel first>Workspace</SectionLabel>
      {workspaceItems.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}

      <SectionLabel>You</SectionLabel>
      {youItems.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}

      {isPlatformAdmin && (
        <>
          <SectionLabel>Platform</SectionLabel>
          <NavItem href="/super" label="Operator console" icon="operator" />
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 rounded-[12px] bg-[rgba(240,237,230,0.07)] px-2.5 py-3">
        <Avatar name={name} src={avatarUrl} tone="warm-dark" />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-white">{name}</div>
          <div className="text-xs text-[rgba(240,237,230,0.55)]">{role}</div>
        </div>
      </div>
      <form action="/auth/sign-out" method="POST" className="px-2.5 pt-2.5">
        <button className="text-xs font-medium text-[rgba(240,237,230,0.55)] hover:text-white">
          Sign out →
        </button>
      </form>
    </aside>
  );
}
