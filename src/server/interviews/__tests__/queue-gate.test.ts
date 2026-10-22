import { describe, it, expect } from "vitest";
import { flowNeedsQueuedQuestion } from "../queue-gate";

describe("flowNeedsQueuedQuestion", () => {
  it("blocks a new Flow session when the queue is empty", () => {
    expect(flowNeedsQueuedQuestion({ mode: "flow", queuedCount: 0, hasResumable: false })).toBe(true);
  });

  it("allows Flow once at least one question is queued", () => {
    expect(flowNeedsQueuedQuestion({ mode: "flow", queuedCount: 1, hasResumable: false })).toBe(false);
  });

  it("never blocks resuming an in-progress session (the opener may already be consumed)", () => {
    expect(flowNeedsQueuedQuestion({ mode: "flow", queuedCount: 0, hasResumable: true })).toBe(false);
  });

  it("treats legacy deep rows as Flow", () => {
    expect(flowNeedsQueuedQuestion({ mode: "deep", queuedCount: 0, hasResumable: false })).toBe(true);
  });

  it("leaves quickfire and ritual alone — they have their own empty-queue behaviour", () => {
    expect(flowNeedsQueuedQuestion({ mode: "quickfire", queuedCount: 0, hasResumable: false })).toBe(false);
    expect(flowNeedsQueuedQuestion({ mode: "ritual", queuedCount: 0, hasResumable: false })).toBe(false);
  });
});
