import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { logImpersonationEnd, logImpersonationStart, mintSessionToken, primaryOrgId } from "../impersonate";

type Insert = Record<string, unknown>;
type Filter = { column: string; value: unknown };

/**
 * The mock HONORS `.eq(column, value)` instead of ignoring it. The previous
 * `eq: () => obj` meant mintSessionToken could filter on the wrong column — i.e.
 * mint a session for the WRONG USER — and every test would still pass. Same
 * class of blindness fixed in 4770251 for the platform-users `.order()` mock.
 */
function makeSvc(opts: {
  user?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  generateLink?: { data: unknown; error: unknown };
  inserts?: Insert[];
  insertError?: { message: string } | null;
}) {
  const inserts = opts.inserts ?? [];
  const filters: Record<string, Filter[]> = {};

  const table = (name: string, row: Record<string, unknown> | null) => {
    filters[name] ??= [];
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: (column: string, value: unknown) => {
        filters[name].push({ column, value });
        return obj;
      },
      order: () => obj,
      limit: () => obj,
      // The row only comes back if every applied filter actually matches it —
      // so filtering on a bogus column, or on the wrong value, yields null.
      maybeSingle: () => {
        const matches =
          row !== null &&
          filters[name].every((f) => Object.hasOwn(row, f.column) && row[f.column] === f.value);
        return Promise.resolve({ data: matches ? row : null, error: null });
      },
      insert: (r: Insert) => {
        inserts.push(r);
        return Promise.resolve({ error: opts.insertError ?? null });
      },
    };
    return obj;
  };

  return {
    inserts,
    filters,
    from: (t: string) => {
      if (t === "users") return table("users", opts.user ?? null);
      if (t === "memberships") return table("memberships", opts.membership ?? null);
      return table(t, null);
    },
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue(
          opts.generateLink ?? { data: { properties: { hashed_token: "tok_123" } }, error: null },
        ),
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("mintSessionToken", () => {
  it("returns the hashed token and the target's email", async () => {
    const svc = makeSvc({ user: { id: "u1", email: "jane@example.com" } });
    mocks.serviceClient.mockReturnValue(svc);

    await expect(mintSessionToken("u1")).resolves.toEqual({
      tokenHash: "tok_123",
      email: "jane@example.com",
    });
    expect(svc.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "jane@example.com",
    });
  });

  it("looks the target up by id — never any other column", async () => {
    // Guards the worst bug this file can hide: minting a session for the wrong user.
    const svc = makeSvc({ user: { id: "u1", email: "jane@example.com" } });
    mocks.serviceClient.mockReturnValue(svc);

    await mintSessionToken("u1");
    expect(svc.filters.users).toEqual([{ column: "id", value: "u1" }]);
  });

  it("returns null when the user does not exist", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ user: null }));
    await expect(mintSessionToken("nope")).resolves.toBeNull();
  });

  it("returns null when the id does not match the stored row (no cross-user mint)", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ user: { id: "u1", email: "jane@example.com" } }));
    await expect(mintSessionToken("someone-else")).resolves.toBeNull();
  });

  it("returns null when Supabase refuses to generate a link", async () => {
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        user: { id: "u1", email: "jane@example.com" },
        generateLink: { data: null, error: { message: "boom" } },
      }),
    );
    await expect(mintSessionToken("u1")).resolves.toBeNull();
  });
});

describe("primaryOrgId", () => {
  it("returns the user's org when they have one", async () => {
    mocks.serviceClient.mockReturnValue(
      makeSvc({ membership: { organization_id: "o1", user_id: "u1" } }),
    );
    await expect(primaryOrgId("u1")).resolves.toBe("o1");
  });

  it("filters memberships by user_id", async () => {
    const svc = makeSvc({ membership: { organization_id: "o1", user_id: "u1" } });
    mocks.serviceClient.mockReturnValue(svc);

    await primaryOrgId("u1");
    expect(svc.filters.memberships).toEqual([{ column: "user_id", value: "u1" }]);
  });

  it("returns null when the user belongs to no org", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ membership: null }));
    await expect(primaryOrgId("u1")).resolves.toBeNull();
  });
});

describe("audit logging", () => {
  it("writes a started row naming the admin as actor and the user as target", async () => {
    const svc = makeSvc({});
    mocks.serviceClient.mockReturnValue(svc);

    await logImpersonationStart({
      adminEmail: "nick@pixelocity.com",
      targetUserId: "u1",
      targetEmail: "jane@example.com",
      organizationId: "o1",
    });

    expect(svc.inserts).toHaveLength(1);
    expect(svc.inserts[0]).toMatchObject({
      action: "admin.impersonation_started",
      actor_email: "nick@pixelocity.com",
      target_type: "user",
      target_id: "u1",
      organization_id: "o1",
    });
  });

  it("writes an ended row carrying the session duration", async () => {
    const svc = makeSvc({});
    mocks.serviceClient.mockReturnValue(svc);

    await logImpersonationEnd({
      adminEmail: "nick@pixelocity.com",
      targetUserId: "u1",
      targetEmail: "jane@example.com",
      durationSeconds: 90,
    });

    expect(svc.inserts[0]).toMatchObject({
      action: "admin.impersonation_ended",
      actor_email: "nick@pixelocity.com",
      target_type: "user",
      target_id: "u1",
    });
    expect((svc.inserts[0].meta as { durationSeconds: number }).durationSeconds).toBe(90);
  });

  it("THROWS when the started row fails to insert, so the caller can fail closed", async () => {
    // `.insert()` resolves with { error }, it does not reject — discarding that
    // return value produced fully working, completely UNLOGGED impersonations.
    mocks.serviceClient.mockReturnValue(makeSvc({ insertError: { message: "constraint violation" } }));

    await expect(
      logImpersonationStart({
        adminEmail: "nick@pixelocity.com",
        targetUserId: "u1",
        targetEmail: "jane@example.com",
        organizationId: "o1",
      }),
    ).rejects.toThrow(/constraint violation/);
  });

  it("does NOT throw when the ended row fails — a bad audit write must never strand the operator", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ insertError: { message: "db down" } }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logImpersonationEnd({
        adminEmail: "nick@pixelocity.com",
        targetUserId: "u1",
        targetEmail: "jane@example.com",
        durationSeconds: 90,
      }),
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
