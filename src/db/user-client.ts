/**
 * A Supabase client that Postgres sees as a specific user.
 *
 * Used only on the API-token path, where there are no auth cookies to build a
 * session from. Because the attached JWT carries `sub = userId`, every
 * existing RLS policy applies unchanged — this is emphatically NOT a
 * service-role client and must never be swapped for one.
 *
 * `SUPABASE_JWT_SECRET` is optional at the `env()` schema level (see
 * src/lib/env.ts for why) so it can never take down sign-in — which means
 * this is the one place that must fail loudly and CLOSED if it's missing:
 * no fallback to the anon key or service role, just a thrown error naming
 * exactly what's wrong and how to fix it.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mintUserJwt } from "@/lib/auth/user-jwt";
import { env } from "@/lib/env";
import type { Database } from "@/db/types";

export function userScopedClient(userId: string) {
  const secret = env().SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set — API token authentication is unavailable. Set it from the Supabase dashboard (Settings → API → JWT Secret).",
    );
  }
  const jwt = mintUserJwt(userId, secret, Math.floor(Date.now() / 1000));
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
