import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

/**
 * Typed completion failure the route maps to an HTTP status.
 * - `not_found` (404): no such interview / not this org's.
 * - `conflict` (409): the interview is in a terminal-but-not-completed state
 *   (e.g. `abandoned`) that we won't silently turn into a completion.
 */
export class CompleteInterviewError extends Error {
  code: "not_found" | "conflict";
  status: number;
  constructor(code: CompleteInterviewError["code"], message: string, status: number) {
    super(message);
    this.name = "CompleteInterviewError";
    this.code = code;
    this.status = status;
  }
}

export type CompleteInterviewResult = {
  recapUrl: string;
  /** True when the interview was already completed before this call did nothing. */
  alreadyCompleted: boolean;
};

const recapUrlFor = (interviewId: string) => `/app/interviews/${interviewId}/recap`;

/**
 * The single exit path for an in-progress interview. Because a partial unique
 * index (0007) allows only one `in_progress` interview per conductor+series, a
 * session that never completes permanently blocks new ones — so this must be
 * safe to call repeatedly (the client retries the end flow) and must decrement
 * the org's credit balance exactly once.
 *
 * Idempotency is layered:
 *  - The status flip is guarded on `status = 'in_progress'`, so a concurrent /
 *    repeated call that finds the row already completed just returns the recap
 *    URL without touching anything.
 *  - The credit charge is guarded on `credit_charged = false` flipping to true
 *    in the same statement that gates it; only the caller that actually flips
 *    the flag decrements `organizations.credits_remaining`.
 *
 * Callers must already have verified the caller can interview this series
 * (route-level 403). Pass the service client — it writes across `interviews`
 * and `organizations` after that check.
 */
export async function completeInterview(
  supabase: SupabaseClient<Database>,
  args: { interviewId: string; durationSec: number },
): Promise<CompleteInterviewResult> {
  const { interviewId, durationSec } = args;

  const { data: interview, error: loadErr } = await supabase
    .from("interviews")
    .select("id, status, organization_id, credit_charged")
    .eq("id", interviewId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!interview) {
    throw new CompleteInterviewError("not_found", "Interview not found.", 404);
  }

  // Already finished — idempotent no-op, hand back the recap URL.
  if (interview.status === "completed" || interview.status === "processed") {
    return { recapUrl: recapUrlFor(interviewId), alreadyCompleted: true };
  }
  // Any other non-in_progress state (e.g. abandoned) is not something we
  // convert into a completion.
  if (interview.status !== "in_progress") {
    throw new CompleteInterviewError("conflict", "Interview is not in progress.", 409);
  }

  // Flip to completed, guarded on the current in_progress state so a concurrent
  // completer can't both win. If we matched nothing, someone else just
  // completed it — treat as already-done.
  const { data: flipped, error: flipErr } = await supabase
    .from("interviews")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      duration_sec: Math.max(0, Math.round(durationSec)),
    })
    .eq("id", interviewId)
    .eq("status", "in_progress")
    .select("id");
  if (flipErr) throw new Error(flipErr.message);
  if (!flipped || flipped.length === 0) {
    return { recapUrl: recapUrlFor(interviewId), alreadyCompleted: true };
  }

  // Charge exactly one credit: the credit_charged=false→true flip is the guard.
  // Only the statement that actually flips the flag (returns a row) proceeds to
  // decrement the org balance.
  const { data: charged, error: chargeErr } = await supabase
    .from("interviews")
    .update({ credit_charged: true })
    .eq("id", interviewId)
    .eq("credit_charged", false)
    .select("organization_id");
  if (chargeErr) throw new Error(chargeErr.message);

  if (charged && charged.length > 0) {
    const orgId = interview.organization_id;
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("credits_remaining")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    const current = org?.credits_remaining ?? 0;
    const { error: decErr } = await supabase
      .from("organizations")
      .update({ credits_remaining: Math.max(0, current - 1) })
      .eq("id", orgId);
    if (decErr) throw new Error(decErr.message);
  }

  return { recapUrl: recapUrlFor(interviewId), alreadyCompleted: false };
}
