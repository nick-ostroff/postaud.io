"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import { adjustOrgCredits, setOrgStatus } from "@/db/queries/admin";

export async function adjustCreditsAction(formData: FormData) {
  const email = await platformAdminEmail();
  if (!email) throw new Error("Not authorized");

  const orgId = String(formData.get("orgId") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orgId) throw new Error("Missing orgId");
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Delta must be a non-zero number");
  if (reason.length < 3) throw new Error("Reason is required");

  await adjustOrgCredits({ orgId, delta, reason, actorEmail: email });

  revalidatePath(`/admin/accounts/${orgId}`);
  redirect(`/admin/accounts/${orgId}`);
}

export async function setStatusAction(formData: FormData) {
  const email = await platformAdminEmail();
  if (!email) throw new Error("Not authorized");

  const orgId = String(formData.get("orgId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "");
  if (!orgId) throw new Error("Missing orgId");
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    throw new Error("Invalid status");
  }

  await setOrgStatus({ orgId, status: nextStatus, actorEmail: email });

  revalidatePath(`/admin/accounts/${orgId}`);
  redirect(`/admin/accounts/${orgId}`);
}
