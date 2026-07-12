import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/db/server";
import { serviceClient } from "@/db/service";

const acceptSchema = z.object({ organizationId: z.string().uuid() });

/**
 * POST /welcome/accept — final step of the invited-member first-login flow.
 * Marks the caller's own membership as accepted (`accepted_at = now()`).
 * Scoped to the authenticated caller's own row (never trusts a body-supplied
 * user id) *and* to the specific organization shown on the /welcome screen
 * (V1 is single-workspace-per-user, but scoping by org id keeps this from
 * ever accepting the wrong membership if that ever changes) — runs via the
 * service client since `authenticated` has no UPDATE policy on
 * `memberships`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const svc = serviceClient();
  const { error } = await svc
    .from("memberships")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("organization_id", parsed.data.organizationId)
    .is("accepted_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
