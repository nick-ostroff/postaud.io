import { describe, expect, it } from "vitest";
import { isPushPending } from "@/db/queries/vault";

describe("isPushPending", () => {
  it("is pending when the user pressed Send and the plugin has never acked", () => {
    expect(isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: null })).toBe(true);
  });

  it("is not pending before the user ever pressed Send", () => {
    expect(isPushPending({ push_requested_at: null, last_acked_at: null })).toBe(false);
    expect(isPushPending({ push_requested_at: null, last_acked_at: "2026-07-18T10:00:00Z" })).toBe(false);
  });

  it("is not pending once the plugin acks a later timestamp", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:01Z" }),
    ).toBe(false);
  });

  it("is pending again when the user presses Send after the last ack", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T11:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(true);
  });

  it("treats an ack at the exact request time as collected", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(false);
  });
});
