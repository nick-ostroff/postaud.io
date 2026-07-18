import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Characterization test for `GET /api/series/[id]/export`, written BEFORE
 * Task 5's refactor (which moves the data assembly into
 * `src/server/export/series-data.ts::buildSeriesExportData`) to pin the
 * route's exact external behavior. It is left in place — unmodified — after
 * the refactor, and its continued, unchanged pass is the proof the refactor
 * didn't change behavior (see `src/server/export/__tests__/series-data.test.ts`
 * for the new module's own unit coverage).
 */

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  getSeries: vi.fn(),
  getSeriesKnowledge: vi.fn(),
  getInterviewMessages: vi.fn(),
  listInterviewsForSeries: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getViewer: mocks.getViewer,
  getSeries: mocks.getSeries,
  getSeriesKnowledge: mocks.getSeriesKnowledge,
  getInterviewMessages: mocks.getInterviewMessages,
  listInterviewsForSeries: mocks.listInterviewsForSeries,
}));

import { GET } from "../route";

const SUPABASE_STUB = {} as never;

const SERIES = { id: "series-1", title: "Dad's Stories", subject_name: "Dad", goal: "Preserve his life story" };

const TOPICS = [
  { id: "topic-childhood", series_id: "series-1", name: "Childhood", position: 0 },
  { id: "topic-career", series_id: "series-1", name: "Career", position: 1 },
];

// Two sessions, returned newest-first the way listInterviewsForSeries does —
// the route/builder must re-sort to Session 1 first.
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

function req(url: string) {
  return new NextRequest(url);
}

function ctx() {
  return { params: Promise.resolve({ id: "series-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({ supabase: SUPABASE_STUB });
  mocks.getSeries.mockResolvedValue(SERIES);
  mocks.getSeriesKnowledge.mockResolvedValue({ topics: TOPICS, facts: FACTS, entities: ENTITIES });
  mocks.listInterviewsForSeries.mockResolvedValue(SESSIONS_NEWEST_FIRST);
  mocks.getInterviewMessages.mockResolvedValue([]);
});

describe("GET /api/series/[id]/export", () => {
  it("404s without leaking existence when the series isn't visible to the caller", async () => {
    mocks.getSeries.mockResolvedValue(null);

    const res = await GET(req("http://localhost:3000/api/series/series-1/export"), ctx());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.getSeriesKnowledge).not.toHaveBeenCalled();
  });

  it("excludes superseded facts", async () => {
    const res = await GET(
      req("http://localhost:3000/api/series/series-1/export?format=md&scope=facts"),
      ctx(),
    );
    const body = await res.text();

    expect(body).not.toContain("An old, retracted statement");
    expect(body).toContain("Grew up in Ohio");
  });

  it("groups facts under their topic name, with an Other group last for topic-less facts", async () => {
    const res = await GET(
      req("http://localhost:3000/api/series/series-1/export?format=md&scope=facts"),
      ctx(),
    );
    const body = await res.text();

    const childhoodIdx = body.indexOf("## Childhood");
    const careerIdx = body.indexOf("## Career");
    const otherIdx = body.indexOf("## Other");

    expect(childhoodIdx).toBeGreaterThan(-1);
    expect(careerIdx).toBeGreaterThan(-1);
    expect(otherIdx).toBeGreaterThan(-1);
    expect(otherIdx).toBeGreaterThan(childhoodIdx);
    expect(otherIdx).toBeGreaterThan(careerIdx);
    expect(body).toContain("Had a dog named Rex");
  });

  it("orders sessions oldest-first in the summary (Session 1 before Session 2)", async () => {
    const res = await GET(
      req("http://localhost:3000/api/series/series-1/export?format=md&scope=summaries"),
      ctx(),
    );
    const body = await res.text();

    const childhoodIdx = body.indexOf("Talked about childhood");
    const firstJobIdx = body.indexOf("Talked about his first job");
    expect(childhoodIdx).toBeGreaterThan(-1);
    expect(firstJobIdx).toBeGreaterThan(-1);
    expect(childhoodIdx).toBeLessThan(firstJobIdx);
  });

  it("omits transcripts unless scope includes them", async () => {
    const withoutScope = await GET(
      req("http://localhost:3000/api/series/series-1/export?format=md&scope=summaries,facts,entities,timeline"),
      ctx(),
    );
    expect(await withoutScope.text()).not.toContain("## Transcripts");
    expect(mocks.getInterviewMessages).not.toHaveBeenCalled();
  });

  it("includes transcripts when scope includes them", async () => {
    mocks.getInterviewMessages.mockImplementation(async (_sb: unknown, interviewId: string) =>
      interviewId === "interview-1"
        ? [{ id: "m1", interview_id: "interview-1", role: "interviewer", text: "Tell me about Ohio.", t_offset_sec: 0, seq: 0, created_at: "2026-01-01T00:00:01Z" }]
        : [],
    );

    const res = await GET(
      req("http://localhost:3000/api/series/series-1/export?format=md&scope=transcripts"),
      ctx(),
    );
    const body = await res.text();

    expect(body).toContain("## Transcripts");
    expect(body).toContain("Tell me about Ohio.");
  });

  it("sets the Content-Disposition filename and content type for markdown vs. text", async () => {
    const md = await GET(req("http://localhost:3000/api/series/series-1/export?format=md"), ctx());
    expect(md.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(md.headers.get("Content-Disposition")).toBe('attachment; filename="dads-stories.md"');

    const txt = await GET(req("http://localhost:3000/api/series/series-1/export?format=txt"), ctx());
    expect(txt.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(txt.headers.get("Content-Disposition")).toBe('attachment; filename="dads-stories.txt"');
  });
});
