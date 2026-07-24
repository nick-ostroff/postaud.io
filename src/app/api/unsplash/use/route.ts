import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";

/**
 * POST /api/unsplash/use { downloadLocation } — pings Unsplash's
 * download-tracking endpoint when a search result is actually picked.
 * Their API terms require this on every "download" (our pick counts as one);
 * it needs the access key, hence a server route. The image bytes themselves
 * are fetched by the client straight from Unsplash's CDN.
 */
export async function POST(request: Request) {
  const { organization } = await getViewer();
  if (!organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const downloadLocation = typeof body?.downloadLocation === "string" ? body.downloadLocation : "";

  // Only ever call the one Unsplash endpoint this exists for — never an
  // arbitrary caller-supplied URL with our key attached.
  let target: URL;
  try {
    target = new URL(downloadLocation);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  if (target.hostname !== "api.unsplash.com" || !/^\/photos\/[^/]+\/download$/.test(target.pathname)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const res = await fetch(target, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "unsplash_error" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
