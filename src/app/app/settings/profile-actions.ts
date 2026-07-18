"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";

type UpdateNameResult = { ok: true } | { ok: false; error: string };

/**
 * Persists the current user's display name into Supabase auth
 * `user_metadata.full_name` AND mirrors it to `public.users.display_name` —
 * the nav/settings read auth metadata, but roster surfaces (series "Who's
 * involved", access page, members page) join `public.users`, so both stores
 * must move together. Then revalidates the app shell so everything picks it
 * up. The name is trimmed and falls back to the email prefix rather than
 * persisting an empty string.
 */
export async function updateProfileNameAction(name: string): Promise<UpdateNameResult> {
  const { user, supabase } = await getViewer();

  const fallback = user.email?.split("@")[0] || "You";
  const trimmed = name.trim();
  const full_name = trimmed.length > 0 ? trimmed : fallback;

  const { error } = await supabase.auth.updateUser({ data: { full_name } });
  if (error) return { ok: false, error: error.message };

  // The authenticated role has no UPDATE policy on `users` — mirror via the
  // service role, scoped to the caller's own row.
  const svc = serviceClient();
  const { error: mirrorErr } = await svc.from("users").update({ display_name: full_name }).eq("id", user.id);
  if (mirrorErr) return { ok: false, error: mirrorErr.message };

  // `series.subject_name` is snapshotted at creation for account-holding
  // subjects — carry the rename into every series this user is the subject
  // of, so cards, chips, and Anna's greeting all use the current name.
  const { error: subjectErr } = await svc
    .from("series")
    .update({ subject_name: full_name })
    .eq("subject_user_id", user.id);
  if (subjectErr) return { ok: false, error: subjectErr.message };

  revalidatePath("/app", "layout");
  return { ok: true };
}
