import { NextResponse, type NextRequest } from "next/server";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import { serviceClient } from "@/db/service";

/**
 * Writes an audit trail entry for an impersonation request. V1 ships the
 * audit trail only — this does NOT grant access to any account content.
 * See spec §7.5: operators see metadata only; real impersonation is out of
 * scope for V1.
 */
export async function POST(req: NextRequest) {
  const email = await platformAdminEmail();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const orgId = typeof body?.orgId === "string" ? body.orgId : null;
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "Missing orgId" }, { status: 400 });
  }

  const svc = serviceClient();
  const { error } = await svc.from("audit_logs").insert({
    organization_id: orgId,
    target_type: "organization",
    target_id: orgId,
    action: "admin.impersonation_requested",
    actor_email: email,
    meta: { orgId },
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: "audit trail only in V1" });
}
