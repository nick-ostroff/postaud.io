import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock("@/db/service", () => ({
  serviceClient: () => ({ from }),
}));

import { joinWaitlist } from "../join";

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
});

describe("joinWaitlist", () => {
  it("inserts a normalized email into the waitlist table", async () => {
    const result = await joinWaitlist({
      email: "  Nick@Pixelocity.COM ",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("waitlist");
    expect(insert).toHaveBeenCalledWith({ email: "nick@pixelocity.com", source: "hero" });
  });

  it("reports the same success for a duplicate as for a fresh signup", async () => {
    // 23505 = unique_violation. The caller must not be able to tell.
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const result = await joinWaitlist({
      email: "nick@pixelocity.com",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects a malformed email without touching the database", async () => {
    const result = await joinWaitlist({ email: "nope", source: "hero", honeypot: "" });

    expect(result).toEqual({ ok: false, error: "That doesn't look like an email address." });
    expect(insert).not.toHaveBeenCalled();
  });

  it("silently no-ops when the honeypot is filled, but reports success to the bot", async () => {
    const result = await joinWaitlist({
      email: "bot@spam.com",
      source: "hero",
      honeypot: "http://spam.example",
    });

    expect(result).toEqual({ ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("falls back to a null source when the source isn't one we recognize", async () => {
    await joinWaitlist({ email: "nick@pixelocity.com", source: "evil", honeypot: "" });

    expect(insert).toHaveBeenCalledWith({ email: "nick@pixelocity.com", source: null });
  });

  it("surfaces a real database failure", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    const result = await joinWaitlist({
      email: "nick@pixelocity.com",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: false, error: "Something went wrong. Try again in a moment." });
  });
});
