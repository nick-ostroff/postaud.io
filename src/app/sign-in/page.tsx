import Link from "next/link";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to PostAud.io</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We'll email you a one-time sign-in link.
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <SignInForm next={next} />

        <p className="mt-6 text-center text-xs text-neutral-500">
          <Link href="/" className="hover:underline">← Back to homepage</Link>
        </p>
      </div>
    </main>
  );
}
