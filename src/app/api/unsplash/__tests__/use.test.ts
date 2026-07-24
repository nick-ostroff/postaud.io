import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));

import { POST } from "../use/route";

function trackReq(body: unknown) {
  return new Request("http://localhost:3000/api/unsplash/use", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("POST /api/unsplash/use", () => {
  it("rejects viewers without an org with 403", async () => {
    mocks.getViewer.mockResolvedValue({ organization: null });
    const res = await POST(trackReq({ downloadLocation: "https://api.unsplash.com/photos/a/download" }));
    expect(res.status).toBe(403);
  });

  it("rejects non-Unsplash and malformed URLs with 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const downloadLocation of [
      "not a url",
      "https://evil.example.com/photos/a/download",
      "https://api.unsplash.com/collections/steal",
      undefined,
    ]) {
      const res = await POST(trackReq({ downloadLocation }));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pings the download endpoint with the key and returns ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(trackReq({ downloadLocation: "https://api.unsplash.com/photos/abc123/download?ixid=xyz" }));

    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/photos/abc123/download");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Client-ID test-key");
  });

  it("maps an Unsplash failure to 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 404 })));
    const res = await POST(trackReq({ downloadLocation: "https://api.unsplash.com/photos/abc123/download" }));
    expect(res.status).toBe(502);
  });
});
