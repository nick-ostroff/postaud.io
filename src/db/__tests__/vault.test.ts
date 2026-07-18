import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { getVaultLink, isPushPending, listPendingVaultLinks, type VaultLink } from "@/db/queries/vault";

describe("isPushPending", () => {
  it("is pending when the user pressed Send and the plugin has never acked", () => {
    expect(isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: null })).toBe(true);
  });

  it("is not pending before the user ever pressed Send", () => {
    expect(isPushPending({ push_requested_at: null, last_acked_at: null })).toBe(false);
    expect(isPushPending({ push_requested_at: null, last_acked_at: "2026-07-18T10:00:00Z" })).toBe(false);
  });

  it("is not pending once the plugin acks a later timestamp", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:01Z" }),
    ).toBe(false);
  });

  it("is pending again when the user presses Send after the last ack", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T11:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(true);
  });

  it("treats an ack at the exact request time as collected", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(false);
  });
});

/**
 * IMPORTANT 4 (final review): `getVaultLink` / `listPendingVaultLinks`
 * previously relied on RLS ALONE for cross-tenant isolation — the queries
 * did a bare `select("series_id", ...)` / `select("*")` with no `user_id`
 * filter, and RLS-under-a-minted-JWT has never executed against a real
 * database. This stub seeds rows for two different users and applies the
 * `.eq()` filters for real (not just recording call args), so these tests
 * would fail if either function stopped filtering by `user_id`.
 */
function makeVaultLinksStub(rows: VaultLink[]) {
  return {
    from(table: string) {
      if (table !== "series_vault_links") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          let filtered = [...rows];
          const builder = {
            eq(col: keyof VaultLink, val: string) {
              filtered = filtered.filter((r) => r[col] === val);
              return builder;
            },
            order(col: keyof VaultLink, opts?: { ascending?: boolean }) {
              const dir = opts?.ascending === false ? -1 : 1;
              filtered = [...filtered].sort((a, b) => {
                const av = (a[col] as string | null) ?? "";
                const bv = (b[col] as string | null) ?? "";
                return av < bv ? -dir : av > bv ? dir : 0;
              });
              return builder;
            },
            maybeSingle() {
              return Promise.resolve({ data: filtered[0] ?? null, error: null });
            },
            then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
              return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("getVaultLink (defence in depth: explicit user_id filter)", () => {
  it("returns null for a series_id that belongs to a different user, even though RLS is only simulated here", async () => {
    const stub = makeVaultLinksStub([
      {
        series_id: "series-1",
        user_id: "user-B",
        label: "User B's vault",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: null,
        last_acked_at: null,
      },
    ]);

    const link = await getVaultLink(stub, "series-1", "user-A");

    expect(link).toBeNull();
  });

  it("returns the caller's own row when it exists", async () => {
    const stub = makeVaultLinksStub([
      {
        series_id: "series-1",
        user_id: "user-A",
        label: "My Vault",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: null,
        last_acked_at: null,
      },
    ]);

    const link = await getVaultLink(stub, "series-1", "user-A");

    expect(link?.label).toBe("My Vault");
  });
});

describe("listPendingVaultLinks (defence in depth: explicit user_id filter, MINOR 9: ordered)", () => {
  it("never returns another user's pending link, even one that would otherwise match isPushPending", async () => {
    const stub = makeVaultLinksStub([
      {
        series_id: "series-1",
        user_id: "user-B",
        label: "User B's vault",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: "2026-07-18T11:00:00.000Z",
        last_acked_at: null,
      },
    ]);

    const links = await listPendingVaultLinks(stub, "user-A");

    expect(links).toEqual([]);
  });

  it("returns only the caller's pending links, ordered by push_requested_at ascending", async () => {
    const stub = makeVaultLinksStub([
      {
        series_id: "series-newer",
        user_id: "user-A",
        label: "Newer",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: "2026-07-18T12:00:00.000Z",
        last_acked_at: null,
      },
      {
        series_id: "series-other-user",
        user_id: "user-B",
        label: "Other user, would otherwise be oldest",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: "2026-07-18T01:00:00.000Z",
        last_acked_at: null,
      },
      {
        series_id: "series-older",
        user_id: "user-A",
        label: "Older",
        linked_at: "2026-01-01T00:00:00.000Z",
        push_requested_at: "2026-07-18T09:00:00.000Z",
        last_acked_at: null,
      },
    ]);

    const links = await listPendingVaultLinks(stub, "user-A");

    expect(links.map((l) => l.series_id)).toEqual(["series-older", "series-newer"]);
  });
});
