"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";
import { generateApiToken, hashApiToken } from "@/lib/auth/api-token";

/**
 * Creates a token and returns the raw value ONCE. Only the hash is stored, so
 * this return value is the single opportunity to show it to the user.
 * Writes go through the viewer's own client, so the api_tokens RLS policy
 * guarantees a user can only mint tokens for themselves.
 */
export async function createToken(name: string): Promise<{ token: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A token name is required");

  const { user, supabase } = await getViewer();
  const token = generateApiToken();

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    token_hash: hashApiToken(token),
    name: trimmed,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/app/settings/tokens");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const { supabase } = await getViewer();
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/app/settings/tokens");
}
