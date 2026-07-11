import { NextResponse } from "next/server";
import { createClient } from "@/db/server";
import { serviceClient } from "@/db/service";

/**
 * POST /welcome/accept — final step of the invited-member first-login flow.
 * Marks the caller's own membership as accepted (`accepted_at = now()`).
 * Scoped to the authenticated caller's own row (never trusts a body-supplied
 * user id) and runs via the service client since `authenticated` has no
 * UPDATE policy on `memberships`.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const svc = serviceClient();
  const { error } = await svc
    .from("memberships")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("accepted_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
