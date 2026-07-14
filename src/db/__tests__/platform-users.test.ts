import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { listPlatformUsers } from "../queries/admin";

/**
 * listPlatformUsers issues four independent table reads and joins them in
 * memory. Each read is `.select(...)` optionally followed by `.order()` /
 * `.limit()`, then awaited — so one thenable chain per table is enough.
 */
function makeSvc(tables: Record<string, unknown[]>) {
  const chain = (rows: unknown[]) => {
    // Sorted lazily on `.order()` so the mock actually constrains the query
    // the way real Supabase would — a test can only pass if the code under
    // test requests the right column/direction.
    let sorted = rows;
    const resolve = () => Promise.resolve({ data: sorted, error: null });
    const obj: Record<string, unknown> = {
      select: () => obj,
      order: (column: string, opts?: { ascending?: boolean }) => {
        const ascending = opts?.ascending ?? true;
        sorted = [...sorted].sort((a, b) => {
          const av = (a as Record<string, unknown>)[column];
          const bv = (b as Record<string, unknown>)[column];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (av < bv) return ascending ? -1 : 1;
          return ascending ? 1 : -1;
        });
        return obj;
      },
      limit: () => resolve(),
      then: (...a: unknown[]) => (resolve().then as (...x: unknown[]) => unknown)(...a),
    };
    return obj;
  };
  return { from: (table: string) => chain(tables[table] ?? []) };
}

const USERS = [
  { id: "u1", email: "jane@example.com", display_name: "Jane", created_at: "2026-01-01T00:00:00Z" },
  { id: "u2", email: "bob@example.com", display_name: null, created_at: "2026-02-01T00:00:00Z" },
  { id: "u3", email: "zed@example.com", display_name: "Zed", created_at: "2026-03-01T00:00:00Z" },
];

const MEMBERSHIPS = [
  { user_id: "u1", organization_id: "o1", role: "admin", accepted_at: "2026-01-02T00:00:00Z", organizations: { name: "Acme" } },
  { user_id: "u1", organization_id: "o2", role: "viewer", accepted_at: "2026-01-03T00:00:00Z", organizations: { name: "Globex" } },
  { user_id: "u2", organization_id: "o1", role: "interviewer", accepted_at: null, organizations: { name: "Acme" } },
];

const SERIES = [
  { id: "s1", title: "Dad's stories", subject_user_id: "u2" },
  { id: "s2", title: "Ops handbook", subject_user_id: null },
];

// Deliberately NOT pre-sorted descending — listPlatformUsers must request
// `.order("started_at", { ascending: false })` itself for lastActivity to
// come out right. (If the mock's `.order()` were a no-op, or the query used
// ascending order, u1's lastActivity below would be the older interview.)
const INTERVIEWS = [
  { organization_id: "o1", started_at: "2026-05-01T00:00:00Z" },
  { organization_id: "o1", started_at: "2026-06-10T00:00:00Z" },
];

beforeEach(() => {
  mocks.serviceClient.mockReturnValue(
    makeSvc({ users: USERS, memberships: MEMBERSHIPS, series: SERIES, interviews: INTERVIEWS }),
  );
});

