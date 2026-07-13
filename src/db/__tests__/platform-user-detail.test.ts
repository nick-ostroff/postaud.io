import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { getPlatformUserDetail } from "../queries/admin";

/**
 * getPlatformUserDetail reads one user (maybeSingle) plus several filtered
 * lists. Head-count queries resolve to { count }, list queries to { data }.
 */
function makeSvc(tables: Record<string, unknown>) {
  const chain = (value: unknown) => {
    const result = Promise.resolve(
      typeof value === "number" ? { count: value, error: null } : { data: value, error: null },
    );
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      in: () => obj,
      or: () => obj,
      order: () => obj,
      limit: () => result,
      maybeSingle: () => Promise.resolve({ data: value, error: null }),
      then: (...a: unknown[]) => (result.then as (...x: unknown[]) => unknown)(...a),
    };
    return obj;
  };
  // interviews and facts are asked for counts; everything else for rows.
  // Use `in` (not `??`) so an explicit `null` (e.g. "no such user") is
  // forwarded as-is instead of being swallowed by the default.
  return {
    from: (t: string) =>
      chain(t in tables ? tables[t] : t === "interviews" || t === "facts" ? 0 : []),
  };
}

const BASE = {
  users: { id: "u1", email: "jane@example.com", display_name: "Jane", created_at: "2026-01-01T00:00:00Z" },
  memberships: [
    { organization_id: "o1", role: "admin", accepted_at: "2026-01-02T00:00:00Z", organizations: { name: "Acme" } },
  ],
  series: [
    { id: "s1", title: "Dad's stories", organization_id: "o1", created_by: "u1", subject_user_id: null },
    { id: "s2", title: "Her story", organization_id: "o1", created_by: "u9", subject_user_id: "u1" },
  ],
  interviews: 4,
  facts: 17,
  audit_logs: [
    { id: 1, at: "2026-06-01T00:00:00Z", action: "admin.impersonation_started", actor_email: "nick@pixelocity.com" },
  ],
};

beforeEach(() => mocks.serviceClient.mockReturnValue(makeSvc(BASE)));

describe("getPlatformUserDetail", () => {
  it("returns the user profile", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.user).toEqual({
      id: "u1",
      email: "jane@example.com",
      displayName: "Jane",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("splits series into owned and subject-of", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.seriesOwned.map((s) => s.id)).toEqual(["s1"]);
    expect(d.seriesSubjectOf.map((s) => s.id)).toEqual(["s2"]);
  });

  it("returns org memberships with role and accepted state", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.orgs).toEqual([{ id: "o1", name: "Acme", role: "admin", accepted: true }]);
  });

  it("returns interview and fact counts", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.interviewCount).toBe(4);
    expect(d.factCount).toBe(17);
  });

  it("returns the audit trail", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.auditLog).toHaveLength(1);
    expect(d.auditLog[0].action).toBe("admin.impersonation_started");
  });

  it("returns null for an unknown user", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ ...BASE, users: null }));
    await expect(getPlatformUserDetail("nope")).resolves.toBeNull();
  });
});
