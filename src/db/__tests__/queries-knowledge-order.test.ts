import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { getSeriesKnowledge } from "@/db/queries";

/**
 * ORDERING (final review): `getSeriesKnowledge`'s top-level `entities` query
 * previously ordered by `name` alone, which isn't a unique key — two
 * entities can share a name — so ties had no deterministic order. That
 * feeds the vault sync's content hash (`buildJsonPayload` in
 * src/server/export/series-data.ts), where an unstable order makes the
 * Obsidian plugin rewrite notes on every sync for no real content change.
 * This stub applies `.order()` calls for real (chained, in the order
 * called) rather than just recording them, so the test fails if the `id`
 * tiebreaker is ever dropped.
 */
function makeStub(entities: Array<{ id: string; series_id: string; kind: string; name: string; detail: null }>) {
  function chainable<T extends Record<string, unknown>>(rows: T[]) {
    // Multiple `.order()` calls on a real PostgREST query compose into ONE
    // multi-column `ORDER BY name, id` — NOT two independent, sequential
    // full re-sorts (which would destroy the first key's grouping). Keys
    // are accumulated here and applied together in `then()` to match that.
    const keys: Array<{ col: keyof T; dir: number }> = [];
    const builder = {
      eq() {
        return builder;
      },
      order(col: keyof T, opts?: { ascending?: boolean }) {
        keys.push({ col, dir: opts?.ascending === false ? -1 : 1 });
        return builder;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const sorted = [...rows].sort((a, b) => {
          for (const { col, dir } of keys) {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            if (av < bv) return -dir;
            if (av > bv) return dir;
          }
          return 0;
        });
        return Promise.resolve({ data: sorted, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "entities") return { select: () => chainable(entities) };
      if (table === "topics") return { select: () => chainable([]) };
      if (table === "facts") return { select: () => chainable([]) };
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("getSeriesKnowledge — entities order (name, then id tiebreaker)", () => {
  it("breaks a tie between two entities with the same name using id, deterministically", async () => {
    // Two entities named "Sam" — a real scenario (two different people share
    // a first name) — seeded in an order that would be wrong if only `id`
    // (reversed) or only `name` (no tiebreaker) were applied.
    const stub = makeStub([
      { id: "entity-b", series_id: "series-1", kind: "person", name: "Sam", detail: null },
      { id: "entity-a", series_id: "series-1", kind: "person", name: "Sam", detail: null },
      { id: "entity-c", series_id: "series-1", kind: "person", name: "Amy", detail: null },
    ]);

    const knowledge = await getSeriesKnowledge(stub, "series-1");

    expect(knowledge.entities.map((e) => e.id)).toEqual(["entity-c", "entity-a", "entity-b"]);
  });
});
