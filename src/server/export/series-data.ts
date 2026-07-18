import type { SupabaseClient } from "@supabase/supabase-js";
import { getInterviewMessages, getSeries, getSeriesKnowledge, listInterviewsForSeries } from "@/db/queries";
import type { Database } from "@/db/types";
import type {
  SeriesExportFact,
  SeriesExportPerson,
  SeriesExportScope,
  SeriesExportTimelineEntry,
  SeriesExportTranscript,
} from "@/server/export/markdown";
import { stableHash } from "@/server/export/hash";

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
 * A fact's linked entities, trimmed to what the JSON export (Task 6) needs
 * for wikilinking a fact to its person/place/date/org/event notes. Kind is a
 * plain `string` here (not the narrower `SeriesExportEntity["kind"]` union)
 * because a fact can link to entity kinds — "org", "event" — that the
 * Markdown export has never surfaced at the top level (see the `kind` filter
 * in `SeriesExportData.entities` below); the JSON payload passes those
 * through for the plugin rather than silently dropping them the way `people`
 * / `places` do.
 */
export type SeriesExportFactEntityRef = { id: string; name: string; kind: string };

/** A `SeriesExportFact` with its linked entities attached — additive over the
 * Markdown-only `SeriesExportFact`, so `renderSeriesMarkdown` (which only
 * reads `statement`/`sessionLabel`/`timestamp`) is unaffected. */
export type SeriesExportFactWithEntities = SeriesExportFact & { entities: SeriesExportFactEntityRef[] };

export type SeriesExportTopicGroupWithEntities = {
  topic: string;
  facts: SeriesExportFactWithEntities[];
};

/**
 * A full entity record (id + kind + detail), kept separate from `people` /
 * `places` because those two already trim away the id and kind the JSON
 * export's per-entity hash and Obsidian note identity need. Restricted to
 * "person" | "place" | "date" — the same subset `people`/`places`/`timeline`
 * already surface — so "org"/"event" entities stay invisible at this
 * top level exactly as before; a fact can still reference them via
 * `SeriesExportFactEntityRef`.
 */
export type SeriesExportEntity = {
  id: string;
  name: string;
  kind: "person" | "place" | "date";
  detail: string | null;
};

export type SeriesExportData = {
  series: { title: string; subjectName: string; goal: string };
  summaries: Array<{ short: string; date: string }>;
  factsByTopic: SeriesExportTopicGroupWithEntities[];
  people: SeriesExportPerson[];
  places: string[];
  entities: SeriesExportEntity[];
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

  const groupsById = new Map<string, SeriesExportTopicGroupWithEntities>();
  const otherGroup: SeriesExportTopicGroupWithEntities = { topic: "Other", facts: [] };
  for (const fact of activeFacts) {
    const sessionLabel = fact.source_interview_id
      ? (sessionLabelByInterview.get(fact.source_interview_id) ?? "Manual entry")
      : "Manual entry";
    // `entities` here is additive over the Markdown path's fact shape — the
    // JSON export (Task 6) needs it to wikilink a fact to its entity notes.
    // renderSeriesMarkdown never reads it, so this doesn't touch Markdown
    // output.
    const entry: SeriesExportFactWithEntities = {
      statement: fact.statement,
      sessionLabel,
      timestamp: formatOffset(fact.audio_offset_sec),
      entities: fact.entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
    };
    if (fact.topic_id && topicName.has(fact.topic_id)) {
      if (!groupsById.has(fact.topic_id)) {
        groupsById.set(fact.topic_id, { topic: topicName.get(fact.topic_id) as string, facts: [] });
      }
      groupsById.get(fact.topic_id)!.facts.push(entry);
    } else {
      otherGroup.facts.push(entry);
    }
  }
  const factsByTopic: SeriesExportTopicGroupWithEntities[] = [
    ...topicOrder
      .filter((tid) => groupsById.has(tid))
      .map((tid) => groupsById.get(tid) as SeriesExportTopicGroupWithEntities),
    ...(otherGroup.facts.length > 0 ? [otherGroup] : []),
  ];

  const people = knowledge.entities
    .filter((e) => e.kind === "person")
    .map((e) => ({ name: e.name, detail: e.detail ?? undefined }));
  const places = knowledge.entities.filter((e) => e.kind === "place").map((e) => e.name);
  // Full-fidelity entity list (id + kind + detail) for the JSON export —
  // same "person" | "place" | "date" subset as `people`/`places`/`timeline`
  // above, just not trimmed down. `getSeriesKnowledge` already orders
  // entities by name, which keeps this deterministic for `contentHash`.
  const entities: SeriesExportEntity[] = knowledge.entities
    .filter((e): e is typeof e & { kind: "person" | "place" | "date" } =>
      e.kind === "person" || e.kind === "place" || e.kind === "date",
    )
    .map((e) => ({ id: e.id, name: e.name, kind: e.kind, detail: e.detail }));

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
    entities,
    timeline,
    transcripts,
  };
}

export type SeriesExportJsonFact = {
  statement: string;
  sessionLabel: string;
  timestamp: string | null;
  entities: SeriesExportFactEntityRef[];
};

export type SeriesExportJsonTopic = {
  name: string;
  hash: string;
  facts: SeriesExportJsonFact[];
};

export type SeriesExportJsonEntity = SeriesExportEntity & { hash: string };

export type SeriesExportJsonPayload = {
  series: { id: string; title: string; subjectName: string; goal: string };
  contentHash: string;
  topics: SeriesExportJsonTopic[];
  entities: SeriesExportJsonEntity[];
  summaries: Array<{ short: string; date: string }>;
  timeline: SeriesExportTimelineEntry[];
};

/**
 * Maps `SeriesExportData` (always fetched with the full scope for this path
 * — see the route) into the machine-readable shape the Obsidian plugin
 * consumes, with a `stableHash` at three levels so the plugin rewrites only
 * the notes that actually changed:
 *  - per topic, over its `facts` array (order-sensitive — reordering facts
 *    is a real content change, a renamed topic is a different note anyway);
 *  - per entity, over `{ name, kind, detail }` — deliberately excludes `id`,
 *    which is stable identity, not content;
 *  - one `contentHash` over the whole payload.
 *
 * The `contentHash` self-reference problem (a hash that includes itself is
 * impossible to reproduce) is avoided by construction rather than by
 * filtering: `payloadWithoutHash` is built first and never has a
 * `contentHash` key, so hashing it can't observe its own output, and the
 * final object only gains the field afterward. That keeps the hash stable
 * across repeated calls on identical data — the property the incremental
 * sync depends on.
 */
export function buildJsonPayload(seriesId: string, data: SeriesExportData): SeriesExportJsonPayload {
  const topics: SeriesExportJsonTopic[] = data.factsByTopic.map((group) => {
    const facts: SeriesExportJsonFact[] = group.facts.map((f) => ({
      statement: f.statement,
      sessionLabel: f.sessionLabel,
      timestamp: f.timestamp,
      entities: f.entities,
    }));
    return { name: group.topic, hash: stableHash(facts), facts };
  });

  const entities: SeriesExportJsonEntity[] = data.entities.map((e) => ({
    ...e,
    hash: stableHash({ name: e.name, kind: e.kind, detail: e.detail }),
  }));

  const payloadWithoutHash = {
    series: { id: seriesId, title: data.series.title, subjectName: data.series.subjectName, goal: data.series.goal },
    topics,
    entities,
    summaries: data.summaries,
    timeline: data.timeline,
  };

  return { ...payloadWithoutHash, contentHash: stableHash(payloadWithoutHash) };
}
