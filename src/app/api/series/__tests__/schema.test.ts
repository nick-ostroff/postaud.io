import { it, expect } from "vitest";
import { createSeriesSchema } from "../route";

const valid = {
  title: "Dad's Story",
  goal: "Capture his whole life",
  subjectKind: "self" as const,
  subjectName: "Henk",
  mustCover: [],
  dontBringUp: [],
  tone: "warm" as const,
  sessionMinutes: 20 as const,
  access: [],
};

it("defaults voice, name, and depth so old clients keep working", () => {
  const parsed = createSeriesSchema.parse(valid);
  expect(parsed.voice).toBe("marin");
  expect(parsed.interviewerName).toBe("Anna");
  expect(parsed.depth).toBe("balanced");
  expect(parsed.plannedSessions).toBeNull();
});

it("accepts a known voice and depth", () => {
  const parsed = createSeriesSchema.parse({ ...valid, voice: "cedar", depth: "deep", plannedSessions: 6 });
  expect(parsed.voice).toBe("cedar");
  expect(parsed.depth).toBe("deep");
  expect(parsed.plannedSessions).toBe(6);
});

it("rejects an unknown voice", () => {
  expect(createSeriesSchema.safeParse({ ...valid, voice: "scarlett" }).success).toBe(false);
});

it("rejects an out-of-range planned session count", () => {
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 0 }).success).toBe(false);
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 51 }).success).toBe(false);
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 2.5 }).success).toBe(false);
});

it("treats a null planned session count as open-ended", () => {
  expect(createSeriesSchema.parse({ ...valid, plannedSessions: null }).plannedSessions).toBeNull();
});
