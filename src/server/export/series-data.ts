import type { SupabaseClient } from "@supabase/supabase-js";
import { getInterviewMessages, getSeries, getSeriesKnowledge, listInterviewsForSeries } from "@/db/queries";
import type { Database } from "@/db/types";
import type {
  SeriesExportPerson,
  SeriesExportScope,
  SeriesExportTimelineEntry,
  SeriesExportTopicGroup,
  SeriesExportTranscript,
} from "@/server/export/markdown";

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

export type SeriesExportData = {
  series: { title: string; subjectName: string; goal: string };
  summaries: Array<{ short: string; date: string }>;
  factsByTopic: SeriesExportTopicGroup[];
  people: SeriesExportPerson[];
  places: string[];
  timeline: SeriesExportTimelineEntry[];
  transcripts?: SeriesExportTranscript[];
};

/**
 * Assembles a series' knowledge base into plain data shaped for the
 * Markdown renderer (`renderSeriesMarkdown`) — extracted from the export
 * route (Task 5) so a second output format (JSON, Task 6) can reuse the same
 * assembly instead of duplicating it. Guarded the same way as every other
 * series read: `getSeries` returns null for a series the caller's RLS can't
 * see, which the route treats as a plain 404 (no existence leak) — this
 * function mirrors that by returning `null`.
 */
export async function buildSeriesExportData(
  supabase: SupabaseClient<Database>,
  seriesId: string,
  scope: SeriesExportScope,
): Promise<SeriesExportData | null> {
  const series = await getSeries(supabase, seriesId);
  if (!series) {
    return null;
  }

  const [knowledge, sessionsNewestFirst] = await Promise.all([
    getSeriesKnowledge(supabase, seriesId),
    listInterviewsForSeries(supabase, seriesId),
  ]);

  // `listInterviewsForSeries` numbers sessions 1-based by started_at but
  // returns them newest-first (built for the activity feed). A document
  // that reads as a life story goes start-to-finish — Session 1 first.
  const sessions = [...sessionsNewestFirst].sort((a, b) => a.sessionNumber - b.sessionNumber);
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

  return {
    series: { title: series.title, subjectName: series.subject_name, goal: series.goal },
    summaries,
    factsByTopic,
    people,
    places,
    timeline,
    transcripts,
  };
}
