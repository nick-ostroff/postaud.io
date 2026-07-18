import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for the Obsidian plugin's `?format=json` path (Task 6).
 * These mock `@/server/export/series-data` at the `buildSeriesExportData`
 * boundary (not the raw `@/db/queries` boundary the pinned Markdown
 * characterization test uses) — `buildJsonPayload` itself is left real via
 * `importOriginal`, so the `contentHash` assertions below exercise the actual
 * hashing logic rather than a canned stub.
 */

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  buildSeriesExportData: vi.fn(),
  resolveApiToken: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getViewer: mocks.getViewer,
}));

vi.mock("@/server/export/series-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/export/series-data")>();
  return { ...actual, buildSeriesExportData: mocks.buildSeriesExportData };
});

vi.mock("@/server/auth/bearer", () => ({
  resolveApiToken: mocks.resolveApiToken,
}));

import { GET } from "../route";

const SUPABASE_COOKIE_STUB = { tag: "cookie" } as never;
const SUPABASE_TOKEN_STUB = { tag: "token" } as never;

const EXPORT_DATA = {
  series: { title: "Dad's Stories", subjectName: "Dad", goal: "Preserve his life story" },
  summaries: [{ short: "Talked about childhood", date: "Jan 1, 2026" }],
  factsByTopic: [
    {
      topic: "Childhood",
      facts: [
        {
          statement: "Grew up in Ohio",
          sessionLabel: "Session 1",
          timestamp: "1:05",
          entities: [{ id: "entity-date-1", name: "1955", kind: "date" }],
        },
      ],
    },
  ],
  people: [{ name: "Mom", detail: "His mother" }],
  places: ["Ohio"],
  entities: [
    { id: "entity-mom", name: "Mom", kind: "person" as const, detail: "His mother" },
    { id: "entity-place", name: "Ohio", kind: "place" as const, detail: null },
    { id: "entity-date-1", name: "1955", kind: "date" as const, detail: null },
  ],
  timeline: [{ label: "1955", statement: "Grew up in Ohio" }],
};

function req(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, headers ? { headers } : undefined);
}

