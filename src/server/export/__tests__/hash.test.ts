import { describe, expect, it } from "vitest";
import { stableHash } from "../hash";

describe("stableHash", () => {
  it("is stable across calls", () => {
    expect(stableHash({ a: 1, b: [2, 3] })).toBe(stableHash({ a: 1, b: [2, 3] }));
  });

  it("ignores key order, so an unrelated reshuffle does not trigger a rewrite", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it("changes when content changes", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("respects array order, which is meaningful for facts", () => {
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  it("is short enough to store per-note", () => {
    expect(stableHash({ a: 1 })).toHaveLength(16);
  });
});
