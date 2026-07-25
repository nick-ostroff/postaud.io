import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));

import { GET } from "../route";

const UNSPLASH_PHOTO = {
  id: "abc123",
  description: "a sofa",
  alt_description: "brown leather sofa",
  color: "#c0ffee",
  urls: { small: "https://images.unsplash.com/abc?w=400", regular: "https://images.unsplash.com/abc?w=1080" },
  links: { download_location: "https://api.unsplash.com/photos/abc123/download?ixid=xyz" },
  user: { name: "Jane Doe", links: { html: "https://unsplash.com/@janedoe" } },
};

const PEXELS_PHOTO = {
  id: 987,
  alt: "green velvet couch",
  avg_color: "#123456",
  src: { medium: "https://images.pexels.com/987/medium.jpg", large: "https://images.pexels.com/987/large.jpg" },
  photographer: "John Roe",
  photographer_url: "https://www.pexels.com/@johnroe",
};

function unsplashResponse(results: unknown[], totalPages = 3) {
  return new Response(JSON.stringify({ total_pages: totalPages, results }), { status: 200 });
}

function pexelsResponse(photos: unknown[], totalResults = 60) {
  return new Response(JSON.stringify({ total_results: totalResults, photos }), { status: 200 });
}

/** Routes fetches by hostname so provider call order never matters. */
function stubFetch(handlers: { unsplash?: () => Response; pexels?: () => Response }) {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "api.unsplash.com") return handlers.unsplash?.() ?? unsplashResponse([]);
    if (url.hostname === "api.pexels.com") return handlers.pexels?.() ?? pexelsResponse([], 0);
    throw new Error(`unexpected host: ${url.hostname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function searchReq(qs: string) {
  return new Request(`http://localhost:3000/api/photo-search${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "u-key");
  vi.stubEnv("PEXELS_API_KEY", "p-key");
  mocks.getViewer.mockResolvedValue({ organization: { id: "org-1" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/photo-search", () => {
  it("rejects viewers without an org with 403", async () => {
    mocks.getViewer.mockResolvedValue({ organization: null });
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(403);
  });

  it("returns 503 not_configured when no provider key is set", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    vi.stubEnv("PEXELS_API_KEY", "");
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("returns 400 when query is missing or blank", async () => {
    stubFetch({});
    expect((await GET(searchReq(""))).status).toBe(400);
    expect((await GET(searchReq("?query=%20"))).status).toBe(400);
  });

  it("merges both providers, interleaved, with a unified shape", async () => {
    stubFetch({
      unsplash: () => unsplashResponse([UNSPLASH_PHOTO], 3),
      pexels: () => pexelsResponse([PEXELS_PHOTO], 60),
    });

    const res = await GET(searchReq("?query=sofa"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalPages).toBe(5); // max(3, ceil(60/12))
    expect(body.results).toEqual([
      {
        id: "u_abc123",
        source: "unsplash",
        alt: "brown leather sofa",
        color: "#c0ffee",
        thumbUrl: UNSPLASH_PHOTO.urls.small,
        regularUrl: UNSPLASH_PHOTO.urls.regular,
        downloadLocation: UNSPLASH_PHOTO.links.download_location,
        photographerName: "Jane Doe",
        photographerUrl: "https://unsplash.com/@janedoe",
      },
      {
        id: "p_987",
        source: "pexels",
        alt: "green velvet couch",
        color: "#123456",
        thumbUrl: PEXELS_PHOTO.src.medium,
        regularUrl: PEXELS_PHOTO.src.large,
        downloadLocation: null,
        photographerName: "John Roe",
        photographerUrl: "https://www.pexels.com/@johnroe",
      },
    ]);
  });

  it("never sends Pexels an orientation filter", async () => {
    const calls = stubFetch({
      unsplash: () => unsplashResponse([UNSPLASH_PHOTO]),
      pexels: () => pexelsResponse([PEXELS_PHOTO]),
    });

    await GET(searchReq("?query=pickleball"));

    const pexelsCalls = calls.filter((u) => u.hostname === "api.pexels.com");
    expect(pexelsCalls).toHaveLength(1);
    expect(pexelsCalls[0].searchParams.get("orientation")).toBeNull();
  });

  it("only queries providers that have a key", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    const calls = stubFetch({ unsplash: () => unsplashResponse([UNSPLASH_PHOTO]) });

    const res = await GET(searchReq("?query=sofa"));

    expect(res.status).toBe(200);
    expect(calls.every((u) => u.hostname === "api.unsplash.com")).toBe(true);
    expect((await res.json()).results.map((r: { source: string }) => r.source)).toEqual(["unsplash"]);
  });

  it("keeps serving from one provider when the other is rate-limited", async () => {
    stubFetch({
      unsplash: () => new Response("limit", { status: 403 }),
      pexels: () => pexelsResponse([PEXELS_PHOTO], 12),
    });

    const res = await GET(searchReq("?query=sofa"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.map((r: { source: string }) => r.source)).toEqual(["pexels"]);
  });

  it("returns 429 when every configured provider is rate-limited", async () => {
    stubFetch({
      unsplash: () => new Response("limit", { status: 403 }),
      pexels: () => new Response("limit", { status: 429 }),
    });
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("returns 502 when every configured provider errors", async () => {
    stubFetch({
      unsplash: () => new Response("boom", { status: 500 }),
      pexels: () => new Response("boom", { status: 500 }),
    });
    const res = await GET(searchReq("?query=sofa"));
    expect(res.status).toBe(502);
  });

  it("retries a provider without the square filter when it returns no results", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    let call = 0;
    const calls = stubFetch({
      unsplash: () => (++call === 1 ? unsplashResponse([], 0) : unsplashResponse([UNSPLASH_PHOTO], 2)),
    });

    const res = await GET(searchReq("?query=pickleball%20court"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].searchParams.get("orientation")).toBe("squarish");
    expect(calls[1].searchParams.get("orientation")).toBeNull();
    expect(body.results).toHaveLength(1);
    expect(body.totalPages).toBe(2);
  });
});
