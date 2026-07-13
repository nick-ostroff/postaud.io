"use client";

import { useState } from "react";
import type { ImpersonationSession } from "@/lib/auth/impersonation";

export type BannerCopy =
  | { kind: "active"; email: string }
  | { kind: "expired"; email: string }
  // pa_op_imp missing/malformed/unverifiable (e.g. after a service-role key
  // rotation) but a pa_op_prev stash proves impersonation is still live —
  // don't claim an identity we can't prove.
  | { kind: "unverified" };

/**
 * Pure copy decision, split out from the component so it's unit-testable
 * without a DOM. `session` is null whenever `pa_op_imp` fails verification —
 * the caller (AppLayout) only mounts this component when a `pa_op_prev`
 * stash independently proves an impersonation is in progress, so this must
 * still produce a renderable, non-empty banner in that case.
 */
export function bannerCopy(session: ImpersonationSession | null, expired: boolean): BannerCopy {
  if (!session) return { kind: "unverified" };
  return expired ? { kind: "expired", email: session.targetEmail } : { kind: "active", email: session.targetEmail };
}

export function ImpersonationBanner({
  session,
  expired,
}: {
  session: ImpersonationSession | null;
  expired: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const copy = bannerCopy(session, expired);

  async function exit() {
    setLeaving(true);
    try {
      const res = await fetch("/api/super/impersonate/exit", { method: "POST" });
      const json = await res.json();
      // Full reload — the auth cookies just changed back to the operator's,
      // and the router's cached server payloads still belong to the
      // impersonated user. A client nav would render their stale data.
      window.location.href = json.redirect ?? "/super";
    } catch {
      window.location.href = "/sign-in";
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 bg-amber-100 px-6 py-2.5 text-[13px] text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
      <span aria-hidden>⚠</span>
      <span>
        {copy.kind === "expired" && (
          <>
            Operator session expired — you are still signed in as{" "}
            <b className="font-semibold">{copy.email}</b>.
          </>
        )}
        {copy.kind === "active" && (
          <>
            Operator session — you are viewing as <b className="font-semibold">{copy.email}</b>.
          </>
        )}
        {copy.kind === "unverified" && <>Operator session — you are signed in as another user.</>}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="ml-auto rounded-md border border-amber-950/30 px-2.5 py-1 font-semibold hover:bg-amber-950/10 disabled:opacity-60 dark:border-amber-100/40 dark:hover:bg-amber-100/10"
      >
        {leaving ? "Exiting…" : "Exit →"}
      </button>
    </div>
  );
}
