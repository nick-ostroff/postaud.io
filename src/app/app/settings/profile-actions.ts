"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";

type UpdateNameResult = { ok: true } | { ok: false; error: string };

/**
 * Persists the current user's display name into Supabase auth
 * `user_metadata.full_name`, then revalidates the app shell so the nav,
 * sidebar, and settings header pick it up. The name is trimmed and falls back
 * to the email prefix rather than persisting an empty string.
 */
export async function updateProfileNameAction(name: string): Promise<UpdateNameResult> {
  const { user, supabase } = await getViewer();

  const fallback = user.email?.split("@")[0] || "You";
  const trimmed = name.trim();
  const full_name = trimmed.length > 0 ? trimmed : fallback;

  const { error } = await supabase.auth.updateUser({ data: { full_name } });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app", "layout");
  return { ok: true };
}
