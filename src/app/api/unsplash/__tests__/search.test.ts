import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));

import { GET } from "../search/route";

const PHOTO = {
  id: "abc123",
  description: "a sofa",
  alt_description: "brown leather sofa",
  color: "#c0ffee",
  urls: { small: "https://images.unsplash.com/abc?w=400", regular: "https://images.unsplash.com/abc?w=1080" },
  links: { download_location: "https://api.unsplash.com/photos/abc123/download?ixid=xyz" },
  user: { name: "Jane Doe", links: { html: "https://unsplash.com/@janedoe" } },
};

function searchReq(qs: string) {
  return new Request(`http://localhost:3000/api/unsplash/search${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key");
  mocks.getViewer.mockResolvedValue({ organization: { id: "org-1" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/unsplash/search", () => {
  it("rejects viewers without an org with 403", async () => {
    mocks.getViewer.mockResolvedValue({ organization: null });
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(403);
  });

  it("returns 503 not_configured when the key is missing", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("returns 400 when query is missing or blank", async () => {
    expect((await GET(searchReq(""))).status).toBe(400);
    expect((await GET(searchReq("?query=%20"))).status).toBe(400);
  });

  it("proxies the search and trims the response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total_pages: 7, results: [PHOTO] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(searchReq("?query=sofa&page=2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    const called = new URL(fetchMock.mock.calls[0][0]);
    expect(called.hostname).toBe("api.unsplash.com");
    expect(called.searchParams.get("query")).toBe("sofa");
    expect(called.searchParams.get("page")).toBe("2");
    expect(called.searchParams.get("orientation")).toBe("squarish");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Client-ID test-key");

    expect(body.totalPages).toBe(7);
    expect(body.results).toEqual([
      {
        id: "abc123",
        alt: "brown leather sofa",
        color: "#c0ffee",
        thumbUrl: PHOTO.urls.small,
        regularUrl: PHOTO.urls.regular,
        downloadLocation: PHOTO.links.download_location,
        photographerName: "Jane Doe",
        photographerUrl: "https://unsplash.com/@janedoe",
      },
    ]);
  });

  it("retries without the squarish filter when it returns no results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 0, total_pages: 0, results: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ total_pages: 3, results: [PHOTO] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(searchReq("?query=pickleball%20court"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("orientation")).toBe("squarish");
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("orientation")).toBeNull();
    expect(body.totalPages).toBe(3);
    expect(body.results).toHaveLength(1);
  });

  it("maps an Unsplash 403 (rate limit) to 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("limit", { status: 403 })));
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("maps other Unsplash failures to 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(502);
  });
});