function ctx() {
  return { params: Promise.resolve({ id: "series-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({ supabase: SUPABASE_COOKIE_STUB });
  mocks.resolveApiToken.mockResolvedValue(null);
  mocks.buildSeriesExportData.mockResolvedValue(EXPORT_DATA);
});

describe("GET /api/series/[id]/export?format=json", () => {
  it("returns application/json with the declared shape", async () => {
    const res = await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());

    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();

    expect(body.series).toEqual({
      id: "series-1",
      title: "Dad's Stories",
      subjectName: "Dad",
      goal: "Preserve his life story",
    });
    expect(body.summaries).toEqual([{ short: "Talked about childhood", date: "Jan 1, 2026" }]);
    expect(body.timeline).toEqual([{ label: "1955", statement: "Grew up in Ohio" }]);
    expect(body.topics).toEqual([
      {
        name: "Childhood",
        hash: expect.any(String),
        facts: [
          {
            statement: "Grew up in Ohio",
            sessionLabel: "Session 1",
            timestamp: "1:05",
            entities: [{ id: "entity-date-1", name: "1955", kind: "date" }],
          },
        ],
      },
    ]);
    expect(body.entities).toEqual([
      { id: "entity-mom", name: "Mom", kind: "person", detail: "His mother", hash: expect.any(String) },
      { id: "entity-place", name: "Ohio", kind: "place", detail: null, hash: expect.any(String) },
      { id: "entity-date-1", name: "1955", kind: "date", detail: null, hash: expect.any(String) },
    ]);
    expect(typeof body.contentHash).toBe("string");
    expect(body.contentHash).toHaveLength(16);
  });

  it("omitting format still returns Markdown with the Content-Disposition attachment header (no regression)", async () => {
    const res = await GET(req("http://localhost:3000/api/series/series-1/export"), ctx());

    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="dads-stories.md"');
    expect(await res.text()).toContain("# Dad's Stories");
  });

  it("404s an unknown series with format=json the same way as Markdown", async () => {
    mocks.buildSeriesExportData.mockResolvedValue(null);

    const res = await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("uses the token's supabase client and never calls getViewer when a valid Bearer token is present", async () => {
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: SUPABASE_TOKEN_STUB });

    await GET(
      req("http://localhost:3000/api/series/series-1/export?format=json", { authorization: "Bearer pat_test" }),
      ctx(),
    );

    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.buildSeriesExportData).toHaveBeenCalledWith(SUPABASE_TOKEN_STUB, "series-1", expect.any(Object));
  });

  it("falls back to getViewer when no Bearer token is present", async () => {
    await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());

    expect(mocks.resolveApiToken).toHaveBeenCalled();
    expect(mocks.getViewer).toHaveBeenCalled();
    expect(mocks.buildSeriesExportData).toHaveBeenCalledWith(SUPABASE_COOKIE_STUB, "series-1", expect.any(Object));
  });

  it("always requests the full scope for json regardless of an explicit scope param, excluding transcripts", async () => {
    await GET(req("http://localhost:3000/api/series/series-1/export?format=json&scope=facts"), ctx());

    expect(mocks.buildSeriesExportData).toHaveBeenCalledWith(SUPABASE_COOKIE_STUB, "series-1", {
      summaries: true,
      facts: true,
      entities: true,
      timeline: true,
      transcripts: false,
    });
  });

  it("contentHash is unchanged for identical data and changes when a fact statement changes", async () => {
    const res1 = await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());
    const body1 = await res1.json();

    const res2 = await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());
    const body2 = await res2.json();
    expect(body2.contentHash).toBe(body1.contentHash);

    mocks.buildSeriesExportData.mockResolvedValue({
      ...EXPORT_DATA,
      factsByTopic: [
        {
          topic: "Childhood",
          facts: [{ ...EXPORT_DATA.factsByTopic[0].facts[0], statement: "Grew up in Indiana" }],
        },
      ],
    });
    const res3 = await GET(req("http://localhost:3000/api/series/series-1/export?format=json"), ctx());
    const body3 = await res3.json();
    expect(body3.contentHash).not.toBe(body1.contentHash);
  });
});

/**
 * IMPORTANT 3 (final review): a caller who presents a Bearer token but whose
 * token resolves to null (invalid, revoked, unknown) must get a normal 401,
 * never a fall-through to `getViewer()` — which throws "Not authenticated"
 * with no cookies present, surfacing as an unhandled 500 since middleware
 * doesn't gate `/api/*`. This is the exact shape of "user revokes a token,
 * plugin gets an opaque 500 it can't tell apart from an outage."
 */
describe("GET /api/series/[id]/export — bearer auth resolution (IMPORTANT 3)", () => {
  it("a present but unresolvable Bearer token (invalid/revoked/unknown) returns 401, not 500, and never falls back to cookies", async () => {
    mocks.resolveApiToken.mockResolvedValue(null);
    // getViewer would throw "Not authenticated" with no cookies — proving
    // resolveCaller must not reach it once an Authorization header is
    // present at all.
    mocks.getViewer.mockRejectedValue(new Error("Not authenticated"));

    const res = await GET(
      req("http://localhost:3000/api/series/series-1/export", { authorization: "Bearer pat_revoked" }),
      ctx(),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.buildSeriesExportData).not.toHaveBeenCalled();
  });

  it("no Authorization header at all + a valid cookie session still works (no regression)", async () => {
    mocks.resolveApiToken.mockResolvedValue(null);
    mocks.getViewer.mockResolvedValue({ supabase: SUPABASE_COOKIE_STUB });

    const res = await GET(req("http://localhost:3000/api/series/series-1/export"), ctx());

    expect(res.status).toBe(200);
    expect(mocks.getViewer).toHaveBeenCalled();
    expect(mocks.buildSeriesExportData).toHaveBeenCalledWith(SUPABASE_COOKIE_STUB, "series-1", expect.any(Object));
  });
});
