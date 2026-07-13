import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/db/server";
import { IMP_COOKIE, prevChunkNames } from "@/lib/auth/impersonation";
import { env } from "@/lib/env";

/**
 * Sign-out is the de-facto FALLBACK escape hatch from an impersonation session
 * — the operator can always reach it even if Exit misbehaves — so it has to
 * tear down the operator cookies too.
 *
 * Leaving them behind is not cosmetic: `pa_op_imp` outlives the Supabase
 * session, so after the operator signs back in as themselves the banner would
 * claim an impersonation is still active, and Exit would replay a stale
 * `pa_op_prev` stash holding a dead session.
 */
export async function POST() {
  const origin = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const supabase = await createClient();
  await supabase.auth.signOut();

  const store = await cookies();
  const all = store.getAll().map((c) => ({ name: c.name, value: c.value }));
  for (const name of prevChunkNames(all)) {
    store.delete(name);
  }
  store.delete(IMP_COOKIE);

  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
