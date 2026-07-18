import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken, looksLikeApiToken, TOKEN_PREFIX } from "../api-token";

describe("generateApiToken", () => {
  it("is prefixed and long enough to resist guessing", () => {
    const token = generateApiToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateApiToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashApiToken", () => {
  it("is sha-256 of the raw token", () => {
    expect(hashApiToken("pat_abc")).toBe(createHash("sha256").update("pat_abc").digest("hex"));
  });

  it("is stable and distinguishes different tokens", () => {
    expect(hashApiToken("pat_abc")).toBe(hashApiToken("pat_abc"));
    expect(hashApiToken("pat_abc")).not.toBe(hashApiToken("pat_abd"));
  });
});

describe("looksLikeApiToken", () => {
  it("accepts a generated token", () => {
    expect(looksLikeApiToken(generateApiToken())).toBe(true);
  });

  it("rejects junk, so we skip the DB round-trip on obvious garbage", () => {
    expect(looksLikeApiToken("")).toBe(false);
    expect(looksLikeApiToken("Bearer")).toBe(false);
    expect(looksLikeApiToken("pat_short")).toBe(false);
    expect(looksLikeApiToken("eyJhbGciOiJIUzI1NiJ9.x.y")).toBe(false);
  });
});
