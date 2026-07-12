import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { logImpersonationEnd, logImpersonationStart, mintSessionToken, primaryOrgId } from "../impersonate";

type Insert = Record<string, unknown>;

function makeSvc(opts: {
  user?: { id: string; email: string } | null;
  membership?: { organization_id: string } | null;
  generateLink?: { data: unknown; error: unknown };
  inserts?: Insert[];
}) {
  const inserts = opts.inserts ?? [];
  const table = (row: unknown) => {
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      order: () => obj,
      limit: () => obj,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
      insert: (r: Insert) => {
        inserts.push(r);
        return Promise.resolve({ error: null });
      },
    };
    return obj;
  };
  return {
    inserts,
    from: (t: string) => {
      if (t === "users") return table(opts.user ?? null);
      if (t === "memberships") return table(opts.membership ?? null);
      return table(null);
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

  it("returns null when the user does not exist", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ user: null }));
    await expect(mintSessionToken("nope")).resolves.toBeNull();
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
    mocks.serviceClient.mockReturnValue(makeSvc({ membership: { organization_id: "o1" } }));
    await expect(primaryOrgId("u1")).resolves.toBe("o1");
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
});
