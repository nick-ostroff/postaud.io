import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { renderSeriesMarkdown, slugifyTitle, stripMarkdownToText, type SeriesExportScope } from "@/server/export/markdown";
import { buildJsonPayload, buildSeriesExportData } from "@/server/export/series-data";
import { resolveApiToken } from "@/server/auth/bearer";

type Params = Promise<{ id: string }>;

// Matches the export card's default-checked boxes (Task 16 brief / mockup
// #1g): everything but full transcripts, which "makes a long file".
const DEFAULT_SCOPE: SeriesExportScope = {
  summaries: true,
  facts: true,
  entities: true,
  timeline: true,
  transcripts: false,
};

function parseScope(raw: string | null): SeriesExportScope {
  if (!raw) return DEFAULT_SCOPE;
  const keys = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return {
    summaries: keys.has("summaries"),
    facts: keys.has("facts"),
    entities: keys.has("entities"),
    timeline: keys.has("timeline"),
    transcripts: keys.has("transcripts"),
  };
}

/**
 * Resolves the caller for both consumers of this route: the Obsidian plugin
 * (Bearer token, Task 3) and the browser export card (session cookies).
 * Bearer is tried first — a present, valid token always wins — so the same
 * route can serve both without the plugin ever touching cookie auth.
 */
async function resolveCaller(request: Request) {
  const apiCaller = await resolveApiToken(request);
  if (apiCaller) return apiCaller.supabase;
  const { supabase } = await getViewer();
  return supabase;
}

/**
 * GET /api/series/[id]/export?format=md|txt|json&scope=summaries,facts,entities,timeline[,transcripts]
 * — Task 16's "take it with you" download, plus (Task 6) the Obsidian
 * plugin's machine-readable sync format. Guarded the same way as every
 * other series read: `buildSeriesExportData` returns null for a series the
 * caller's RLS can't see, which we treat as a plain 404 (no existence leak).
 *
 * `format=json` always uses the full scope minus transcripts — the plugin
 * mirrors the knowledge base, not raw transcripts — ignoring any `scope`
 * query param, which only applies to the Markdown/text download.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = await resolveCaller(request);

  const url = new URL(request.url);
  const wantsJson = url.searchParams.get("format") === "json";
  const format = url.searchParams.get("format") === "txt" ? "txt" : "md";
  const scope = wantsJson ? DEFAULT_SCOPE : parseScope(url.searchParams.get("scope"));

  const data = await buildSeriesExportData(supabase, id, scope);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (wantsJson) {
    return NextResponse.json(buildJsonPayload(id, data));
  }

  const markdown = renderSeriesMarkdown({ ...data, scope });

  const body = format === "txt" ? stripMarkdownToText(markdown) : markdown;
  const filename = `${slugifyTitle(data.series.title)}.${format}`;
  const contentType = format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
