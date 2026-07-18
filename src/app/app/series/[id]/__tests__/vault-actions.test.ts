import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { requestVaultPush, unlinkVault } from "../vault-actions";

type Row = { series_id: string; user_id: string; push_requested_at: string | null };

/**
 * A small in-memory `series_vault_links` stub that applies chained `.eq()`
 * filters for real, seeded with rows for two different users — so the
 * defence-in-depth tests below (IMPORTANT 4, final review) prove the
 * explicit `user_id` filter actually excludes another user's row, not just
 * that `.eq("user_id", ...)` was called with the right args.
 */
function makeViewerSupabase(rows: Row[]) {
  const table = {
    update(patch: Partial<Row>) {
      let predicate: (r: Row) => boolean = () => true;
      const builder = {
        eq(col: keyof Row, val: unknown) {
          const prev = predicate;
          predicate = (r) => prev(r) && r[col] === val;
          return builder;
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          rows.forEach((r) => {
            if (predicate(r)) Object.assign(r, patch);
          });
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    delete() {
      let predicate: (r: Row) => boolean = () => true;
      const builder = {
        eq(col: keyof Row, val: unknown) {
          const prev = predicate;
          predicate = (r) => prev(r) && r[col] === val;
          return builder;
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          rows = rows.filter((r) => !predicate(r));
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return {
    rows: () => rows,
    supabase: {
      from(name: string) {
        if (name !== "series_vault_links") throw new Error(`unexpected table ${name}`);
        return table;
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestVaultPush", () => {
  it("stamps push_requested_at for the caller's own row", async () => {
    const { supabase, rows } = makeViewerSupabase([{ series_id: "s1", user_id: "u1", push_requested_at: null }]);
    mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase });

    await requestVaultPush("s1");

    expect(typeof rows()[0]?.push_requested_at).toBe("string");
  });

  it("refreshes the series page so the card shows the queued state", async () => {
    const { supabase } = makeViewerSupabase([{ series_id: "s1", user_id: "u1", push_requested_at: null }]);
    mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase });

    await requestVaultPush("s1");

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/series/s1");
  });

  it("defence in depth (IMPORTANT 4): does not stamp another user's link for the same series", async () => {
    const { supabase, rows } = makeViewerSupabase([
      { series_id: "s1", user_id: "user-B", push_requested_at: null },
    ]);
    mocks.getViewer.mockResolvedValue({ user: { id: "user-A" }, supabase });

    await requestVaultPush("s1");

    expect(rows()[0]?.push_requested_at).toBeNull();
  });
});

describe("unlinkVault", () => {
  it("deletes the caller's link row for the given series", async () => {
    const { supabase, rows } = makeViewerSupabase([{ series_id: "s1", user_id: "u1", push_requested_at: null }]);
    mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase });

    await unlinkVault("s1");

    expect(rows()).toHaveLength(0);
  });

  it("refreshes the series page so the card shows the unlinked state", async () => {
    const { supabase } = makeViewerSupabase([{ series_id: "s1", user_id: "u1", push_requested_at: null }]);
    mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase });

    await unlinkVault("s1");

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/series/s1");
  });

  it("defence in depth (IMPORTANT 4): does not delete another user's link for the same series", async () => {
    const { supabase, rows } = makeViewerSupabase([
      { series_id: "s1", user_id: "user-B", push_requested_at: null },
    ]);
    mocks.getViewer.mockResolvedValue({ user: { id: "user-A" }, supabase });

    await unlinkVault("s1");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.user_id).toBe("user-B");
  });
});
