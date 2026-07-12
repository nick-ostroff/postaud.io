import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@/server/ai/extract";

type Row = Record<string, unknown>;

/**
 * In-memory Supabase stub (same style as complete.test.ts) covering the chain
 * shapes runPipeline/recordProcessError use:
 *   from(t).select(...).eq(...).maybeSingle()
 *   from(t).select(...).eq(...)            → thenable list
 *   from(t).select(...).eq(...).order(...) → thenable list
 *   from(t).update(patch).eq(...)[.eq(...)] → thenable, mutates in place
 */
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]),
  );

  function makeChain(table: string, kind: "select" | "update", patch?: Row) {
    const filters: Array<[string, unknown]> = [];
    const match = () => (tables[table] ?? []).filter((row) => filters.every(([c, v]) => row[c] === v));
    const applyUpdate = () => {
      for (const row of match()) Object.assign(row, patch);
    };

    const chain = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      order() {
        return chain;
      },
      async maybeSingle() {
        return { data: (match()[0] as Row) ?? null, error: null };
      },
      then(resolve: (v: { data: Row[] | null; error: null }) => void) {
        if (kind === "update") {
          applyUpdate();
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: match().map((r) => ({ ...r })), error: null });
      },
    };
    return chain;
  }

  let nextId = 1;
  const writeRows = (table: string, rows: Row | Row[]) => {
    const list = Array.isArray(rows) ? rows : [rows];
    const written = list.map((r) => ({ id: r.id ?? `gen-${nextId++}`, ...r }));
    tables[table] = [...(tables[table] ?? []), ...written];
    return written;
  };
  const writeResult = (written: Row[]) => ({
    select: () => Promise.resolve({ data: written.map((r) => ({ ...r })), error: null }),
    then(resolve: (v: { data: null; error: null }) => void) {
      resolve({ data: null, error: null });
    },
  });

  return {
    tables,
    client: {
      from(table: string) {
        return {
          select: () => makeChain(table, "select"),
          update: (patch: Row) => makeChain(table, "update", patch),
          insert: (rows: Row | Row[]) => writeResult(writeRows(table, rows)),
          upsert: (rows: Row | Row[]) => writeResult(writeRows(table, rows)),
        };
      },
    },
  };
}

const mocks = vi.hoisted(() => ({
  extractKnowledge: vi.fn<(...args: unknown[]) => Promise<Extraction>>(),
  db: null as unknown as ReturnType<typeof makeDb>,
}));

vi.mock("@/server/ai/extract", () => ({ extractKnowledge: mocks.extractKnowledge }));
vi.mock("@/db/service", () => ({ serviceClient: () => mocks.db.client }));

import { processInterview } from "../process-interview";

const IV = "iv-1";
const SERIES = "series-1";

const emptyExtraction: Extraction = {
  summary: { short: "s", long: "l", bullets: ["a", "b", "c"] },
  facts: [],
  suggestedTopics: [],
  coverage: [],
};

/** 5 subject turns + interviewer turns — enough to trip the ≥4 invariant. */
function conversationMessages(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push({ id: `m-q-${i}`, interview_id: IV, role: "interviewer", text: `q${i}`, t_offset_sec: i * 10, seq: i * 2 });
    rows.push({ id: `m-a-${i}`, interview_id: IV, role: "subject", text: `a${i}`, t_offset_sec: i * 10 + 5, seq: i * 2 + 1 });
  }
  return rows;
}

function seedDb(interviewStatus: string, messages: Row[] = conversationMessages()) {
  mocks.db = makeDb({
    interviews: [{ id: IV, series_id: SERIES, status: interviewStatus, process_attempts: 0, process_error: null }],
    series: [{ id: SERIES, goal: "Capture Dad's whole life", subject_name: "Henk" }],
    topics: [],
    interview_messages: messages,
  });
}

beforeEach(() => {
  mocks.extractKnowledge.mockReset();
});

describe("processInterview", () => {
  it("is idempotent: an already-processed interview never reaches extraction", async () => {
    seedDb("processed");
    await processInterview(IV);
    expect(mocks.extractKnowledge).not.toHaveBeenCalled();
  });

  it("no_facts invariant: zero facts on a real conversation retries once with the addendum, then soft-fails", async () => {
    seedDb("completed");
    mocks.extractKnowledge.mockResolvedValue(emptyExtraction);

    // Resolves (soft-fail) — the fire-and-forget caller must not see a throw.
    await expect(processInterview(IV)).resolves.toBeUndefined();

    expect(mocks.extractKnowledge).toHaveBeenCalledTimes(2);
    const retryOpts = mocks.extractKnowledge.mock.calls[1][1] as { extraInstruction?: string };
    expect(retryOpts?.extraInstruction).toMatch(/at least one fact/i);

    const iv = mocks.db.tables.interviews[0];
    expect(iv.status).toBe("completed"); // left for the tick to retry
    expect(iv.process_error).toBe("no_facts");
    expect(iv.process_attempts).toBe(1);
  });

  it("records process_error and increments attempts on extraction failure, then rethrows", async () => {
    seedDb("completed");
    mocks.extractKnowledge.mockRejectedValue(new Error("boom"));

    await expect(processInterview(IV)).rejects.toThrow("boom");

    const iv = mocks.db.tables.interviews[0];
    expect(iv.status).toBe("completed");
    expect(iv.process_error).toBe("boom");
    expect(iv.process_attempts).toBe(1);
  });

  it("does not force the fact retry on a trivial transcript (<4 subject turns)", async () => {
    seedDb("completed", [
      { id: "m-1", interview_id: IV, role: "interviewer", text: "q", t_offset_sec: 0, seq: 0 },
      { id: "m-2", interview_id: IV, role: "subject", text: "a", t_offset_sec: 5, seq: 1 },
    ]);
    mocks.extractKnowledge.mockResolvedValue(emptyExtraction);

    await processInterview(IV);

    // One call, no forced retry; pipeline proceeds and marks processed.
    expect(mocks.extractKnowledge).toHaveBeenCalledTimes(1);
    expect(mocks.db.tables.interviews[0].status).toBe("processed");
  });
});
