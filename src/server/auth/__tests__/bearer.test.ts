import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "@/lib/auth/api-token";

const mocks = vi.hoisted(() => ({
  serviceClient: vi.fn(),
  userScopedClient: vi.fn(() => ({ marker: "user-scoped" })),
}));

vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));
vi.mock("@/db/user-client", () => ({ userScopedClient: mocks.userScopedClient }));

import { resolveApiToken } from "../bearer";

const VALID = `pat_${"a".repeat(43)}`;

/** Minimal stand-in for the api_tokens table that matches on token_hash. */
function makeServiceClient(rows: Array<{ id: string; user_id: string; revoked_at: string | null; token_hash: string }>) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    from(table: string) {
      if (table !== "api_tokens") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, value: unknown) => ({
            maybeSingle: async () => ({ data: rows.find((r) => r.token_hash === value) ?? null, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

function request(header?: string): Request {
  return new Request("https://example.test/api/vault/pending", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveApiToken", () => {
  it("resolves a live token to its user with an RLS-scoped client", async () => {
    mocks.serviceClient.mockReturnValue(
      makeServiceClient([{ id: "t1", user_id: "u1", revoked_at: null, token_hash: hashApiToken(VALID) }]),
    );
    const caller = await resolveApiToken(request(`Bearer ${VALID}`));
    expect(caller?.userId).toBe("u1");
    expect(mocks.userScopedClient).toHaveBeenCalledWith("u1");
    expect(caller?.supabase).toEqual({ marker: "user-scoped" });
  });

  it("rejects a revoked token", async () => {
    mocks.serviceClient.mockReturnValue(
      makeServiceClient([
        { id: "t1", user_id: "u1", revoked_at: "2026-07-01T00:00:00Z", token_hash: hashApiToken(VALID) },
      ]),
    );
    expect(await resolveApiToken(request(`Bearer ${VALID}`))).toBeNull();
  });

  it("rejects an unknown token", async () => {
    mocks.serviceClient.mockReturnValue(makeServiceClient([]));
    expect(await resolveApiToken(request(`Bearer ${VALID}`))).toBeNull();
  });

  it("rejects missing and malformed headers without touching the database", async () => {
    mocks.serviceClient.mockReturnValue(makeServiceClient([]));
    expect(await resolveApiToken(request())).toBeNull();
    expect(await resolveApiToken(request("Basic abc"))).toBeNull();
    expect(await resolveApiToken(request("Bearer nope"))).toBeNull();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("stamps last_used_at on a successful resolve", async () => {
    const svc = makeServiceClient([{ id: "t1", user_id: "u1", revoked_at: null, token_hash: hashApiToken(VALID) }]);
    mocks.serviceClient.mockReturnValue(svc);
    await resolveApiToken(request(`Bearer ${VALID}`));
    expect(svc.updates).toHaveLength(1);
    expect(typeof svc.updates[0].last_used_at).toBe("string");
  });
});
