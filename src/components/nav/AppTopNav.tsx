"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { LogoLockup } from "./LogoMark";

/**
 * The parent screen for the back chevron: one segment up. `/app/memories/x`
 * → `/app/memories`, `/app/series/x` → `/app/series`, `/app` → none. Every
 * intermediate path in this app is itself a real page, so stripping a
 * segment never lands on a 404.
 */
function parentOf(pathname: string): string | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length <= 1) return null; // "/app" itself
  return "/" + segments.slice(0, -1).join("/");
}

/**
 * Mobile-only top nav (mockups Home 1a / 2a / 3c): a full-bleed sticky bar on
 * the same dark ink surface as the desktop sidebar, carrying the logo, a back
 * chevron on any screen below the root, and the avatar into the profile. The
 * desktop sidebar covers the same ground at `lg` and up, so this hides there —
 * the two are never both on screen.
 */
export function AppTopNav({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const pathname = usePathname();
  const parent = parentOf(pathname);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-dark-line bg-[rgba(33,30,26,0.94)] px-5 py-3 shadow-[0_1px_8px_rgba(33,30,26,0.15)] backdrop-blur lg:hidden">
      {parent && (
        <Link
          href={parent}
          aria-label="Back"
          className="-ml-2 flex h-9 w-9 items-center justify-center text-[20px] leading-none text-[rgba(240,237,230,0.7)] hover:no-underline"
        >
          ‹
        </Link>
      )}
      <Link href="/app" className="hover:no-underline">
        <LogoLockup dark size="md" />
      </Link>
      <Link href="/app/settings" aria-label="Your profile" className="ml-auto hover:no-underline">
        <Avatar name={name} tone="warm-dark" size="lg" src={avatarUrl} />
      </Link>
    </header>
  );
}
