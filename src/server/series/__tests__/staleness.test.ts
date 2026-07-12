import { describe, expect, it } from "vitest";
import { staleness } from "../staleness";

describe("staleness", () => {
  it("labels a series with no sessions yet as not stale", () => {
    const result = staleness(null, new Date("2026-07-11T12:00:00Z"));
    expect(result).toEqual({ stale: false, label: "no sessions yet" });
  });

  it("labels a session from today as fresh", () => {
    const now = new Date("2026-07-11T18:00:00Z");
    const lastSessionAt = new Date("2026-07-11T09:00:00Z");
    const result = staleness(lastSessionAt, now);
    expect(result).toEqual({ stale: false, label: "last session today" });
  });

  it("labels yesterday's session as fresh with the singular relative label", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastSessionAt = new Date("2026-07-10T12:00:00Z");
    const result = staleness(lastSessionAt, now);
    expect(result).toEqual({ stale: false, label: "last session yesterday" });
  });

  it("labels a session several days ago as fresh with an N days ago label", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastSessionAt = new Date("2026-07-06T12:00:00Z"); // 5 days ago
    const result = staleness(lastSessionAt, now);
    expect(result).toEqual({ stale: false, label: "last session 5 days ago" });
  });

  it("is still fresh at exactly 13 days (just under the boundary)", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastSessionAt = new Date("2026-06-28T12:00:00Z"); // 13 days ago
    const result = staleness(lastSessionAt, now);
    expect(result.stale).toBe(false);
    expect(result.label).toBe("last session 13 days ago");
  });

  it("crosses into stale at exactly 14 days (the boundary)", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastSessionAt = new Date("2026-06-27T12:00:00Z"); // 14 days ago
    const result = staleness(lastSessionAt, now);
    expect(result).toEqual({ stale: true, label: "going stale — interview soon" });
  });

  it("stays stale well past the boundary", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastSessionAt = new Date("2026-06-01T12:00:00Z"); // 40 days ago
    const result = staleness(lastSessionAt, now);
    expect(result).toEqual({ stale: true, label: "going stale — interview soon" });
  });
});