describe("listPlatformUsers", () => {
  it("returns every user with their orgs, roles and accepted state", async () => {
    const { rows, total } = await listPlatformUsers({});
    expect(total).toBe(3);

    const jane = rows.find((r) => r.id === "u1")!;
    expect(jane.displayName).toBe("Jane");
    expect(jane.orgs).toEqual([
      { id: "o1", name: "Acme", role: "admin", accepted: true },
      { id: "o2", name: "Globex", role: "viewer", accepted: true },
    ]);

    const bob = rows.find((r) => r.id === "u2")!;
    expect(bob.displayName).toBeNull();
    expect(bob.orgs).toEqual([{ id: "o1", name: "Acme", role: "interviewer", accepted: false }]);
  });

  it("counts series the user is the subject of", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "u2")!.subjectOfCount).toBe(1);
    expect(rows.find((r) => r.id === "u1")!.subjectOfCount).toBe(0);
  });

  it("reports last activity as the newest interview in any org the user belongs to", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "u1")!.lastActivity).toBe("2026-06-10T00:00:00Z");
    // u3 belongs to no org at all.
    expect(rows.find((r) => r.id === "u3")!.lastActivity).toBeNull();
  });

  it("sorts by last activity, users with none last", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.map((r) => r.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("searches on email and display name, case-insensitively", async () => {
    expect((await listPlatformUsers({ search: "JANE" })).rows.map((r) => r.id)).toEqual(["u1"]);
    expect((await listPlatformUsers({ search: "zed" })).rows.map((r) => r.id)).toEqual(["u3"]);
    expect((await listPlatformUsers({ search: "bob@example" })).rows.map((r) => r.id)).toEqual(["u2"]);
    expect((await listPlatformUsers({ search: "nobody" })).rows).toEqual([]);
  });

  it("paginates, reporting the pre-pagination total", async () => {
    const { rows, total } = await listPlatformUsers({ limit: 2, offset: 2 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["u3"]);
  });
});

// -----------------------------------------------------------------------
// network + factsCount (Task R1) — own fixtures, isolated from the shared
// USERS/MEMBERSHIPS/SERIES/INTERVIEWS above so these additions can't shift
// any of the pre-existing assertions (lastActivity, sort order, search).
// -----------------------------------------------------------------------
describe("listPlatformUsers — network + factsCount", () => {
  const NET_USERS = [
    { id: "n1", email: "owner@example.com", display_name: "Owner", created_at: "2026-01-01T00:00:00Z" },
    { id: "n2", email: "member2@example.com", display_name: null, created_at: "2026-01-02T00:00:00Z" },
    { id: "n3", email: "member3@example.com", display_name: null, created_at: "2026-01-03T00:00:00Z" },
    { id: "n4", email: "subject@example.com", display_name: null, created_at: "2026-01-04T00:00:00Z" },
    { id: "n5", email: "assignee@example.com", display_name: null, created_at: "2026-01-05T00:00:00Z" },
  ];

  // n1 is the earliest admin (owner) of org1; n2 and n3 are its two other members.
  const NET_MEMBERSHIPS = [
    {
      user_id: "n1",
      organization_id: "org1",
      role: "admin",
      created_at: "2026-01-01T00:00:00Z",
      accepted_at: "2026-01-01T00:00:00Z",
      organizations: { name: "OrgOne" },
    },
    {
      user_id: "n2",
      organization_id: "org1",
      role: "interviewer",
      created_at: "2026-01-02T00:00:00Z",
      accepted_at: "2026-01-02T00:00:00Z",
      organizations: { name: "OrgOne" },
    },
    {
      user_id: "n3",
      organization_id: "org1",
      role: "viewer",
      created_at: "2026-01-03T00:00:00Z",
      accepted_at: "2026-01-03T00:00:00Z",
      organizations: { name: "OrgOne" },
    },
  ];

  // n1 created ns1, whose subject is n4 (a different user).
  const NET_SERIES = [{ id: "ns1", title: "Family history", subject_user_id: "n4", created_by: "n1" }];

  // n5 was granted access to n1's series.
  const NET_SERIES_ACCESS = [{ series_id: "ns1", user_id: "n5" }];

  // 3 facts on n1's series; none anywhere else.
  const NET_FACTS = [
    { id: "f1", series_id: "ns1" },
    { id: "f2", series_id: "ns1" },
    { id: "f3", series_id: "ns1" },
  ];

  beforeEach(() => {
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        users: NET_USERS,
        memberships: NET_MEMBERSHIPS,
        series: NET_SERIES,
        interviews: [],
        series_access: NET_SERIES_ACCESS,
        facts: NET_FACTS,
      }),
    );
  });

  it("counts invited as the other members of an org this user is the earliest admin (owner) of", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "n1")!.network.invited).toBe(2);
    // n2 is a member but not the owner of any org -> 0, not counted against itself.
    expect(rows.find((r) => r.id === "n2")!.network.invited).toBe(0);
  });

  it("counts subjects as distinct non-self subject_user_id on series this user created", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "n1")!.network.subjects).toBe(1);
    expect(rows.find((r) => r.id === "n4")!.network.subjects).toBe(0);
  });

  it("counts assignees as distinct series_access grants (excluding self) on series this user created", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "n1")!.network.assignees).toBe(1);
    expect(rows.find((r) => r.id === "n5")!.network.assignees).toBe(0);
  });

  it("sums factsCount across series this user created only", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "n1")!.factsCount).toBe(3);
    // n4 is the subject of ns1, not its creator -> not credited with its facts.
    expect(rows.find((r) => r.id === "n4")!.factsCount).toBe(0);
  });

  it("counts seriesCount as series this user created only", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "n1")!.seriesCount).toBe(1);
    // n4 is the subject of ns1, not its creator -> doesn't own any series.
    expect(rows.find((r) => r.id === "n4")!.seriesCount).toBe(0);
  });
});

