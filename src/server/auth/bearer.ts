/**
 * Resolves an `Authorization: Bearer pat_…` header to a caller.
 *
 * The api_tokens lookup uses the service role because the caller has no
 * identity yet — that is the one and only service-role read on this path. The
 * client handed back is user-scoped, so everything downstream runs under
 * normal RLS.
 *
 * Returns null for every failure mode (missing, malformed, unknown, revoked)
 * so callers cannot accidentally distinguish "no such token" from "revoked".
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/db/service";
import { userScopedClient } from "@/db/user-client";
import { hashApiToken, looksLikeApiToken } from "@/lib/auth/api-token";
import type { Database } from "@/db/types";

export type ApiCaller = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

export async function resolveApiToken(request: Request): Promise<ApiCaller | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!looksLikeApiToken(token)) return null;

  const svc = serviceClient();
  const { data } = await svc
    .from("api_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hashApiToken(token))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Best-effort: a failed stamp must not fail the request. supabase-js
  // resolves `{ error }` for HTTP-level failures, but a fetch-level
  // rejection (network error, DNS failure, etc.) THROWS — awaiting this
  // would take down auth for every bearer route on exactly the kind of
  // transient failure this comment says must not matter. Fire-and-forget
  // with no-op handlers instead.
  void svc
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => {},
      () => {},
    );

  return { userId: data.user_id, supabase: userScopedClient(data.user_id) };
}
