import { describe, it, expect } from "vitest";
import {
  pickLowestCoverageMustCoverTopic,
  pickNewestSuggestedTopic,
  pickPersonalPromptTopic,
} from "../pick";
import type { Topic } from "@/db/types";

function topic(overrides: Partial<Topic> & Pick<Topic, "id" | "name">): Topic {
  return {
    series_id: "series-1",
    description: null,
    coverage_score: 0,
    must_cover: false,
    suggested: false,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("pickLowestCoverageMustCoverTopic", () => {
  it("returns the must-cover topic with the lowest coverage score", () => {
    const topics = [
      topic({ id: "a", name: "Childhood", must_cover: true, coverage_score: 0.6 }),
      topic({ id: "b", name: "The bakery years", must_cover: true, coverage_score: 0.2 }),
      topic({ id: "c", name: "Wedding", must_cover: true, coverage_score: 0.4 }),
    ];
    expect(pickLowestCoverageMustCoverTopic(topics)?.id).toBe("b");
  });

  it("ignores suggested topics even if their coverage is lower", () => {
    const topics = [
      topic({ id: "a", name: "Childhood", must_cover: true, coverage_score: 0.5 }),
      topic({ id: "b", name: "AI idea", must_cover: true, suggested: true, coverage_score: 0 }),
    ];
    expect(pickLowestCoverageMustCoverTopic(topics)?.id).toBe("a");
  });

  it("returns null when there are no must-cover topics", () => {
    const topics = [topic({ id: "a", name: "Optional", must_cover: false })];
    expect(pickLowestCoverageMustCoverTopic(topics)).toBeNull();
  });
});

describe("pickNewestSuggestedTopic", () => {
  it("returns the most recently created suggested topic", () => {
    const topics = [
      topic({ id: "a", name: "Older idea", suggested: true, created_at: "2026-01-01T00:00:00Z" }),
      topic({ id: "b", name: "Newer idea", suggested: true, created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(pickNewestSuggestedTopic(topics)?.id).toBe("b");
  });

  it("returns null when nothing is suggested", () => {
    expect(pickNewestSuggestedTopic([topic({ id: "a", name: "Queued", suggested: false })])).toBeNull();
  });
});

describe("pickPersonalPromptTopic", () => {
  it("prefers the lowest-coverage must-cover topic over any suggestion", () => {
    const topics = [
      topic({ id: "a", name: "Must cover", must_cover: true, coverage_score: 0.3 }),
      topic({ id: "b", name: "Suggested", suggested: true, created_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(pickPersonalPromptTopic(topics)?.id).toBe("a");
  });

  it("falls back to the newest suggested topic when nothing is must-cover", () => {
    const topics = [
      topic({ id: "a", name: "Old suggestion", suggested: true, created_at: "2026-01-01T00:00:00Z" }),
      topic({ id: "b", name: "New suggestion", suggested: true, created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(pickPersonalPromptTopic(topics)?.id).toBe("b");
  });

  it("returns null when there is nothing to anchor a prompt to", () => {
    expect(pickPersonalPromptTopic([])).toBeNull();
  });
});
