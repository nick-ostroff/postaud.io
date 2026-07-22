import { describe, it, expect } from "vitest";
import { groupMemoriesBySession } from "../groupMemories";
import type { SeriesKnowledge, SessionRow } from "@/db/queries";

type FactRow = SeriesKnowledge["facts"][number];

function fact(overrides: Partial<FactRow> & Pick<FactRow, "id">): FactRow {
  return {
    series_id: "series-1",
    topic_id: null,
    source_interview_id: null,
    source_message_id: null,
    audio_offset_sec: null,
    statement: "Something remembered",
    confidence: 1,
    status: "confirmed",
    superseded_by: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    entities: [],
    ...overrides,
  } as FactRow;
}

function session(overrides: Partial<SessionRow> & Pick<SessionRow, "id" | "sessionNumber">): SessionRow {
  return {
    startedAt: "2026-07-01T00:00:00Z",
    endedAt: null,
    durationSec: null,
    memoriesAdded: 0,
    summaryShort: null,
    processError: null,
    ...overrides,
  };
}

describe("groupMemoriesBySession", () => {
  it("groups facts under their session, newest session first", () => {
    const sessions = [
      session({ id: "int-1", sessionNumber: 1, startedAt: "2026-07-01T00:00:00Z" }),
      session({ id: "int-2", sessionNumber: 2, startedAt: "2026-07-10T00:00:00Z" }),
    ];
    const facts = [
      fact({ id: "f3", source_interview_id: "int-2" }),
      fact({ id: "f2", source_interview_id: "int-1" }),
      fact({ id: "f1", source_interview_id: "int-1" }),
    ];

    const groups = groupMemoriesBySession(facts, sessions);

    expect(groups.map((g) => g.label)).toEqual(["Session 2", "Session 1"]);
    expect(groups[0].facts.map((f) => f.id)).toEqual(["f3"]);
    expect(groups[1].facts.map((f) => f.id)).toEqual(["f2", "f1"].reverse());
  });

  it("flips newest-first input to oldest-first within a session", () => {
    const sessions = [session({ id: "int-1", sessionNumber: 1 })];
    const facts = [
      fact({ id: "newest", source_interview_id: "int-1", created_at: "2026-07-02T00:00:00Z" }),
      fact({ id: "oldest", source_interview_id: "int-1", created_at: "2026-07-01T00:00:00Z" }),
    ];

    const groups = groupMemoriesBySession(facts, sessions);
    expect(groups[0].facts.map((f) => f.id)).toEqual(["oldest", "newest"]);
  });

  it("puts facts with no matching session in a trailing Earlier group", () => {
    const sessions = [session({ id: "int-1", sessionNumber: 1 })];
    const facts = [
      fact({ id: "orphan", source_interview_id: "int-gone" }),
      fact({ id: "loose" }),
      fact({ id: "f1", source_interview_id: "int-1" }),
    ];

    const groups = groupMemoriesBySession(facts, sessions);

    expect(groups.map((g) => g.label)).toEqual(["Session 1", "Earlier"]);
    expect(groups[1].facts.map((f) => f.id)).toEqual(["loose", "orphan"]);
    expect(groups[1].startedAt).toBeNull();
  });

  it("returns no groups for no facts", () => {
    expect(groupMemoriesBySession([], [session({ id: "int-1", sessionNumber: 1 })])).toEqual([]);
  });

  it("carries the session start date onto the group", () => {
    const sessions = [session({ id: "int-1", sessionNumber: 1, startedAt: "2026-06-15T12:00:00Z" })];
    const groups = groupMemoriesBySession([fact({ id: "f1", source_interview_id: "int-1" })], sessions);
    expect(groups[0].startedAt).toBe("2026-06-15T12:00:00Z");
  });
});
