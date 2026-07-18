import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  del: vi.fn(),
  delEq: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { requestVaultPush, unlinkVault } from "../vault-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({
    user: { id: "u1" },
    supabase: {
      from(table: string) {
        if (table !== "series_vault_links") throw new Error(`unexpected table ${table}`);
        return {
          update: (patch: Record<string, unknown>) => {
            mocks.update(patch);
            return {
              eq: (col: string, val: unknown) => {
                mocks.eq(col, val);
                return Promise.resolve({ error: null });
              },
            };
          },
          delete: () => {
            mocks.del();
            return {
              eq: (col: string, val: unknown) => {
                mocks.delEq(col, val);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
  });
});

describe("requestVaultPush", () => {
  it("stamps push_requested_at for the given series", async () => {
    await requestVaultPush("s1");
    expect(typeof mocks.update.mock.calls[0][0].push_requested_at).toBe("string");
    expect(mocks.eq).toHaveBeenCalledWith("series_id", "s1");
  });

  it("refreshes the series page so the card shows the queued state", async () => {
    await requestVaultPush("s1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/series/s1");
  });
});

describe("unlinkVault", () => {
  it("deletes the caller's link row for the given series", async () => {
    await unlinkVault("s1");
    expect(mocks.del).toHaveBeenCalled();
    expect(mocks.delEq).toHaveBeenCalledWith("series_id", "s1");
  });

  it("refreshes the series page so the card shows the unlinked state", async () => {
    await unlinkVault("s1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/series/s1");
  });
});
