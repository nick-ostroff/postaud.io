import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSeries: vi.fn(),
  getSeriesKnowledge: vi.fn(),
  getInterviewMessages: vi.fn(),
  listInterviewsForSeries: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getSeries: mocks.getSeries,
  getSeriesKnowledge: mocks.getSeriesKnowledge,
  getInterviewMessages: mocks.getInterviewMessages,
  listInterviewsForSeries: mocks.listInterviewsForSeries,
}));

import { buildSeriesExportData } from "../series-data";
import type { SeriesExportScope } from "../markdown";

const SUPABASE_STUB = {} as never;

const SERIES = { id: "series-1", title: "Dad's Stories", subject_name: "Dad", goal: "Preserve his life story" };

const TOPICS = [
  { id: "topic-childhood", series_id: "series-1", name: "Childhood", position: 0 },
  { id: "topic-career", series_id: "series-1", name: "Career", position: 1 },
];

// Newest-first, the way listInterviewsForSeries actually returns them —
// buildSeriesExportData must re-sort to Session 1 first.
const SESSIONS_NEWEST_FIRST = [
  {
    id: "interview-2",
    sessionNumber: 2,
    startedAt: "2026-02-01T00:00:00Z",
    endedAt: "2026-02-01T01:00:00Z",
    durationSec: 3600,
    memoriesAdded: 1,
    summaryShort: "Talked about his first job",
    processError: null,
  },
  {
    id: "interview-1",
    sessionNumber: 1,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T01:00:00Z",
    durationSec: 3600,
    memoriesAdded: 2,
    summaryShort: "Talked about childhood",
    processError: null,
  },
];

const FACTS = [
  {
    id: "fact-1",
    series_id: "series-1",
    topic_id: "topic-childhood",
    source_interview_id: "interview-1",
    source_message_id: null,
    audio_offset_sec: 65,
    statement: "Grew up in Ohio",
    confidence: 0.9,
    status: "active",
    superseded_by: null,
    created_at: "2026-01-01T00:10:00Z",
    updated_at: "2026-01-01T00:10:00Z",
    entities: [{ id: "entity-date-1", series_id: "series-1", kind: "date", name: "1955", detail: null }],
  },
  {
    id: "fact-2",
    series_id: "series-1",
    topic_id: "topic-career",
    source_interview_id: "interview-2",
    source_message_id: null,
    audio_offset_sec: null,
    statement: "Started at the mill",
    confidence: 0.9,
    status: "active",
    superseded_by: null,
    created_at: "2026-02-01T00:10:00Z",
    updated_at: "2026-02-01T00:10:00Z",
    entities: [],
  },
  {
    id: "fact-3",
    series_id: "series-1",
    topic_id: null,
    source_interview_id: "interview-1",
    source_message_id: null,
    audio_offset_sec: null,
    statement: "Had a dog named Rex",
    confidence: 0.9,
    status: "active",
    superseded_by: null,
    created_at: "2026-01-01T00:20:00Z",
    updated_at: "2026-01-01T00:20:00Z",
    entities: [],
  },
  {
    id: "fact-4",
    series_id: "series-1",
    topic_id: "topic-childhood",
    source_interview_id: "interview-1",
    source_message_id: null,
    audio_offset_sec: null,
    statement: "An old, retracted statement",
    confidence: 0.9,
    status: "superseded",
    superseded_by: "fact-1",
    created_at: "2026-01-01T00:05:00Z",
    updated_at: "2026-01-01T00:05:00Z",
    entities: [],
  },
];

const ENTITIES = [
  { id: "entity-mom", series_id: "series-1", kind: "person", name: "Mom", detail: "His mother" },
  { id: "entity-place", series_id: "series-1", kind: "place", name: "Ohio", detail: null },
  { id: "entity-date-1", series_id: "series-1", kind: "date", name: "1955", detail: null },
];

const FULL_SCOPE: SeriesExportScope = {
  summaries: true,
  facts: true,
  entities: true,
  timeline: true,
  transcripts: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSeries.mockResolvedValue(SERIES);
  mocks.getSeriesKnowledge.mockResolvedValue({ topics: TOPICS, facts: FACTS, entities: ENTITIES });
  mocks.listInterviewsForSeries.mockResolvedValue(SESSIONS_NEWEST_FIRST);
  mocks.getInterviewMessages.mockResolvedValue([]);
});

describe("buildSeriesExportData", () => {
  it("returns null for a series invisible to the caller", async () => {
    mocks.getSeries.mockResolvedValue(null);

    const data = await buildSeriesExportData(SUPABASE_STUB, "series-1", FULL_SCOPE);

    expect(data).toBeNull();
    expect(mocks.getSeriesKnowledge).not.toHaveBeenCalled();
  });

  it("excludes superseded facts", async () => {
    const data = await buildSeriesExportData(SUPABASE_STUB, "series-1", FULL_SCOPE);

    const statements = data!.factsByTopic.flatMap((g) => g.facts.map((f) => f.statement));
    expect(statements).not.toContain("An old, retracted statement");
    expect(statements).toContain("Grew up in Ohio");
  });

  it("groups facts under their topic name and puts topic-less facts in an Other group, placed last", async () => {
    const data = await buildSeriesExportData(SUPABASE_STUB, "series-1", FULL_SCOPE);

    expect(data!.factsByTopic.map((g) => g.topic)).toEqual(["Childhood", "Career", "Other"]);
    expect(data!.factsByTopic.at(-1)!.facts.map((f) => f.statement)).toEqual(["Had a dog named Rex"]);
  });

  it("orders sessions oldest-first (Session 1 before Session 2)", async () => {
    const data = await buildSeriesExportData(SUPABASE_STUB, "series-1", FULL_SCOPE);

    expect(data!.summaries.map((s) => s.short)).toEqual([
      "Talked about childhood",
      "Talked about his first job",
    ]);
  });

  it("omits transcripts unless scope.transcripts is true", async () => {
    const withoutTranscripts = await buildSeriesExportData(SUPABASE_STUB, "series-1", FULL_SCOPE);
    expect(withoutTranscripts!.transcripts).toBeUndefined();
    expect(mocks.getInterviewMessages).not.toHaveBeenCalled();

    mocks.getInterviewMessages.mockImplementation(async (_sb: unknown, interviewId: string) =>
      interviewId === "interview-1"
        ? [
            {
              id: "m1",
              interview_id: "interview-1",
              role: "interviewer",
              text: "Tell me about Ohio.",
              t_offset_sec: 0,
              seq: 0,
              created_at: "2026-01-01T00:00:01Z",
            },
          ]
        : [],
    );

    const withTranscripts = await buildSeriesExportData(SUPABASE_STUB, "series-1", {
      ...FULL_SCOPE,
      transcripts: true,
    });

    expect(withTranscripts!.transcripts).toEqual([
      { sessionLabel: "Session 1", turns: [{ role: "Anna", text: "Tell me about Ohio." }] },
    ]);
  });
});
