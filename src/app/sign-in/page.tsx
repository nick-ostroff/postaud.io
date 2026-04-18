import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to PostAud.io</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Mock flow — Supabase Auth wiring lands next.
        </p>

        <div className="mt-6 space-y-3">
          <label className="block text-xs font-medium text-neutral-600">Email</label>
          <input
            type="email"
            defaultValue="nick@pixelocity.com"
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />

          <Link
            href="/app"
            className="mt-4 flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Continue
          </Link>
          <Link
            href="/app"
            className="flex w-full items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
          >
            Continue with Google
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          <Link href="/" className="hover:underline">← Back to homepage</Link>
        </p>
      </div>
    </main>
  );
}
