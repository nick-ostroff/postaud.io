import { describe, expect, it } from "vitest";
import { resolveImpersonationBanner } from "../auth/impersonation-banner";
import { encodeSession, packStash, type CookiePair, type ImpersonationSession } from "../auth/impersonation";

const session: ImpersonationSession = {
  adminEmail: "admin@example.com",
  targetUserId: "user-1",
  targetEmail: "jane@example.com",
  startedAt: 1_000_000,
};

function stashCookies(): CookiePair[] {
  return packStash([{ name: "sb-x-auth-token", value: "operators-cookie" }]);
}

describe("resolveImpersonationBanner", () => {
  it("returns null when no pa_op_prev stash exists (not impersonating)", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }];
    expect(resolveImpersonationBanner(all, 1_000_000)).toBeNull();
  });

  it("returns the verified session, unexpired, when both stash and a valid pa_op_imp exist", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }, ...stashCookies()];
    expect(resolveImpersonationBanner(all, 1_000_000)).toEqual({ session, expired: false });
  });

  it("flags expiry once MAX_IMPERSONATION_MS has elapsed, while still naming the target", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }, ...stashCookies()];
    const farFuture = session.startedAt + 60 * 60 * 1000 + 1;
    expect(resolveImpersonationBanner(all, farFuture)).toEqual({ session, expired: true });
  });

  // The critical fallback: an HMAC key rotation (or any other cause) makes
  // pa_op_imp fail verification, but the operator's real, still-live session
  // is proven by the pa_op_prev stash. The banner (and its Exit button) must
  // still render, just without claiming a specific identity — never silently
  // vanish and strand the operator with no visible way out.
  it("still shows the banner (session: null) when the stash is present but pa_op_imp is missing", () => {
    const all: CookiePair[] = stashCookies();
    expect(resolveImpersonationBanner(all, 1_000_000)).toEqual({ session: null, expired: false });
  });

  it("still shows the banner (session: null) when the stash is present but pa_op_imp is invalid/unverifiable", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: "garbage.notasignature" }, ...stashCookies()];
    expect(resolveImpersonationBanner(all, 1_000_000)).toEqual({ session: null, expired: false });
  });

  it("treats an empty stash (packStash([]) → truthy [] payload) as no impersonation, matching the exit route's non-empty check", () => {
    const all: CookiePair[] = packStash([]);
    expect(resolveImpersonationBanner(all, 1_000_000)).toBeNull();
  });
});
