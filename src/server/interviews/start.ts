import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

/**
 * Typed start-interview failure the caller (`POST /api/series/[id]/interviews`)
 * maps to a specific HTTP status — currently just the credit gate.
 */
export class StartInterviewError extends Error {
  code: "no_credits";
  status: number;
  constructor(code: StartInterviewError["code"], message: string, status = 402) {
    super(message);
    this.name = "StartInterviewError";
    this.code = code;
    this.status = status;
  }
}

export type StartInterviewInput = {
  organizationId: string;
  seriesId: string;
  conductedBy: string;
  handoff: boolean;
  creditsRemaining: number;
};

/**
 * Credit-gate + reuse-or-create for a session start. Callers must already
 * have verified the caller can interview this series (route-level 403) —
 * this only owns the org's credit balance and the in-progress row.
 *
 * Reuses an existing `in_progress` interview for the same series + conductor
 * rather than inserting a duplicate: Task 10's retry flow (reconnecting after
 * a dropped connection) depends on getting the *same* interview id back
 * instead of abandoning one row per attempt.
 */
export async function startInterview(
  supabase: SupabaseClient<Database>,
  input: StartInterviewInput,
): Promise<{ interviewId: string }> {
  if (input.creditsRemaining <= 0) {
    throw new StartInterviewError("no_credits", "This workspace has no interview credits remaining.");
  }

  // limit(1) rather than .maybeSingle() — a stray duplicate in_progress row
  // (shouldn't happen, but isn't enforced by a DB constraint) must not throw
  // here, it should just resume the most recent one.
  const { data: existing, error: existingErr } = await supabase
    .from("interviews")
    .select("id")
    .eq("series_id", input.seriesId)
    .eq("conducted_by", input.conductedBy)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1);
  if (existingErr) throw new Error(existingErr.message);
  if (existing && existing.length > 0) {
    return { interviewId: existing[0].id };
  }

  const { data: created, error: createErr } = await supabase
    .from("interviews")
    .insert({
      organization_id: input.organizationId,
      series_id: input.seriesId,
      conducted_by: input.conductedBy,
      hand_the_mic: input.handoff,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    throw new Error(createErr?.message ?? "Could not start interview.");
  }
  return { interviewId: created.id };
}
