import { describe, it, expect } from "vitest";
import { buildMobileStory, RECENT_MEMORIES } from "../stories";
import type { Series, Topic } from "@/db/types";
import type { MemoryRow, SeriesAccessRow, SeriesSummary } from "@/db/queries";
import { DEFAULT_VOICE } from "@/lib/voices";

function series(overrides: Partial<Series> & Pick<Series, "id">): Series {
  return {
    organization_id: "org-1",
    title: "Untitled",
    subject_kind: "self",
    subject_user_id: "viewer",
    subject_name: "Someone",
    subject_relationship: null,
    photo_path: null,
    goal: "",
    opening_prompt: null,
    dont_bring_up: [],
    tone: "warm",
    session_minutes: 20,
    voice: DEFAULT_VOICE,
    interviewer_name: "Anna",
    depth: "balanced",
    conversation_mode: "deep",
    ask_mode_each_time: false,
    quickfire_queue_only: false,
    planned_sessions: null,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<SeriesSummary> = {}): SeriesSummary {
  return {
    memoriesCount: 0,
    sessionsCount: 0,
    sessionsThisMonth: 0,
    lastSessionAt: null,
    meanCoverage: 0,
    ...overrides,
  };
}

function topic(overrides: Partial<Topic> & Pick<Topic, "id" | "name">): Topic {
  return {
    series_id: "s",
    position: 0,
    must_cover: true,
    suggested: false,
    coverage_score: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Topic;
}

function memory(id: string, statement: string): MemoryRow {
  return {
    id,
    statement,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    seriesId: "s",
    seriesTitle: "S",
    topicName: null,
    hasPerson: false,
    hasPlace: false,
  };
}

const base = {
  series: series({ id: "s" }),
  summary: summary(),
  topics: [] as Topic[],
  access: [] as SeriesAccessRow[],
  memories: [] as MemoryRow[],
  viewerUserId: "viewer",
};

describe("buildMobileStory", () => {
  it("labels the viewer's own story 'about you'", () => {
    const story = buildMobileStory({
      ...base,
      series: series({ id: "s", subject_kind: "self" }),
    });
    expect(story.subtitle).toBe("about you");
  });

  it("describes someone else's story with name and relationship", () => {
    const story = buildMobileStory({
      ...base,
      series: series({
        id: "s",
        subject_kind: "person",
        subject_user_id: "other-user",
        subject_name: "Marta",
        subject_relationship: "grandmother",
      }),
    });
    expect(story.subtitle).toBe("about Marta · grandmother");
  });

  it("marks a story with no subject account as a handoff", () => {
    const own = buildMobileStory({ ...base, series: series({ id: "s", subject_user_id: "viewer" }) });
    const handoff = buildMobileStory({ ...base, series: series({ id: "s", subject_user_id: null }) });
    expect(own.handoff).toBe(false);
    expect(handoff.handoff).toBe(true);
  });

  it("takes only the most recent memories, in order, as statements", () => {
    const story = buildMobileStory({
      ...base,
      memories: [memory("1", "newest"), memory("2", "middle"), memory("3", "oldest")],
    });
    expect(story.recentMemories).toEqual(["newest", "middle"].slice(0, RECENT_MEMORIES));
    expect(story.recentMemories.length).toBeLessThanOrEqual(RECENT_MEMORIES);
  });

  it("counts everyone but the owner as shared, never below zero", () => {
    const owner: SeriesAccessRow = { userId: "viewer", name: "Me", email: "", avatarPath: null, badge: "owner" };
    const guest: SeriesAccessRow = { userId: "g", name: "Guest", email: "", avatarPath: null, badge: "can_view" };
    expect(buildMobileStory({ ...base, access: [owner, guest] }).sharedCount).toBe(1);
    expect(buildMobileStory({ ...base, access: [] }).sharedCount).toBe(0);
  });

  it("rounds mean coverage to a whole percent", () => {
    const story = buildMobileStory({ ...base, summary: summary({ meanCoverage: 0.264 }) });
    expect(story.coveragePct).toBe(26);
  });

  it("surfaces the least-covered must-cover topic as the next one", () => {
    const story = buildMobileStory({
      ...base,
      topics: [
        topic({ id: "a", name: "Childhood", coverage_score: 0.8 }),
        topic({ id: "b", name: "Career", coverage_score: 0.1 }),
      ],
    });
    expect(story.nextTopic).toBe("Career");
  });
});
