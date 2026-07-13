import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../validate";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  nick@pixelocity.com  ")).toBe("nick@pixelocity.com");
  });

  it("lowercases so casing can't create a duplicate person", () => {
    expect(normalizeEmail("Nick@Pixelocity.COM")).toBe("nick@pixelocity.com");
  });

  it("rejects a string that isn't an email", () => {
    expect(normalizeEmail("nick")).toBeNull();
    expect(normalizeEmail("nick@")).toBeNull();
    expect(normalizeEmail("@pixelocity.com")).toBeNull();
    expect(normalizeEmail("nick @pixelocity.com")).toBeNull();
  });

  it("rejects empty and non-string input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
