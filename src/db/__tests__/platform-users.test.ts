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
    const result = Promise.resolve({ data: rows, error: null });
    const obj: Record<string, unknown> = {
      select: () => obj,
      order: () => obj,
      limit: () => result,
      then: (...a: unknown[]) => (result.then as (...x: unknown[]) => unknown)(...a),
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

const INTERVIEWS = [
  { organization_id: "o1", started_at: "2026-06-10T00:00:00Z" },
  { organization_id: "o1", started_at: "2026-05-01T00:00:00Z" },
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
