import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { type CreateSeriesInput, createSeries } from "../create";
import { DEFAULT_VOICE } from "@/lib/voices";

/**
 * Minimal chainable stand-in for the two query shapes createSeries() uses
 * when the subject is a free-text "person" (no member lookup, no access
 * rows, no seeded topics — so `memberships`/`series_access`/`topics` never
 * get touched):
 *   from("memberships").select().order()
 *   from("series").insert({...}).select("id").single()
 * Records the inserted `series` row so tests can assert on it. Throws on
 * any other table so an unexpected extra write (e.g. an accidental
 * `series_access`/`topics` insert) fails loudly instead of being ignored.
 */
function makeSupabaseStub() {
  const calls = {
    seriesInserts: [] as Record<string, unknown>[],
  };

  const stub = {
    from(table: string) {
      if (table === "memberships") {
        return {
          select() {
            return {
              async order() {
                return { data: [], error: null };
              },
            };
          },
        };
      }
      if (table === "series") {
        return {
          insert(row: Record<string, unknown>) {
            calls.seriesInserts.push(row);
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "series-1" }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { supabase: stub as unknown as SupabaseClient<Database>, calls };
}

const baseInput: CreateSeriesInput = {
  title: "Dad's Story",
  goal: "Capture his whole life",
  subjectKind: "person",
  subjectName: "Henk",
  mustCover: [],
  dontBringUp: [],
  totalMinutes: null,
  access: [],
};

describe("createSeries", () => {
  it("derives interviewer_name from the voice and ignores a client-supplied interviewerName", async () => {
    const { supabase, calls } = makeSupabaseStub();

    // A hand-rolled caller (or a future regression) forcing a mismatched
    // name through. `interviewerName` isn't on `CreateSeriesInput` — that's
    // the point — so this cast simulates the only way it could get in.
    const malicious = {
      ...baseInput,
      voice: "cedar",
      interviewerName: "Anna",
    } as CreateSeriesInput & { interviewerName: string };

    const result = await createSeries(supabase, {
      orgId: "org-1",
      createdBy: "user-1",
      input: malicious,
    });

    expect(result).toEqual({ id: "series-1" });
    expect(calls.seriesInserts).toHaveLength(1);
    expect(calls.seriesInserts[0]).toMatchObject({
      voice: "cedar",
      interviewer_name: "Ellis",
    });
    expect(calls.seriesInserts[0].interviewer_name).not.toBe("Anna");
  });

  it("defaults to marin/Anna/flow/open-ended for a minimal client that sends no voice", async () => {
    const { supabase, calls } = makeSupabaseStub();

    const result = await createSeries(supabase, {
      orgId: "org-1",
      createdBy: "user-1",
      input: baseInput, // no voice, conversationMode, or plannedSessions at all
    });

    expect(result).toEqual({ id: "series-1" });
    expect(calls.seriesInserts).toHaveLength(1);
    expect(calls.seriesInserts[0]).toMatchObject({
      voice: DEFAULT_VOICE,
      interviewer_name: "Anna",
      conversation_mode: "flow",
      total_minutes: null,
      planned_sessions: null,
    });
  });
});
