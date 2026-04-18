import Link from "next/link";

export default function MarketingHome() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-5xl font-semibold tracking-tight">Interviews, without the interview.</h1>
      <p className="mt-6 text-lg text-neutral-600">
        Send a text, get a transcript, a summary, and the exact output you need — from a 3-minute
        AI-guided phone call your recipient takes whenever they want.
      </p>
      <div className="mt-10 flex gap-3">
        <Link
          href="/sign-in"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Get started
        </Link>
        <Link href="/pricing" className="rounded-md border px-4 py-2 text-sm font-medium">
          Pricing
        </Link>
      </div>
      <ul className="mt-16 grid gap-6 text-sm text-neutral-700 sm:grid-cols-3">
        <li>
          <strong className="block">Text to transcript in minutes.</strong>
          One SMS, one tap, one call.
        </li>
        <li>
          <strong className="block">AI that listens and follows up.</strong>
          Asks the clarifier you would.
        </li>
        <li>
          <strong className="block">Goes where your work lives.</strong>
          Webhooks, CRM, inbox.
        </li>
      </ul>
    </main>
  );
}
