import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processInterview: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("@/server/pipeline/process-interview", () => ({ processInterview: mocks.processInterview }));

import { sweepOnce } from "../tick";

type Row = { id: string; status: string; process_attempts: number; ended_at: string };

/**
 * Minimal fluent mock for the one query shape sweepOnce issues:
 *   from("interviews").select(...).eq("status","completed").lt("process_attempts", n)
 *     .lt("ended_at", cutoff).order("ended_at", {ascending:true}).limit(n)
 * Captures every filter/order/limit call so tests can assert on them.
 */
function makeDb(rows: Row[]) {
  const calls: { filters: Array<{ op: string; col: string; val: unknown }>; orderCol?: string; limitN?: number } = {
    filters: [],
  };

  function apply(): Row[] {
    let result = rows.filter((r) =>
      calls.filters.every(({ op, col, val }) => {
        const rv = (r as unknown as Record<string, unknown>)[col];
        if (op === "eq") return rv === val;
        if (op === "lt") return (rv as string | number) < (val as string | number);
        return true;
      }),
    );
    if (calls.orderCol) {
      const col = calls.orderCol;
      result = [...result].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[col] as string;
        const bv = (b as unknown as Record<string, unknown>)[col] as string;
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    if (calls.limitN != null) result = result.slice(0, calls.limitN);
    return result;
  }

  const chain = {
    eq(col: string, val: unknown) {
      calls.filters.push({ op: "eq", col, val });
      return chain;
    },
    lt(col: string, val: unknown) {
      calls.filters.push({ op: "lt", col, val });
      return chain;
    },
    order(col: string) {
      calls.orderCol = col;
      return chain;
    },
    limit(n: number) {
      calls.limitN = n;
      return Promise.resolve({ data: apply(), error: null });
    },
  };

  return {
    calls,
    client: { from: () => ({ select: () => chain }) },
  };
}

beforeEach(() => {
  mocks.processInterview.mockReset();
  mocks.processInterview.mockResolvedValue(undefined);
});

const NOW = new Date("2026-07-11T12:00:00.000Z");
const OLD_ENOUGH = new Date("2026-07-11T11:00:00.000Z").toISOString(); // 1hr ago — well past staleness
const TOO_FRESH = new Date("2026-07-11T11:59:30.000Z").toISOString(); // 30s ago — within the 2min guard

describe("sweepOnce", () => {
  it("selects completed rows under the attempts cap, older than the staleness guard, oldest first", async () => {
    const db = makeDb([
      { id: "a", status: "completed", process_attempts: 0, ended_at: OLD_ENOUGH },
      { id: "b", status: "completed", process_attempts: 0, ended_at: "2026-07-11T10:00:00.000Z" },
      { id: "c", status: "processed", process_attempts: 0, ended_at: OLD_ENOUGH }, // wrong status
      { id: "d", status: "completed", process_attempts: 20, ended_at: OLD_ENOUGH }, // over attempts cap
      { id: "e", status: "completed", process_attempts: 0, ended_at: TOO_FRESH }, // too fresh
    ]);

    const result = await sweepOnce(db.client as never, { now: NOW });

    expect(result.ids).toEqual(["b", "a"]); // oldest ended_at first
    expect(result.swept).toBe(2);
    expect(mocks.processInterview).toHaveBeenCalledTimes(2);
    expect(mocks.processInterview).toHaveBeenNthCalledWith(1, "b");
    expect(mocks.processInterview).toHaveBeenNthCalledWith(2, "a");
  });

  it("does NOT filter on process_error — a crash-orphaned row with process_error null is swept too", async () => {
    // Selection query never references process_error at all; a row missing
    // that field entirely still matches on status + attempts + staleness.
    const db = makeDb([{ id: "orphan", status: "completed", process_attempts: 0, ended_at: OLD_ENOUGH }]);

    const result = await sweepOnce(db.client as never, { now: NOW });

    expect(result.ids).toEqual(["orphan"]);
  });

  it("caps at maxPerTick even when more rows qualify", async () => {
    const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i}`,
      status: "completed",
      process_attempts: 0,
      ended_at: new Date(NOW.getTime() - (3600 + i) * 1000).toISOString(),
    }));
    const db = makeDb(rows);

    const result = await sweepOnce(db.client as never, { now: NOW, maxPerTick: 5 });

    expect(result.swept).toBe(5);
  });

  it("respects a custom maxAttempts / stalenessMs", async () => {
    const db = makeDb([
      { id: "a", status: "completed", process_attempts: 3, ended_at: OLD_ENOUGH },
      { id: "b", status: "completed", process_attempts: 1, ended_at: TOO_FRESH },
    ]);

    const result = await sweepOnce(db.client as never, { now: NOW, maxAttempts: 3, stalenessMs: 10_000 });

    // "a" excluded: attempts(3) is not < maxAttempts(3). "b" included: fresher
    // than the (shrunk) 10s staleness guard cutoff is still > cutoff since
    // TOO_FRESH is 30s old, well past a 10s guard.
    expect(result.ids).toEqual(["b"]);
  });

  it("keeps sweeping the rest of the batch when one processInterview call throws", async () => {
    const db = makeDb([
      { id: "a", status: "completed", process_attempts: 0, ended_at: "2026-07-11T10:00:00.000Z" },
      { id: "b", status: "completed", process_attempts: 0, ended_at: OLD_ENOUGH },
    ]);
    mocks.processInterview.mockImplementation(async (id: string) => {
      if (id === "a") throw new Error("boom");
    });

    const result = await sweepOnce(db.client as never, { now: NOW });

    expect(result.swept).toBe(2);
    expect(mocks.processInterview).toHaveBeenCalledWith("a");
    expect(mocks.processInterview).toHaveBeenCalledWith("b");
  });

  it("returns zero swept when nothing qualifies", async () => {
    const db = makeDb([]);
    const result = await sweepOnce(db.client as never, { now: NOW });
    expect(result).toEqual({ swept: 0, ids: [] });
    expect(mocks.processInterview).not.toHaveBeenCalled();
  });
});
