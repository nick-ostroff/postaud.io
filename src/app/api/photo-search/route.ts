import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";

const PER_PROVIDER = 12;

export type PhotoResult = {
  id: string;
  source: "unsplash" | "pexels";
  alt: string | null;
  color: string | null;
  thumbUrl: string;
  regularUrl: string;
  /** Unsplash only — their terms require a tracking ping on pick (via /api/unsplash/use). */
  downloadLocation: string | null;
  photographerName: string;
  photographerUrl: string;
};

type ProviderPage = { results: PhotoResult[]; totalPages: number };
type ProviderOutcome = ProviderPage | "rate_limited" | "error";

type UnsplashPhoto = {
  id: string;
  description: string | null;
  alt_description: string | null;
  color: string | null;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
};

type PexelsPhoto = {
  id: number;
  alt: string | null;
  avg_color: string | null;
  src: { medium: string; large: string };
  photographer: string;
  photographer_url: string;
};

/**
 * Unsplash searches square-first — best for the circular avatar crop, and its
 * squarish results measurably rank better — but niche queries sometimes have
 * zero squarish photos (e.g. "pickleball court"), so it retries unconstrained
 * when the filtered search comes back empty.
 */
async function searchUnsplash(key: string, query: string, page: number): Promise<ProviderOutcome> {
  async function attempt(orientation: string | null) {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PER_PROVIDER));
    if (orientation) url.searchParams.set("orientation", orientation);
    url.searchParams.set("content_filter", "high");
    return fetch(url, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
  }

  let res = await attempt("squarish");
  // 403 is how Unsplash reports a blown rate limit (demo tier: 50/hr).
  if (res.status === 401 || res.status === 403) return "rate_limited";
  if (!res.ok) return "error";
  let body = (await res.json()) as { total_pages: number; results: UnsplashPhoto[] };

  if (body.results.length === 0) {
    res = await attempt(null);
    if (res.ok) body = (await res.json()) as typeof body;
  }

  return {
    totalPages: body.total_pages,
    results: body.results.map((p) => ({
      id: `u_${p.id}`,
      source: "unsplash" as const,
      alt: p.alt_description ?? p.description ?? null,
      color: p.color,
      thumbUrl: p.urls.small,
      regularUrl: p.urls.regular,
      downloadLocation: p.links.download_location,
      photographerName: p.user.name,
      photographerUrl: p.user.links.html,
    })),
  };
}

/**
 * Unlike Unsplash, Pexels' `orientation=square` filter guts relevance instead
 * of improving it (measured: "pickleball" square → 20 mostly-tennis results;
 * unconstrained → 4k on-topic ones), so Pexels always searches unconstrained.
 * The grid shows square thumbs via CSS and the cropper handles any ratio.
 */
async function searchPexels(key: string, query: string, page: number): Promise<ProviderOutcome> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PER_PROVIDER));

  const res = await fetch(url, { headers: { Authorization: key } });
  if (res.status === 401 || res.status === 403 || res.status === 429) return "rate_limited";
  if (!res.ok) return "error";
  const body = (await res.json()) as { total_results: number; photos: PexelsPhoto[] };

  return {
    totalPages: Math.ceil(body.total_results / PER_PROVIDER),
    results: body.photos.map((p) => ({
      id: `p_${p.id}`,
      source: "pexels" as const,
      alt: p.alt || null,
      color: p.avg_color,
      thumbUrl: p.src.medium,
      regularUrl: p.src.large,
      downloadLocation: null,
      photographerName: p.photographer,
      photographerUrl: p.photographer_url,
    })),
  };
}

/** a0, b0, a1, b1, … — so neither provider dominates the top of the grid. */
function interleave(a: PhotoResult[], b: PhotoResult[]): PhotoResult[] {
  const out: PhotoResult[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/**
 * GET /api/photo-search?query=...&page=... — merged stock-photo search across
 * Unsplash and Pexels, fanned out in parallel and interleaved. Keys stay
 * server-side. Degrades gracefully: a provider with no key, a rate limit, or
 * an error just drops out; only when every configured provider fails does the
 * caller see an error.
 */
export async function GET(request: Request) {
  const { organization } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!unsplashKey && !pexelsKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }
  const page = Math.min(50, Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)));

  const outcomes = await Promise.all([
    unsplashKey ? searchUnsplash(unsplashKey, query, page) : Promise.resolve(null),
    pexelsKey ? searchPexels(pexelsKey, query, page) : Promise.resolve(null),
  ]);

  const pages = outcomes.filter((o): o is ProviderPage => o !== null && typeof o !== "string");
  if (pages.length === 0) {
    const rateLimited = outcomes.some((o) => o === "rate_limited");
    return NextResponse.json(
      { error: rateLimited ? "rate_limited" : "provider_error" },
      { status: rateLimited ? 429 : 502 },
    );
  }

  const [unsplashPage, pexelsPage] = outcomes.map((o) => (o !== null && typeof o !== "string" ? o : null));
  return NextResponse.json({
    totalPages: Math.max(...pages.map((p) => p.totalPages)),
    results: interleave(unsplashPage?.results ?? [], pexelsPage?.results ?? []),
  });
}
