import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mintUserJwt } from "../user-jwt";

const SECRET = "test-jwt-secret";
const USER = "11111111-1111-1111-1111-111111111111";

function decodePayload(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

describe("mintUserJwt", () => {
  it("carries the claims Supabase RLS needs", () => {
    const payload = decodePayload(mintUserJwt(USER, SECRET, 1_000));
    expect(payload.sub).toBe(USER);
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
  });

  it("expires shortly after issue so a leaked token is near-useless", () => {
    const payload = decodePayload(mintUserJwt(USER, SECRET, 1_000, 60));
    expect(payload.iat).toBe(1_000);
    expect(payload.exp).toBe(1_060);
  });

  it("defaults to a 60-second TTL", () => {
    // Pinning the default TTL ensures that a silently widened default (e.g., 3600s)
    // does not enlarge the blast radius of a leaked token. Must explicitly exercise
    // the omitted 4th argument to catch silent changes to DEFAULT_TTL_SEC.
    const payload = decodePayload(mintUserJwt(USER, SECRET, 1_000));
    expect(payload.exp).toBe(1_060);
  });

  it("signs with HS256 over header.payload", () => {
    const jwt = mintUserJwt(USER, SECRET, 1_000);
    const [header, payload, sig] = jwt.split(".");
    const expected = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    expect(sig).toBe(expected);
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("does not verify under the wrong secret", () => {
    const jwt = mintUserJwt(USER, SECRET, 1_000);
    const [header, payload, sig] = jwt.split(".");
    const wrong = createHmac("sha256", "other-secret").update(`${header}.${payload}`).digest("base64url");
    expect(sig).not.toBe(wrong);
  });
});
