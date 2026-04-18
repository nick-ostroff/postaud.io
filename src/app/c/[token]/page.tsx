import { notFound } from "next/navigation";

/**
 * Recipient landing page. Server component.
 * Resolves token → fetches {firstName, senderName, templateTitle, pooledNumber, dialCode}
 * and renders a consent gate + tel: link.
 * See plan/01-product-plan.md §4 (Recipient UX).
 */
export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // TODO: resolve token via /api/public/request/[token]
  const request = null as null | {
    firstName: string;
    senderName: string;
    templateTitle: string;
    estMinutes: number;
    pooledNumber: string;
    dialCode: string;
  };

  if (!request) notFound();

  const telUri = `tel:${request.pooledNumber},,,${request.dialCode}`;

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">Hi {request.firstName}</h1>
      <p className="mt-3 text-neutral-600">
        {request.senderName} asked you to answer a few questions for{" "}
        <em>{request.templateTitle}</em>. About {request.estMinutes} minutes.
      </p>

      <label className="mt-8 flex items-start gap-3 text-left text-sm">
        <input type="checkbox" className="mt-1" />
        <span>I understand this call will be recorded.</span>
      </label>

      <a
        href={telUri}
        className="mt-8 block rounded-lg bg-neutral-900 px-6 py-5 text-lg font-medium text-white"
      >
        Tap to call
      </a>
      <p className="mt-3 text-xs text-neutral-500">You'll be connected to PostAud.io.</p>
    </main>
  );
}
