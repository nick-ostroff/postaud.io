import { describe, it, expect } from "vitest";
import { pickIntervieweeSeries } from "../select-series";
import type { Series } from "@/db/types";
import type { SeriesSummary } from "@/db/queries";
import { DEFAULT_VOICE } from "@/lib/voices";

function series(overrides: Partial<Series> & Pick<Series, "id">): Series {
  return {
    organization_id: "org-1",
    title: "Untitled",
    subject_kind: "self",
    subject_user_id: "user-1",
    subject_name: "Someone",
    subject_relationship: null,
    goal: "",
    opening_prompt: null,
    dont_bring_up: [],
    tone: "warm",
    session_minutes: 20,
    voice: DEFAULT_VOICE,
    interviewer_name: "Anna",
    depth: "balanced",
    planned_sessions: null,
    photo_path: null,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function summary(lastSessionAt: string | null): SeriesSummary {
  return {
    memoriesCount: 0,
    sessionsCount: 0,
    sessionsThisMonth: 0,
    lastSessionAt,
    meanCoverage: 0,
  };
}

describe("pickIntervieweeSeries", () => {
  it("returns null when there are no candidates", () => {
    expect(pickIntervieweeSeries([], {})).toBeNull();
  });

  it("returns the sole series without consulting summaries", () => {
    const only = series({ id: "a" });
    expect(pickIntervieweeSeries([only], {})).toBe(only);
  });

  it("picks whichever series was interviewed most recently", () => {
    const older = series({ id: "a" });
    const newer = series({ id: "b" });
    const summaries = {
      a: summary("2026-01-01T00:00:00Z"),
      b: summary("2026-02-01T00:00:00Z"),
    };
    expect(pickIntervieweeSeries([older, newer], summaries)?.id).toBe("b");
  });

  it("treats a series with no sessions yet as older than one that's been interviewed", () => {
    const neverInterviewed = series({ id: "a" });
    const interviewed = series({ id: "b" });
    const summaries = { b: summary("2026-01-01T00:00:00Z") };
    expect(pickIntervieweeSeries([neverInterviewed, interviewed], summaries)?.id).toBe("b");
  });
});
