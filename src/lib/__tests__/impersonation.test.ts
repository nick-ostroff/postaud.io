import { describe, expect, it } from "vitest";
import {
  collectAuthCookies,
  encodeSession,
  isExpired,
  MAX_IMPERSONATION_MS,
  packStash,
  prevChunkNames,
  readImpersonation,
  unpackStash,
  type CookiePair,
  type ImpersonationSession,
} from "../auth/impersonation";

describe("collectAuthCookies", () => {
  it("picks up unchunked and chunked supabase auth cookies, ignoring others", () => {
    const all: CookiePair[] = [
      { name: "sb-abcdef-auth-token", value: "a" },
      { name: "sb-abcdef-auth-token.0", value: "b" },
      { name: "sb-abcdef-auth-token.1", value: "c" },
      { name: "sb-abcdef-auth-token-code-verifier", value: "nope" },
      { name: "pa_op_imp", value: "nope" },
      { name: "theme", value: "dark" },
    ];
    expect(collectAuthCookies(all).map((c) => c.name)).toEqual([
      "sb-abcdef-auth-token",
      "sb-abcdef-auth-token.0",
      "sb-abcdef-auth-token.1",
    ]);
  });

  it("returns empty when there is no supabase session", () => {
    expect(collectAuthCookies([{ name: "theme", value: "dark" }])).toEqual([]);
  });
});

describe("packStash / unpackStash", () => {
  it("round-trips a small payload in a single chunk", () => {
    const pairs: CookiePair[] = [{ name: "sb-x-auth-token", value: "short" }];
    const packed = packStash(pairs);
    expect(packed).toHaveLength(1);
    expect(packed[0].name).toBe("pa_op_prev.0");
    expect(unpackStash(packed)).toEqual(pairs);
  });

  it("round-trips a large payload across multiple chunks", () => {
    // A realistic Supabase session easily exceeds one 4KB cookie.
    const pairs: CookiePair[] = [
      { name: "sb-x-auth-token.0", value: "A".repeat(4000) },
      { name: "sb-x-auth-token.1", value: "B".repeat(4000) },
    ];
    const packed = packStash(pairs);
    expect(packed.length).toBeGreaterThan(1);
    for (const c of packed) expect(c.value.length).toBeLessThanOrEqual(3500);
    expect(unpackStash(packed)).toEqual(pairs);
  });

  it("reassembles chunks in index order even when cookies arrive shuffled", () => {
    const pairs: CookiePair[] = [{ name: "sb-x-auth-token", value: "C".repeat(9000) }];
    const packed = packStash(pairs);
    expect(unpackStash([...packed].reverse())).toEqual(pairs);
  });

  it("returns null when no stash cookies are present", () => {
    expect(unpackStash([{ name: "theme", value: "dark" }])).toBeNull();
  });

  it("returns null when the stash is malformed", () => {
    expect(unpackStash([{ name: "pa_op_prev.0", value: "!!!not-base64!!!" }])).toBeNull();
  });
});

describe("prevChunkNames", () => {
  it("lists every stash cookie name so the caller can clear them all", () => {
    const all: CookiePair[] = [
      { name: "pa_op_prev.0", value: "x" },
      { name: "pa_op_prev.1", value: "y" },
      { name: "theme", value: "dark" },
    ];
    expect(prevChunkNames(all)).toEqual(["pa_op_prev.0", "pa_op_prev.1"]);
  });
});

describe("readImpersonation", () => {
  const session: ImpersonationSession = {
    adminEmail: "nick@pixelocity.com",
    targetUserId: "11111111-1111-1111-1111-111111111111",
    targetEmail: "jane@example.com",
    startedAt: 1_700_000_000_000,
  };

  it("round-trips an encoded session", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }];
    expect(readImpersonation(all)).toEqual(session);
  });

  it("returns null when absent", () => {
    expect(readImpersonation([{ name: "theme", value: "dark" }])).toBeNull();
  });

  it("returns null when malformed", () => {
    expect(readImpersonation([{ name: "pa_op_imp", value: "garbage" }])).toBeNull();
  });

  it("returns null when fields are missing", () => {
    const value = Buffer.from(JSON.stringify({ adminEmail: "a@b.c" })).toString("base64url");
    expect(readImpersonation([{ name: "pa_op_imp", value }])).toBeNull();
  });

  it("still returns an expired session so the operator can exit", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }];
    const read = readImpersonation(all);
    expect(read).not.toBeNull();
    expect(isExpired(read!, session.startedAt + MAX_IMPERSONATION_MS + 1)).toBe(true);
    expect(isExpired(read!, session.startedAt + 1000)).toBe(false);
  });
});
