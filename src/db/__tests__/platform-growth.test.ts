import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { getPlatformGrowth } from "../queries/admin";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * getPlatformGrowth issues three flat, unfiltered reads (users, memberships,
 * interviews) and buckets/joins them in memory — same shape as
 * listPlatformUsers — so the mock only needs select/order/then, the same
 * fluent chain as platform-users.test.ts.
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
      then: (...a: unknown[]) => (resolve().then as (...x: unknown[]) => unknown)(...a),
    };
    return obj;
  };
  return { from: (table: string) => chain(tables[table] ?? []) };
}

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// One user per trailing week (1..11 weeks ago) so every non-current bucket
// gets exactly one signup; two users created this week (for newThisWeek);
// one "ancient" user 20 weeks back that must fall OUTSIDE the 12-bucket
// window entirely. Placing each user at exactly `now - k*WEEK_MS` keeps the
// bucket a signup lands in independent of what day-of-week "now" happens to
// be — shifting by a whole number of weeks always shifts by exactly that
// many buckets.
const WEEKLY_USERS = [
  ...Array.from({ length: 11 }, (_, i) => {
    const weeksAgo = i + 1; // 1..11
    return {
      id: `w${weeksAgo}`,
      email: `w${weeksAgo}@example.com`,
      display_name: null,
      created_at: iso(now - weeksAgo * WEEK_MS),
    };
  }),
  { id: "w0a", email: "w0a@example.com", display_name: null, created_at: iso(now) },
  { id: "w0b", email: "w0b@example.com", display_name: null, created_at: iso(now - DAY_MS) },
  { id: "ancient", email: "ancient@example.com", display_name: null, created_at: iso(now - 20 * WEEK_MS) },
];

// Dormant-scenario users: created well outside the 12-week window (40 weeks
// back) so they never perturb the weekly-bucket / newThisWeek assertions.
const DORMANT_USERS = [
  { id: "d-recent", email: "recent@example.com", display_name: null, created_at: iso(now - 40 * WEEK_MS) },
  { id: "d-old", email: "old@example.com", display_name: null, created_at: iso(now - 40 * WEEK_MS) },
  { id: "d-none", email: "none@example.com", display_name: null, created_at: iso(now - 40 * WEEK_MS) },
];

const USERS = [...WEEKLY_USERS, ...DORMANT_USERS];

const MEMBERSHIPS = [
  { user_id: "d-recent", organization_id: "org-recent" },
  { user_id: "d-old", organization_id: "org-old" },
  // d-none deliberately has no membership at all -> never had an interview.
];

// Deliberately NOT pre-sorted descending — getPlatformGrowth must request
// `.order("started_at", { ascending: false })` itself for "most recent
// interview per org" to come out right.
const INTERVIEWS = [
  { organization_id: "org-old", started_at: iso(now - 45 * DAY_MS) }, // 45 days ago -> dormant
  { organization_id: "org-recent", started_at: iso(now - 5 * DAY_MS) }, // 5 days ago -> not dormant
];

beforeEach(() => {
  mocks.serviceClient.mockReturnValue(
    makeSvc({ users: USERS, memberships: MEMBERSHIPS, interviews: INTERVIEWS }),
  );
});

describe("getPlatformGrowth", () => {
  it("returns exactly 12 contiguous weekly buckets, oldest to newest, each starting on a Monday", async () => {
    const g = await getPlatformGrowth();
    expect(g.weekly).toHaveLength(12);
    for (let i = 1; i < g.weekly.length; i++) {
      const prev = new Date(g.weekly[i - 1].weekStart).getTime();
      const curr = new Date(g.weekly[i].weekStart).getTime();
      expect(curr - prev).toBe(WEEK_MS);
    }
    for (const bucket of g.weekly) {
      expect(new Date(bucket.weekStart).getUTCDay()).toBe(1);
    }
  });

  it("buckets one signup per trailing week, two in the current week, and excludes the 20-week-old signup", async () => {
    const g = await getPlatformGrowth();
    const counts = g.weekly.map((b) => b.count);
    expect(counts.slice(0, 11)).toEqual(Array(11).fill(1));
    expect(counts[11]).toBe(2);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(13); // the ancient user is excluded
  });

  it("reports newThisWeek as the current-week bucket count", async () => {
    const g = await getPlatformGrowth();
    expect(g.newThisWeek).toBe(2);
  });

  it("reports totalUsers across the whole platform, including users outside the 12-week window", async () => {
    const g = await getPlatformGrowth();
    expect(g.totalUsers).toBe(USERS.length);
  });

  it("counts users with no interview or a >30d-old last interview as dormant, but not a user active in the last 30 days", async () => {
    const g = await getPlatformGrowth();
    // Every user except d-recent is dormant: d-old's last interview is 45
    // days old, d-none never had one, and none of the WEEKLY_USERS have any
    // membership at all (so they never had an interview either).
    expect(g.dormantCount).toBe(USERS.length - 1);
  });
});
