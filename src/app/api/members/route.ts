import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { InviteMemberError, inviteMember } from "@/server/members/invite";

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
    const { userId } = await inviteMember({
      email: parsed.data.email,
      role: parsed.data.role,
      orgId: organization.id,
      invitedBy: user.id,
    });
    // `userId` lets callers (e.g. the series wizard's inline invite row)
    // immediately add the new member to local state without a re-fetch.
    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    if (err instanceof InviteMemberError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send invite." },
      { status: 500 },
    );
  }
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
  const { data, error } = await svc
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("user_id", parsed.data.userId)
    .eq("organization_id", organization.id)
    .select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
