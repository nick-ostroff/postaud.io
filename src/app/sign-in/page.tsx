import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/ui/Wordmark";
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
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[60px] left-8 select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)]"
      >
        &rdquo;
      </span>

      <Card className="relative w-full max-w-[400px] px-[38px] pt-9 pb-8">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Welcome back</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">Sign in to keep the stories going.</p>

        {errorMessage && (
          <div className="mb-5 rounded-sm border border-amber-tint bg-amber-tint px-4 py-3 text-[13.5px] text-amber">
            {errorMessage}
          </div>
        )}

        <SignInForm next={next} />
      </Card>

      <p className="relative mt-6 text-center text-[12.5px] text-muted">
        New here? Someone in your family usually opens the door.
      </p>

      <p className="serif relative mt-14 text-[16px] italic text-faint">
        &raquo;Tell me about the ferry.&laquo;
      </p>
    </main>
  );
}
