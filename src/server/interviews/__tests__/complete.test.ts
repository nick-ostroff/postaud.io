import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { CompleteInterviewError, completeInterview } from "../complete";

type Row = Record<string, unknown>;

/**
 * Minimal in-memory Supabase stub backed by row arrays per table. Supports the
 * exact chain shapes completeInterview() uses:
 *   from(t).select(cols).eq(...).maybeSingle()
 *   from(t).update(patch).eq(...).eq(...).select(cols)   → returns matched rows
 *   from(t).update(patch).eq(...)                        → terminal (awaited)
 * eq filters are ANDed; updates mutate the backing rows in place so a later
 * select sees the new state (that's what makes the idempotency assertions real).
 */
function makeDb(seed: { interviews: Row[]; organizations: Row[] }) {
  const tables: Record<string, Row[]> = {
    interviews: seed.interviews.map((r) => ({ ...r })),
    organizations: seed.organizations.map((r) => ({ ...r })),
  };
  const counters = { orgUpdates: 0 };

  function makeChain(table: string, kind: "select" | "update", patch?: Row) {
    const filters: Array<[string, unknown]> = [];
    const match = () => tables[table].filter((row) => filters.every(([c, v]) => row[c] === v));

    const chain = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      async maybeSingle() {
        const rows = match();
        return { data: (rows[0] as Row) ?? null, error: null };
      },
      select() {
        // update(...).eq(...).select(...) — apply patch, return affected rows
        if (kind === "update") {
          const rows = match();
          for (const row of rows) Object.assign(row, patch);
          if (table === "organizations" && rows.length > 0) counters.orgUpdates += 1;
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null });
        }
        return chain;
      },
      // terminal update without .select(): awaiting the eq() chain applies patch
      then(resolve: (v: { data: null; error: null }) => void) {
        if (kind === "update") {
          const rows = match();
          for (const row of rows) Object.assign(row, patch);
          if (table === "organizations" && rows.length > 0) counters.orgUpdates += 1;
        }
        resolve({ data: null, error: null });
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select() {
          return makeChain(table, "select");
        },
        update(patch: Row) {
          return makeChain(table, "update", patch);
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, tables, counters };
}

const IV = "iv-1";
const ORG = "org-1";

describe("completeInterview", () => {
  it("completes an in_progress interview: sets status/ended_at/duration and charges one credit", async () => {
    const { client, tables } = makeDb({
      interviews: [{ id: IV, status: "in_progress", organization_id: ORG, credit_charged: false }],
      organizations: [{ id: ORG, credits_remaining: 5 }],
    });

    const res = await completeInterview(client, { interviewId: IV, durationSec: 742 });

    expect(res).toEqual({ recapUrl: `/app/interviews/${IV}/recap`, alreadyCompleted: false });
    const iv = tables.interviews[0];
    expect(iv.status).toBe("completed");
    expect(iv.duration_sec).toBe(742);
    expect(iv.ended_at).toBeTypeOf("string");
    expect(iv.credit_charged).toBe(true);
    expect(tables.organizations[0].credits_remaining).toBe(4);
  });

  it("is idempotent on double-complete: second call does not re-charge or re-decrement", async () => {
    const { client, tables, counters } = makeDb({
      interviews: [{ id: IV, status: "in_progress", organization_id: ORG, credit_charged: false }],
      organizations: [{ id: ORG, credits_remaining: 3 }],
    });

    const first = await completeInterview(client, { interviewId: IV, durationSec: 100 });
    const orgUpdatesAfterFirst = counters.orgUpdates;
    const second = await completeInterview(client, { interviewId: IV, durationSec: 999 });

    expect(first.alreadyCompleted).toBe(false);
    expect(second).toEqual({ recapUrl: `/app/interviews/${IV}/recap`, alreadyCompleted: true });
    // credit decremented exactly once, duration not overwritten by the retry
    expect(tables.organizations[0].credits_remaining).toBe(2);
    expect(counters.orgUpdates).toBe(orgUpdatesAfterFirst);
    expect(tables.interviews[0].duration_sec).toBe(100);
  });

  it("charges the credit only once even if credit_charged is already true on an in_progress row", async () => {
    const { client, tables, counters } = makeDb({
      interviews: [{ id: IV, status: "in_progress", organization_id: ORG, credit_charged: true }],
      organizations: [{ id: ORG, credits_remaining: 7 }],
    });

    const res = await completeInterview(client, { interviewId: IV, durationSec: 50 });

    expect(res.alreadyCompleted).toBe(false);
    expect(tables.interviews[0].status).toBe("completed");
    // credit_charged guard already satisfied → no org decrement
    expect(tables.organizations[0].credits_remaining).toBe(7);
    expect(counters.orgUpdates).toBe(0);
  });

  it("returns idempotently when the interview is already completed (never was re-charged)", async () => {
    const { client, tables, counters } = makeDb({
      interviews: [{ id: IV, status: "completed", organization_id: ORG, credit_charged: true }],
      organizations: [{ id: ORG, credits_remaining: 9 }],
    });

    const res = await completeInterview(client, { interviewId: IV, durationSec: 12 });

    expect(res).toEqual({ recapUrl: `/app/interviews/${IV}/recap`, alreadyCompleted: true });
    expect(counters.orgUpdates).toBe(0);
    expect(tables.organizations[0].credits_remaining).toBe(9);
  });

  it("throws not_found (404) when the interview does not exist", async () => {
    const { client } = makeDb({ interviews: [], organizations: [{ id: ORG, credits_remaining: 1 }] });
    await expect(completeInterview(client, { interviewId: "nope", durationSec: 1 })).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
    await expect(completeInterview(client, { interviewId: "nope", durationSec: 1 })).rejects.toBeInstanceOf(
      CompleteInterviewError,
    );
  });

  it("throws conflict (409) for an abandoned interview", async () => {
    const { client } = makeDb({
      interviews: [{ id: IV, status: "abandoned", organization_id: ORG, credit_charged: false }],
      organizations: [{ id: ORG, credits_remaining: 1 }],
    });
    await expect(completeInterview(client, { interviewId: IV, durationSec: 1 })).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });
});