// -----------------------------------------------------------------------
// network self-exclusion + dedup (Task R2 mutation-coverage gaps) — each
// test below sets its own mock return value so the three fixtures stay
// fully isolated from each other and from the blocks above. Every fixture
// is built so the guard under test is the *only* thing standing between
// the asserted count and a wrong one: delete the guard and the count
// asserted here changes.
// -----------------------------------------------------------------------
describe("listPlatformUsers — network self-exclusion + dedup", () => {
  it("excludes the creator from their own network.subjects when they are the subject of their own series", async () => {
    // a1 created both series. ss1's subject is a1 itself (self-interview);
    // ss2's subject is a2. Without the `subject_user_id !== created_by`
    // guard in admin.ts, a1 would count itself as a subject too, making
    // network.subjects 2 instead of 1.
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        users: [
          { id: "a1", email: "a1@example.com", display_name: null, created_at: "2026-01-01T00:00:00Z" },
          { id: "a2", email: "a2@example.com", display_name: null, created_at: "2026-01-02T00:00:00Z" },
        ],
        memberships: [],
        series: [
          { id: "ss1", title: "Self series", subject_user_id: "a1", created_by: "a1" },
          { id: "ss2", title: "Other series", subject_user_id: "a2", created_by: "a1" },
        ],
        interviews: [],
        series_access: [],
        facts: [],
      }),
    );

    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "a1")!.network.subjects).toBe(1);
  });

  it("excludes the creator from their own network.assignees when granted access to their own series", async () => {
    // b1 created as1 and also holds a series_access grant on it (e.g. via
    // an org-wide default grant). b2 holds the other grant. Without the
    // `uid !== userId` guard in assigneesCount, b1 would count itself too,
    // making network.assignees 2 instead of 1.
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        users: [
          { id: "b1", email: "b1@example.com", display_name: null, created_at: "2026-01-01T00:00:00Z" },
          { id: "b2", email: "b2@example.com", display_name: null, created_at: "2026-01-02T00:00:00Z" },
        ],
        memberships: [],
        series: [{ id: "as1", title: "Series", subject_user_id: null, created_by: "b1" }],
        interviews: [],
        series_access: [
          { series_id: "as1", user_id: "b1" },
          { series_id: "as1", user_id: "b2" },
        ],
        facts: [],
      }),
    );

    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "b1")!.network.assignees).toBe(1);
  });

  it("dedups network.assignees when the same other user has access to two series from the same creator", async () => {
    // c1 created two series; c2 was granted access to both. c2 must count
    // once toward c1's network.assignees, not once per grant. Without the
    // cross-series Set dedup in assigneesCount, this would be 2 instead of 1.
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        users: [
          { id: "c1", email: "c1@example.com", display_name: null, created_at: "2026-01-01T00:00:00Z" },
          { id: "c2", email: "c2@example.com", display_name: null, created_at: "2026-01-02T00:00:00Z" },
        ],
        memberships: [],
        series: [
          { id: "ds1", title: "Series One", subject_user_id: null, created_by: "c1" },
          { id: "ds2", title: "Series Two", subject_user_id: null, created_by: "c1" },
        ],
        interviews: [],
        series_access: [
          { series_id: "ds1", user_id: "c2" },
          { series_id: "ds2", user_id: "c2" },
        ],
        facts: [],
      }),
    );

    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "c1")!.network.assignees).toBe(1);
  });
});
