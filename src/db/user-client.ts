/**
 * A Supabase client that Postgres sees as a specific user.
 *
 * Used only on the API-token path, where there are no auth cookies to build a
 * session from. Because the attached JWT carries `sub = userId`, every
 * existing RLS policy applies unchanged — this is emphatically NOT a
 * service-role client and must never be swapped for one.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mintUserJwt } from "@/lib/auth/user-jwt";
import type { Database } from "@/db/types";

export function userScopedClient(userId: string) {
  const jwt = mintUserJwt(userId, process.env.SUPABASE_JWT_SECRET!, Math.floor(Date.now() / 1000));
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `accessToken` is the current API for supplying a custom JWT. Setting
      // `global.headers.Authorization` is explicitly deprecated by Supabase
      // ("no longer recommended … causes confusion when combined with a user
      // session"). The anon key still travels separately as `apikey` — the
      // minted JWT cannot serve that role.
      accessToken: async () => jwt,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
