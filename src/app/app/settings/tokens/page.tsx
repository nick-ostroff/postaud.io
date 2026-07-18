import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getViewer } from "@/db/queries";
import type { Tables } from "@/db/types";
import { TokenManager } from "./TokenManager";

export type ApiTokenRow = Pick<
  Tables<"api_tokens">,
  "id" | "name" | "created_at" | "last_used_at" | "revoked_at"
>;

/**
 * Personal access tokens for external clients (currently: the Obsidian
 * plugin). Reads go through the viewer's own client — the `api_tokens` RLS
 * policy (`user_id = auth.uid()`) already scopes this to the caller's own
 * rows, so there's no need to filter by user_id here.
 *
 * `token_hash` is never selected: the raw token only ever exists in memory,
 * once, immediately after `createToken` returns — this page can't show a
 * token it doesn't have, by construction.
 */
export default async function TokensPage() {
  const { supabase } = await getViewer();

  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const tokens: ApiTokenRow[] = data ?? [];

  return (
    <div className="mx-auto w-full">
      <div className="mb-[22px]">
        <Link href="/app/settings" className="text-[12.5px] font-medium text-muted hover:text-ink">
          ‹ Settings
        </Link>
        <h1 className="mt-1 text-[28px]">Access tokens</h1>
        <p className="mt-[3px] max-w-3xl text-[13.5px] text-muted">
          Tokens let external tools — like the Obsidian plugin — read and write your postaud.io data on your
          behalf. Treat a token like a password: anyone who has it can act as you until you revoke it.
        </p>
      </div>

      <Card className="max-w-3xl px-[22px] py-5">
        <TokenManager tokens={tokens} />
      </Card>
    </div>
  );
}
