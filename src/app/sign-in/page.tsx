import Link from "next/link";
import { LogoLockup } from "@/components/nav/LogoMark";
import { Card } from "@/components/ui/Card";
import { SignInForm } from "./SignInForm";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Every value `?error=` can carry, straight from `auth/callback/route.ts`:
 * `missing_code`, `bootstrap_failed`, or a raw Supabase `error.message`
 * (arbitrary text, not a fixed code). Only the two known slugs get a human
 * message here — anything else (including an attacker-crafted query string,
 * since this value is never validated server-side before landing in the
 * URL) renders nothing rather than echoing arbitrary text into a branded
 * login card on the real domain.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  missing_code: "That link is missing something — please try signing in again.",
  bootstrap_failed: "We couldn't finish setting up your account. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorMessage = error ? SIGN_IN_ERRORS[error] : undefined;

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-paper px-6 py-14">
      {/* The green glow spilling off the top (mockup 6a) — on mobile it's the
          only atmosphere there's room for; the quote mark joins it at `sm`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[150px] left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.52_0.06_165_/_0.14)_0%,transparent_68%)]"
      />
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[60px] left-8 hidden select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)] sm:block"
      >
        &rdquo;
      </span>

      {/* Card-less on a phone (mockup 6a puts the form straight on the paper);
          the card returns at `sm`, where it has room to read as one. */}
      <Card className="relative w-full max-w-[400px] border-0 bg-transparent px-0 pb-0 pt-0 shadow-none sm:border sm:bg-card sm:px-[38px] sm:pb-8 sm:pt-9 sm:shadow-card">
        <Link href="/" aria-label="PostAud.io home" className="hover:no-underline">
          <LogoLockup />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Welcome back</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">Your stories are waiting.</p>

        {errorMessage && (
          <div className="mb-5 rounded-sm border border-amber-tint bg-amber-tint px-4 py-3 text-[13.5px] text-amber">
            {errorMessage}
          </div>
        )}

        <SignInForm next={next} />
      </Card>

      <p className="relative mt-6 text-center text-[12.5px] text-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-medium">
          Create an account
        </Link>
      </p>

      <p className="serif relative mt-14 hidden text-[16px] italic text-faint sm:block">
        &raquo;Tell me about the ferry.&laquo;
      </p>
    </main>
  );
}
