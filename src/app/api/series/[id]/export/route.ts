import { NextResponse } from "next/server";
import { getViewer } from "@/db/queries";
import { renderSeriesMarkdown, slugifyTitle, stripMarkdownToText, type SeriesExportScope } from "@/server/export/markdown";
import { buildSeriesExportData } from "@/server/export/series-data";

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
 * GET /api/series/[id]/export?format=md|txt&scope=summaries,facts,entities,timeline[,transcripts]
 * — Task 16's "take it with you" download. Guarded the same way as every
 * other series read: `buildSeriesExportData` returns null for a series the
 * caller's RLS can't see, which we treat as a plain 404 (no existence leak).
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "txt" ? "txt" : "md";
  const scope = parseScope(url.searchParams.get("scope"));

  const data = await buildSeriesExportData(supabase, id, scope);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // `SeriesExportData.series.goal` is typed `string | null` (Task 5 brief's
  // contract, so Task 6's JSON output can be null-safe about it), but the
  // `series.goal` DB column is non-null — this coalesce is a type-satisfying
  // no-op in practice, not a behavior change.
  const markdown = renderSeriesMarkdown({ ...data, scope, series: { ...data.series, goal: data.series.goal ?? "" } });

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
