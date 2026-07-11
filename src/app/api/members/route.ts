import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { inviteMember } from "@/server/members/invite";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "interviewer", "viewer"]),
});

const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "interviewer", "viewer"]),
});

// POST /api/members — invite a new (or existing) user into the caller's
// workspace. Admin-only: guarded by the caller's own membership role.
export async function POST(request: Request) {
  const { user, organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and role." }, { status: 400 });
  }

  try {
    await inviteMember({
      email: parsed.data.email,
      role: parsed.data.role,
      orgId: organization.id,
      invitedBy: user.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send invite." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/members — change an existing member's role. Admin-only.
export async function PATCH(request: Request) {
  const { organization, role } = await getViewer();
  if (!organization || role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = roleUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const svc = serviceClient();
  const { error } = await svc
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("user_id", parsed.data.userId)
    .eq("organization_id", organization.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
