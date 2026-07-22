import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for `GET /api/series?format=json` (Task 7) — the
 * discovery endpoint the Obsidian plugin uses to list which series a user
 * has, before picking one to sync. Bearer-only: unlike the export route
 * (Task 6), there is no cookie fallback here, so `resolveApiToken` returning
 * null always means 401, never a `getViewer()` retry.
 *
 * Mocked at the same boundaries as `json-format.test.ts`: `@/server/auth/bearer`
 * for `resolveApiToken`, `@/db/queries` for `getSeriesForUser`. `POST` in this
 * file's sibling `route.ts` (series creation, covered by `schema.test.ts`) is
 * untouched by anything here — these tests only import/exercise `GET`.
 */

const mocks = vi.hoisted(() => ({
  resolveApiToken: vi.fn(),
  getSeriesForUser: vi.fn(),
}));

vi.mock("@/server/auth/bearer", () => ({
  resolveApiToken: mocks.resolveApiToken,
}));

vi.mock("@/db/queries", () => ({
  getSeriesForUser: mocks.getSeriesForUser,
}));

import { GET } from "../route";

const SUPABASE_TOKEN_STUB = { tag: "token" } as never;

// Full `series` rows as `getSeriesForUser` would return them — deliberately
// including columns (goal, organization_id, dont_bring_up, ...) that are NOT
// part of the discovery endpoint's declared shape, so the mapping test can
// catch an accidental full-row leak (e.g. a lazy `...s` spread).
const SERIES_ROWS = [
  {
    id: "series-1",
    organization_id: "org-1",
    title: "Dad's Stories",
    subject_kind: "self",
    subject_user_id: null,
    subject_name: "Dad",
    subject_relationship: null,
    goal: "Preserve his life story",
    opening_prompt: null,
    dont_bring_up: [],
    tone: "warm",
    total_minutes: 20,
    voice: "cedar",
    interviewer_name: "Interviewer",
    depth: "balanced",
    planned_sessions: null,
    photo_path: null,
    status: "active",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "series-2",
    organization_id: "org-1",
    title: "Mom's Stories",
    subject_kind: "self",
    subject_user_id: null,
    subject_name: "Mom",
    subject_relationship: null,
    goal: "Preserve her life story",
    opening_prompt: null,
    dont_bring_up: [],
    tone: "warm",
    total_minutes: 20,
    voice: "sol",
    interviewer_name: "Interviewer",
    depth: "balanced",
    planned_sessions: null,
    photo_path: null,
    status: "paused",
    created_by: "user-1",
    created_at: "2026-01-02T00:00:00Z",
  },
];

function req(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, headers ? { headers } : undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/series?format=json", () => {
  it("with a valid Bearer token, returns only getSeriesForUser's rows mapped to the declared shape", async () => {
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: SUPABASE_TOKEN_STUB });
    mocks.getSeriesForUser.mockResolvedValue(SERIES_ROWS);

    const res = await GET(
      req("http://localhost:3000/api/series?format=json", { authorization: "Bearer pat_test" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // toEqual (not a subset match) — proves no extra column from the full
    // `series` row (goal, organization_id, dont_bring_up, ...) leaks through.
    expect(body).toEqual({
      series: [
        { id: "series-1", title: "Dad's Stories", subjectName: "Dad", status: "active" },
        { id: "series-2", title: "Mom's Stories", subjectName: "Mom", status: "paused" },
      ],
    });
    expect(mocks.getSeriesForUser).toHaveBeenCalledWith(SUPABASE_TOKEN_STUB);
  });

  it("with no token and no session, returns 401 { error: 'unauthorized' } and never queries series", async () => {
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await GET(req("http://localhost:3000/api/series?format=json"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getSeriesForUser).not.toHaveBeenCalled();
  });

  it("with a revoked/unknown token, returns 401 (never 500)", async () => {
    // resolveApiToken deliberately collapses every failure mode — missing,
    // malformed, unknown, revoked — to null (see src/server/auth/bearer.ts),
    // so a revoked token looks identical to no token from this route's side.
    // What this test actually pins down is that the route never assumes a
    // header's mere *presence* implies a resolvable caller: a well-formed
    // Bearer header that still resolves to null must short-circuit to 401
    // before touching getSeriesForUser, rather than falling through and
    // crashing (e.g. `caller.supabase` on a null caller would throw -> 500).
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await GET(
      req("http://localhost:3000/api/series?format=json", { authorization: "Bearer pat_revoked" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getSeriesForUser).not.toHaveBeenCalled();
  });

  it("a GET without format=json exposes nothing, even with a valid token", async () => {
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: SUPABASE_TOKEN_STUB });
    mocks.getSeriesForUser.mockResolvedValue(SERIES_ROWS);

    const res = await GET(req("http://localhost:3000/api/series", { authorization: "Bearer pat_test" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.getSeriesForUser).not.toHaveBeenCalled();
  });
});
