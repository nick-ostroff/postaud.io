import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { processInterview } from "@/server/pipeline/process-interview";

type Db = SupabaseClient<Database>;

// ≈5 real retries: each failed run bumps process_attempts by 2 (the
// pipeline's atomic CAS claim + recordProcessError's own increment on the
// way out) — see process-interview.ts. Do NOT filter on process_error:
// crash-orphaned rows (process killed mid-run) have process_error NULL and
// must still be swept.
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_MAX_PER_TICK = 5;
// Staleness guard: a row that JUST flipped to `completed` (e.g. the
// fire-and-forget pipeline kicked off by /complete is still mid-flight)
// shouldn't be instantly re-claimed by a racing tick.
const DEFAULT_STALENESS_MS = 2 * 60 * 1000;

export interface SweepOpts {
  maxAttempts?: number;
  maxPerTick?: number;
  stalenessMs?: number;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface SweepResult {
  swept: number;
  ids: string[];
}

/**
 * Selects stuck `completed` interviews and reprocesses each one. Pure
 * selection + dispatch against an injected client — no route/auth/env
 * concerns — so it's directly unit-testable with a DB mock.
 *
 * Sweep criteria (Task 12 review, carried forward): `status = 'completed'`
 * AND `process_attempts < maxAttempts` — never filter on `process_error`.
 * Oldest `ended_at` first, capped at `maxPerTick`, excluding rows that
 * completed more recently than `stalenessMs` ago.
 *
 * One interview's failure doesn't stop the sweep — `processInterview` already
 * records its own error/attempts bookkeeping and never throws for the
 * soft-fail (`no_facts`) case; any other throw is caught here and logged so
 * the rest of the batch still runs.
 */
export async function sweepOnce(db: Db, opts: SweepOpts = {}): Promise<SweepResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxPerTick = opts.maxPerTick ?? DEFAULT_MAX_PER_TICK;
  const stalenessMs = opts.stalenessMs ?? DEFAULT_STALENESS_MS;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - stalenessMs).toISOString();

  const { data, error } = await db
    .from("interviews")
    .select("id, ended_at")
    .eq("status", "completed")
    .lt("process_attempts", maxAttempts)
    .lt("ended_at", cutoff)
    .order("ended_at", { ascending: true })
    .limit(maxPerTick);
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((row) => row.id as string);

  for (const id of ids) {
    try {
      await processInterview(id);
    } catch (err) {
      console.error(`[tick] processInterview failed for ${id}:`, err);
    }
  }

  return { swept: ids.length, ids };
}
