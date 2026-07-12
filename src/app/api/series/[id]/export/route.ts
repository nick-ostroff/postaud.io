import { NextResponse } from "next/server";
import {
  getInterviewMessages,
  getSeries,
  getSeriesKnowledge,
  getViewer,
  listInterviewsForSeries,
} from "@/db/queries";
import {
  renderSeriesMarkdown,
  slugifyTitle,
  stripMarkdownToText,
  type SeriesExportScope,
  type SeriesExportTimelineEntry,
  type SeriesExportTopicGroup,
  type SeriesExportTranscript,
} from "@/server/export/markdown";

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

/** Seconds → "M:SS" for a fact's source line, or null with no recorded offset. */
function formatOffset(sec: number | null): string | null {
  if (sec == null) return null;
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * GET /api/series/[id]/export?format=md|txt&scope=summaries,facts,entities,timeline[,transcripts]
 * — Task 16's "take it with you" download. Guarded the same way as every
 * other series read: `getSeries` returns null for a series the caller's RLS
 * can't see, which we treat as a plain 404 (no existence leak).
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "txt" ? "txt" : "md";
  const scope = parseScope(url.searchParams.get("scope"));

  const [knowledge, sessions] = await Promise.all([
    getSeriesKnowledge(supabase, id),
    listInterviewsForSeries(supabase, id),
  ]);

  // `listInterviewsForSeries` already numbers sessions 1-based by
  // started_at ("Session N") — reuse it rather than re-deriving.
  const sessionLabelByInterview = new Map(sessions.map((s) => [s.id, `Session ${s.sessionNumber}`] as const));

  const summaries = scope.summaries
    ? sessions
        .filter((s) => s.summaryShort)
        .map((s) => ({ short: s.summaryShort as string, date: formatDateLabel(s.startedAt) }))
    : [];

  const activeFacts = knowledge.facts.filter((f) => f.status !== "superseded");

  const topicName = new Map(knowledge.topics.map((t) => [t.id, t.name] as const));
  const topicOrder = [...knowledge.topics].sort((a, b) => a.position - b.position).map((t) => t.id);

  const groupsById = new Map<string, SeriesExportTopicGroup>();
  const otherGroup: SeriesExportTopicGroup = { topic: "Other", facts: [] };
  for (const fact of activeFacts) {
    const sessionLabel = fact.source_interview_id
      ? (sessionLabelByInterview.get(fact.source_interview_id) ?? "Manual entry")
      : "Manual entry";
    const entry = { statement: fact.statement, sessionLabel, timestamp: formatOffset(fact.audio_offset_sec) };
    if (fact.topic_id && topicName.has(fact.topic_id)) {
      if (!groupsById.has(fact.topic_id)) {
        groupsById.set(fact.topic_id, { topic: topicName.get(fact.topic_id) as string, facts: [] });
      }
      groupsById.get(fact.topic_id)!.facts.push(entry);
    } else {
      otherGroup.facts.push(entry);
    }
  }
  const factsByTopic: SeriesExportTopicGroup[] = [
    ...topicOrder.filter((tid) => groupsById.has(tid)).map((tid) => groupsById.get(tid) as SeriesExportTopicGroup),
    ...(otherGroup.facts.length > 0 ? [otherGroup] : []),
  ];

  const people = knowledge.entities
    .filter((e) => e.kind === "person")
    .map((e) => ({ name: e.name, detail: e.detail ?? undefined }));
  const places = knowledge.entities.filter((e) => e.kind === "place").map((e) => e.name);

  // Timeline: date entities, statement drawn from linked facts (via
  // fact_entities, already joined onto each fact by getSeriesKnowledge) when
  // available, falling back to the entity's own `detail` field.
  const statementsByEntity = new Map<string, string[]>();
  for (const fact of activeFacts) {
    for (const entity of fact.entities) {
      if (entity.kind !== "date") continue;
      const list = statementsByEntity.get(entity.id) ?? [];
      list.push(fact.statement);
      statementsByEntity.set(entity.id, list);
    }
  }
  const timeline: SeriesExportTimelineEntry[] = knowledge.entities
    .filter((e) => e.kind === "date")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      label: e.name,
      statement: (statementsByEntity.get(e.id) ?? []).join("; ") || e.detail || "",
    }));

  let transcripts: SeriesExportTranscript[] | undefined;
  if (scope.transcripts) {
    const withMessages = await Promise.all(
      sessions.map(async (s) => {
        const messages = await getInterviewMessages(supabase, s.id);
        return {
          sessionLabel: `Session ${s.sessionNumber}`,
          turns: messages.map((m) => ({
            role: m.role === "interviewer" ? "Anna" : series.subject_name,
            text: m.text,
          })),
        };
      }),
    );
    transcripts = withMessages.filter((t) => t.turns.length > 0);
  }

  const markdown = renderSeriesMarkdown({
    series: { title: series.title, subjectName: series.subject_name, goal: series.goal },
    summaries,
    factsByTopic,
    people,
    places,
    timeline,
    scope,
    transcripts,
  });

  const body = format === "txt" ? stripMarkdownToText(markdown) : markdown;
  const filename = `${slugifyTitle(series.title)}.${format}`;
  const contentType = format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
