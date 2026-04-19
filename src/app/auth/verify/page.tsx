import Link from "next/link";

export const metadata = { title: "Email verified" };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        You&apos;re in.
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Your email is verified and your account is ready.
      </p>
      <Link
        href="/app"
        className="mt-8 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
      >
        Go to your dashboard
      </Link>
    </div>
  );
}
