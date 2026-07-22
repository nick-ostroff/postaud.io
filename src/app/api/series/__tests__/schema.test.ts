import { it, expect } from "vitest";
import { createSeriesSchema } from "../route";
import { DEFAULT_VOICE } from "@/lib/voices";

const valid = {
  title: "Dad's Story",
  goal: "Capture his whole life",
  subjectKind: "self" as const,
  subjectName: "Henk",
  mustCover: [],
  dontBringUp: [],
  access: [],
};

it("defaults voice, mode, length, and sessions so minimal clients keep working", () => {
  const parsed = createSeriesSchema.parse(valid);
  expect(parsed.voice).toBe(DEFAULT_VOICE);
  expect(parsed.conversationMode).toBe("flow");
  expect(parsed.totalMinutes).toBeNull();
  expect(parsed.plannedSessions).toBeNull();
});

it("accepts quickfire as the conversation type", () => {
  const parsed = createSeriesSchema.parse({ ...valid, conversationMode: "quickfire" });
  expect(parsed.conversationMode).toBe("quickfire");
});

it("rejects the retired deep mode", () => {
  expect(createSeriesSchema.safeParse({ ...valid, conversationMode: "deep" }).success).toBe(false);
});

it("accepts a known voice, a total length, and a session count", () => {
  const parsed = createSeriesSchema.parse({ ...valid, voice: "cedar", totalMinutes: 45, plannedSessions: 6 });
  expect(parsed.voice).toBe("cedar");
  expect(parsed.totalMinutes).toBe(45);
  expect(parsed.plannedSessions).toBe(6);
});

it("treats a null total length as unlimited and rejects off-menu values", () => {
  expect(createSeriesSchema.parse({ ...valid, totalMinutes: null }).totalMinutes).toBeNull();
  expect(createSeriesSchema.safeParse({ ...valid, totalMinutes: 30 }).success).toBe(false);
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
