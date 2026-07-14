import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/nav/LogoMark";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false },
};

/**
 * What the installed app shows when a page load fails with no network. The
 * service worker precaches this route at install (`public/sw.js`), so it must
 * stay fully static — no data fetching, no client state. "Try again" is a
 * plain link, so it still works if the JS chunks never made it to disk.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center px-5 py-16">
      <Card className="w-full max-w-md px-[22px] py-8 text-center">
        <div className="flex justify-center">
          <LogoMark size={36} />
        </div>
        <h1 className="mt-5 text-[22px]">You&rsquo;re offline</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          PostAud.io needs a connection to talk with you and to save what you
          share. Nothing from your last session was lost.
        </p>
        <Link href="/app" className={buttonClasses({ variant: "ink", className: "mt-6" })}>
          Try again
        </Link>
      </Card>
    </main>
  );
}
