import { notFound } from "next/navigation";
import { voicePoolNumbers } from "@/lib/env";
import { serviceClient } from "@/db/service";
import { DEMO_TOKEN, DEMO_SEND } from "@/lib/mocks";
import { RecipientGate } from "./RecipientGate";

type ResolvedRequest = {
  firstName: string;
  senderName: string;
  templateTitle: string;
  estMinutes: number;
  pooledNumber: string;
  dialCode: string;
};

export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (token === DEMO_TOKEN) {
    return <RecipientGate request={DEMO_SEND} />;
  }

  const svc = serviceClient();
  const { data: request } = await svc
    .from("interview_requests")
    .select("id, token, dial_code, status, expires_at, template_snapshot, contact_id, organization_id")
    .eq("token", token)
    .maybeSingle();

  if (!request) notFound();
  if (["expired", "cancelled"].includes(request.status)) notFound();
  if (new Date(request.expires_at).getTime() < Date.now()) notFound();

  const [{ data: contact }, { data: org }] = await Promise.all([
    svc.from("contacts").select("first_name").eq("id", request.contact_id).maybeSingle(),
    svc.from("organizations").select("name").eq("id", request.organization_id).maybeSingle(),
  ]);

  const snapshot = request.template_snapshot as { name: string; questions?: unknown[] };
  const pool = voicePoolNumbers();
  const pooledNumber = pool[0] ?? "+18885551234";

  const resolved: ResolvedRequest = {
    firstName: contact?.first_name ?? "there",
    senderName: org?.name ?? "Your sender",
    templateTitle: snapshot?.name ?? "an interview",
    estMinutes: Math.max(2, Math.ceil((snapshot?.questions?.length ?? 3) * 1.2)),
    pooledNumber,
    dialCode: request.dial_code,
  };

  return <RecipientGate request={resolved} />;
}
