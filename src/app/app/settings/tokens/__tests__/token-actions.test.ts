import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken, TOKEN_PREFIX } from "@/lib/auth/api-token";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createToken, revokeToken } from "../token-actions";

function viewerClient() {
  return {
    from(table: string) {
      if (table !== "api_tokens") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: Record<string, unknown>) => {
          mocks.insert(row);
          return Promise.resolve({ error: null });
        },
        update: (patch: Record<string, unknown>) => {
          mocks.update(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase: viewerClient() });
});

describe("createToken", () => {
  it("returns the raw token but stores only its hash", async () => {
    const { token } = await createToken("Obsidian – laptop");
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);

    const row = mocks.insert.mock.calls[0][0];
    expect(row.token_hash).toBe(hashApiToken(token));
    expect(row.user_id).toBe("u1");
    expect(row.name).toBe("Obsidian – laptop");
    // The raw token must never be persisted under any key.
    expect(Object.values(row)).not.toContain(token);
  });

  it("rejects a blank name", async () => {
    await expect(createToken("   ")).rejects.toThrow(/name/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("revokeToken", () => {
  it("soft-deletes by stamping revoked_at", async () => {
    await revokeToken("t1");
    expect(typeof mocks.update.mock.calls[0][0].revoked_at).toBe("string");
  });
});
