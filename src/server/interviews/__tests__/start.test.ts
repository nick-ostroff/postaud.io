import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { StartInterviewError, startInterview } from "../start";

type StubOptions = {
  /**
   * What each successive in-progress lookup returns, in order (first element
   * = the pre-insert check, second = the post-23505 re-fetch). The last
   * element repeats if the code selects more times than configured.
   */
  selectResults?: Array<{ id: string }[]>;
  insertResult?: {
    data: { id: string } | null;
    error: { code?: string; message: string } | null;
  };
};

/**
 * Minimal chainable stand-in for the two query shapes startInterview() uses:
 *   from("interviews").select("id").eq().eq().eq().order().limit(1)
 *   from("interviews").insert({...}).select("id").single()
 * Records inserted rows and select-chain filters so tests can assert on them.
 */
function makeSupabaseStub(opts: StubOptions = {}) {
  const selectQueue = [...(opts.selectResults ?? [[]])];
  const calls = {
    inserts: [] as Record<string, unknown>[],
    selectFilters: [] as Record<string, unknown>[],
  };

  const stub = {
    from(table: string) {
      if (table !== "interviews") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return chain;
            },
            order() {
              return chain;
            },
            async limit() {
              calls.selectFilters.push(filters);
              const rows = selectQueue.length > 1 ? selectQueue.shift()! : selectQueue[0];
              return { data: rows, error: null };
            },
          };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          calls.inserts.push(row);
          return {
            select() {
              return {
                async single() {
                  return opts.insertResult ?? { data: { id: "new-interview" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return { supabase: stub as unknown as SupabaseClient<Database>, calls };
}

const baseInput = {
  organizationId: "org-1",
  seriesId: "series-1",
  conductedBy: "user-1",
  handoff: false,
  creditsRemaining: 3,
};

describe("startInterview", () => {
  it("throws no_credits when the org has no credits remaining, before touching the DB", async () => {
    const { supabase, calls } = makeSupabaseStub();
    const err = await startInterview(supabase, { ...baseInput, creditsRemaining: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(StartInterviewError);
    expect((err as StartInterviewError).code).toBe("no_credits");
    expect((err as StartInterviewError).status).toBe(402);
    expect(calls.selectFilters).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it("reuses an existing in_progress interview for the same series + conductor without inserting", async () => {
    const { supabase, calls } = makeSupabaseStub({ selectResults: [[{ id: "existing-1" }]] });
    const result = await startInterview(supabase, baseInput);
    expect(result).toEqual({ interviewId: "existing-1" });
    expect(calls.inserts).toHaveLength(0);
    expect(calls.selectFilters[0]).toEqual({
      series_id: "series-1",
      conducted_by: "user-1",
      status: "in_progress",
    });
  });

  it("inserts a new interview (conducted_by + hand_the_mic) when none is in progress", async () => {
    const { supabase, calls } = makeSupabaseStub({
      selectResults: [[]],
      insertResult: { data: { id: "new-1" }, error: null },
    });
    const result = await startInterview(supabase, { ...baseInput, handoff: true });
    expect(result).toEqual({ interviewId: "new-1" });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toEqual({
      organization_id: "org-1",
      series_id: "series-1",
      conducted_by: "user-1",
      hand_the_mic: true,
    });
  });

  it("resolves a lost 23505 race by returning the concurrent winner's row", async () => {
    const { supabase, calls } = makeSupabaseStub({
      // First lookup (pre-insert) sees nothing; re-fetch after the unique
      // violation sees the row the concurrent request created.
      selectResults: [[], [{ id: "winner-1" }]],
      insertResult: { data: null, error: { code: "23505", message: "duplicate key value" } },
    });
    const result = await startInterview(supabase, baseInput);
    expect(result).toEqual({ interviewId: "winner-1" });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.selectFilters).toHaveLength(2);
  });

  it("surfaces non-unique-violation insert errors", async () => {
    const { supabase } = makeSupabaseStub({
      selectResults: [[]],
      insertResult: { data: null, error: { code: "42501", message: "permission denied" } },
    });
    await expect(startInterview(supabase, baseInput)).rejects.toThrow("permission denied");
  });
});
