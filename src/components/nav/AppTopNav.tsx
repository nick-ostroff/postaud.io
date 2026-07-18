"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { LogoLockup } from "./LogoMark";

/**
 * Mobile-only top nav: a full-bleed sticky bar on the same dark ink surface
 * as the desktop sidebar, identical on every screen — logo flush left, avatar
 * into the profile on the right. Back navigation lives in page content
 * (BackLink), never here, so the bar never shifts. The desktop sidebar covers
 * the same ground at `lg` and up, so this hides there — the two are never
 * both on screen.
 */
export function AppTopNav({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex items-center border-b border-dark-line bg-[rgba(33,30,26,0.94)] px-5 py-3 shadow-[0_1px_8px_rgba(33,30,26,0.15)] backdrop-blur lg:hidden">
      <Link href="/app" className="hover:no-underline">
        <LogoLockup dark size="md" />
      </Link>
      <Link
        href="/app/settings"
        aria-label="Your profile"
        className="ml-auto flex rounded-full ring-2 ring-mint/70 hover:no-underline"
      >
        <Avatar name={name} tone="warm-dark" size="lg" src={avatarUrl} />
      </Link>
    </header>
  );
}
