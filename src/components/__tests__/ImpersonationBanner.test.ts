import { describe, expect, it } from "vitest";
import { bannerCopy } from "../ImpersonationBanner";
import type { ImpersonationSession } from "@/lib/auth/impersonation";

const session: ImpersonationSession = {
  adminEmail: "admin@example.com",
  targetUserId: "user-1",
  targetEmail: "jane@example.com",
  startedAt: Date.now(),
};

describe("bannerCopy", () => {
  it("names the target when the session is verified and active", () => {
    expect(bannerCopy(session, false)).toEqual({ kind: "active", email: "jane@example.com" });
  });

  it("flags expiry while still naming the target", () => {
    expect(bannerCopy(session, true)).toEqual({ kind: "expired", email: "jane@example.com" });
  });

  // AppLayout only mounts <ImpersonationBanner> when a pa_op_prev stash
  // proves impersonation is live (see resolveImpersonationBanner), even if
  // pa_op_imp itself failed verification — e.g. after a service-role key
  // rotation. In that case session is null here, and this must still return
  // a renderable, non-empty copy variant rather than nothing — the component
  // always renders the Exit button regardless of `kind`, so the escape hatch
  // stays visible.
  it("falls back to generic, identity-free copy when the session is unverifiable", () => {
    expect(bannerCopy(null, false)).toEqual({ kind: "unverified" });
  });

  it("ignores the expired flag when there is no verified session to be expired", () => {
    expect(bannerCopy(null, true)).toEqual({ kind: "unverified" });
  });
});
