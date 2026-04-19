import Link from "next/link";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111111] p-10 shadow-2xl transition-all">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-2 hover:opacity-80 transition-opacity">PostAud.io</Link>
          <h1 className="text-xl font-medium text-neutral-500 dark:text-neutral-400">Welcome back</h1>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-[15px] text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}

        <SignInForm next={next} />

        <p className="mt-8 text-center text-[15px] font-medium text-neutral-500 dark:text-neutral-500">
          <Link href="/" className="hover:text-neutral-900 dark:hover:text-white transition-colors">← Back to homepage</Link>
        </p>
      </div>
    </main>
  );
}
