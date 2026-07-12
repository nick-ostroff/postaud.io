import { describe, it, expect } from "vitest";
import { firstNameOf } from "../names";

describe("firstNameOf", () => {
  it("returns the first token of a full display name", () => {
    expect(firstNameOf("Sam Ostroff")).toBe("Sam");
  });

  it("returns the name as-is when it's a single token", () => {
    expect(firstNameOf("Anna")).toBe("Anna");
  });

  it("uses the local part of an email address", () => {
    expect(firstNameOf("sam@example.com")).toBe("sam");
  });

  it("returns null for null, undefined, or blank input", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});
