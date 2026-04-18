import { notFound } from "next/navigation";
import { DEMO_TOKEN, DEMO_SEND } from "@/lib/mocks";
import { RecipientGate } from "./RecipientGate";

/**
 * Recipient landing page. Server component resolves token,
 * hands data to a client component that renders the consent gate.
 */
export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Mock-flow: only the demo token works until the token-resolve API lands.
  if (token !== DEMO_TOKEN) notFound();

  return <RecipientGate request={DEMO_SEND} />;
}
