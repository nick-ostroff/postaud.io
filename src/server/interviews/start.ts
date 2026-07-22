import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationMode, Database } from "@/db/types";

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
  /** Mode this session should run in (picker choice or the series default). */
  mode: ConversationMode;
};

/**
 * The most recent in_progress interview for this series + conductor, or null.
 * limit(1) rather than .maybeSingle() — a stray duplicate in_progress row
 * (pre-0007 data, or a future constraint regression) must not throw here, it
 * should just resume the most recent one.
 */
async function findInProgress(
  supabase: SupabaseClient<Database>,
  seriesId: string,
  conductedBy: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("interviews")
    .select("id")
    .eq("series_id", seriesId)
    .eq("conducted_by", conductedBy)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0].id : null;
}

/**
 * Credit-gate + reuse-or-create for a session start. Callers must already
 * have verified the caller can interview this series (route-level 403) —
 * this only owns the org's credit balance and the in-progress row.
 *
 * Reuses an existing `in_progress` interview for the same series + conductor
 * rather than inserting a duplicate: Task 10's retry flow (reconnecting after
 * a dropped connection) depends on getting the *same* interview id back
 * instead of abandoning one row per attempt.
 *
 * The check-then-insert has an inherent race (two concurrent starts can both
 * see "nothing in progress"), so 0007's partial unique index
 * (`interviews_one_inprogress_per_conductor`) is the real guarantee: the
 * losing insert fails with Postgres 23505, which we catch and resolve by
 * re-fetching the winner's row.
 */
export async function startInterview(
  supabase: SupabaseClient<Database>,
  input: StartInterviewInput,
): Promise<{ interviewId: string }> {
  if (input.creditsRemaining <= 0) {
    throw new StartInterviewError("no_credits", "This workspace has no interview credits remaining.");
  }

  const existingId = await findInProgress(supabase, input.seriesId, input.conductedBy);
  if (existingId) {
    // Stamp the requested mode even on a resumed session: a reconnect that
    // chose differently (or a resume after the series default changed)
    // should mint instructions matching the mode the user is looking at now.
    const { error: modeErr } = await supabase
      .from("interviews")
      .update({ mode: input.mode })
      .eq("id", existingId);
    if (modeErr) throw new Error(modeErr.message);
    return { interviewId: existingId };
  }

  const { data: created, error: createErr } = await supabase
    .from("interviews")
    .insert({
      organization_id: input.organizationId,
      series_id: input.seriesId,
      conducted_by: input.conductedBy,
      hand_the_mic: input.handoff,
      mode: input.mode,
    })
    .select("id")
    .single();

  if (createErr) {
    // Unique violation on interviews_one_inprogress_per_conductor (0007):
    // a concurrent start won the race between our check and our insert —
    // return the winner's row instead of erroring.
    if (createErr.code === "23505") {
      const racedId = await findInProgress(supabase, input.seriesId, input.conductedBy);
      if (racedId) return { interviewId: racedId };
    }
    throw new Error(createErr.message);
  }
  if (!created) {
    throw new Error("Could not start interview.");
  }
  return { interviewId: created.id };
}
