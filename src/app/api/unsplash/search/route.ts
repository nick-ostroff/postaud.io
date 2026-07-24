import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";

const PER_PAGE = 24;

type UnsplashPhoto = {
  id: string;
  description: string | null;
  alt_description: string | null;
  color: string | null;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
};

/**
 * GET /api/unsplash/search?query=...&page=... — server-side proxy for Unsplash
 * photo search, so the access key never reaches the browser. Any signed-in
 * member of an org may search (the write itself stays admin-gated at
 * /api/series/[id]/photo). Returns a trimmed result shape: enough to render
 * the picker grid (thumb + credit) and to complete a pick (regularUrl to crop
 * from, downloadLocation for the required usage ping).
 */
export async function GET(request: Request) {
  const { organization } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }
  const page = Math.min(50, Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)));

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PER_PAGE));
  // The photo becomes a circular avatar — squarish frames crop best.
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
  });
  if (res.status === 401 || res.status === 403) {
    // 403 is how Unsplash reports a blown rate limit (demo tier: 50/hr).
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "unsplash_error" }, { status: 502 });
  }

  const body = (await res.json()) as { total_pages: number; results: UnsplashPhoto[] };
  return NextResponse.json({
    totalPages: body.total_pages,
    results: body.results.map((p) => ({
      id: p.id,
      alt: p.alt_description ?? p.description ?? null,
      color: p.color,
      thumbUrl: p.urls.small,
      regularUrl: p.urls.regular,
      downloadLocation: p.links.download_location,
      photographerName: p.user.name,
      photographerUrl: p.user.links.html,
    })),
  });
}
