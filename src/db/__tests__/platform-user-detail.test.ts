import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { getPlatformUserDetail } from "../queries/admin";

/**
 * getPlatformUserDetail reads one user (maybeSingle) plus several filtered
 * lists. Head-count queries resolve to { count }, list queries to { data }.
 *
 * Every `.eq()` / `.in()` / `.or()` call is recorded into `calls` (table +
 * method + args) so tests can assert WHICH COLUMN each query filters on, not
 * just that the mapping from canned rows to output is correct. Without this,
 * swapping e.g. `.eq("conducted_by", userId)` for `.eq("organization_id",
 * userId)` in production code would silently pass every test — see commit
 * 4770251 and the Task 5 impersonate-mock hardening for prior instances of
 * this exact blind spot.
 */
type RecordedCall = { table: string; method: "eq" | "in" | "or"; args: unknown[] };

function makeSvc(tables: Record<string, unknown>, calls: RecordedCall[]) {
  const chain = (table: string, value: unknown) => {
    const result = Promise.resolve(
      typeof value === "number" ? { count: value, error: null } : { data: value, error: null },
    );
    const record =
      (method: RecordedCall["method"]) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return obj;
      };
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: record("eq"),
      in: record("in"),
      or: record("or"),
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
      chain(t, t in tables ? tables[t] : t === "interviews" || t === "facts" ? 0 : []),
  };
}

function callsFor(calls: RecordedCall[], table: string, method: RecordedCall["method"]) {
  return calls.filter((c) => c.table === table && c.method === method);
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
  // Row-level facts (not a head count) — 3 on s1 (owned by u1), 2 on s2
  // (u1 is only the subject, not the owner). factCount totals both series;
  // topSeries only ranks series u1 actually created.
  facts: [
    { id: "f1", series_id: "s1" },
    { id: "f2", series_id: "s1" },
    { id: "f3", series_id: "s1" },
    { id: "f4", series_id: "s2" },
    { id: "f5", series_id: "s2" },
  ],
  audit_logs: [
    { id: 1, at: "2026-06-01T00:00:00Z", action: "admin.impersonation_started", actor_email: "nick@pixelocity.com" },
  ],
};

let calls: RecordedCall[] = [];

beforeEach(() => {
  calls = [];
  mocks.serviceClient.mockReturnValue(makeSvc(BASE, calls));
});

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
    expect(d.factCount).toBe(5); // 3 on s1 + 2 on s2, both in this user's series set
  });

  it("ranks topSeries by real per-series fact counts, limited to series the user owns", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    // s2 has facts too, but u1 didn't create it (u9 did) — only owned
    // series ("Dad's stories") appear in topSeries.
    expect(d.topSeries).toEqual([{ id: "s1", title: "Dad's stories", facts: 3 }]);
  });

  it("returns the audit trail", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.auditLog).toHaveLength(1);
    expect(d.auditLog[0].action).toBe("admin.impersonation_started");
  });

  it("returns null for an unknown user", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ ...BASE, users: null }, calls));
    await expect(getPlatformUserDetail("nope")).resolves.toBeNull();
  });

  it("filters every query on the requested user, not an unscoped or wrong column", async () => {
    await getPlatformUserDetail("u1");

    // users lookup: WHERE id = userId (not e.g. some other identity column)
    const userEq = callsFor(calls, "users", "eq");
    expect(userEq).toHaveLength(1);
    expect(userEq[0].args).toEqual(["id", "u1"]);

    // memberships lookup: WHERE user_id = userId (not organization_id)
    const membershipEq = callsFor(calls, "memberships", "eq");
    expect(membershipEq).toHaveLength(1);
    expect(membershipEq[0].args).toEqual(["user_id", "u1"]);

    // interview COUNT: WHERE conducted_by = userId. This is the column that
    // must stay scoped to "interviews this user personally conducted" — if
    // it were swapped for organization_id, interviewCount would silently
    // become an org-wide count and every other assertion in this file would
    // still pass.
    const interviewEq = callsFor(calls, "interviews", "eq");
    expect(interviewEq).toHaveLength(1);
    expect(interviewEq[0].args).toEqual(["conducted_by", "u1"]);

    // facts COUNT: scoped via .in("series_id", [ids of this user's own series]),
    // never an unscoped count of every fact.
    const factsIn = callsFor(calls, "facts", "in");
    expect(factsIn).toHaveLength(1);
    expect(factsIn[0].args[0]).toBe("series_id");
    expect(factsIn[0].args[1]).toEqual(["s1", "s2"]);

    // series list: .or() must reference the requested userId in both clauses
    const seriesOr = callsFor(calls, "series", "or");
    expect(seriesOr).toHaveLength(1);
    expect(seriesOr[0].args[0]).toBe("created_by.eq.u1,subject_user_id.eq.u1");

    // audit log: .or() must reference the requested userId in both clauses
    const auditOr = callsFor(calls, "audit_logs", "or");
    expect(auditOr).toHaveLength(1);
    expect(auditOr[0].args[0]).toBe("actor_user_id.eq.u1,target_id.eq.u1");
  });
});
