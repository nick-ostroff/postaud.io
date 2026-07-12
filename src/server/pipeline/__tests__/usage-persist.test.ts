import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@/server/ai/extract";
import type { OnPipelineUsage, PipelineUsage } from "@/server/ai/pipeline-usage";
import type { MergeDecision } from "../merge";

type Row = Record<string, unknown>;

/**
 * In-memory Supabase stub — same shape as process-interview.test.ts's
 * `makeDb` (duplicated here rather than imported since that file doesn't
 * export it). Covers the chains `runPipeline`/`recordProcessError`/
 * `recordUsage` use:
 *   from(t).select(...).eq(...).maybeSingle()
 *   from(t).select(...).eq(...)            → thenable list
 *   from(t).select(...).eq(...).order(...) → thenable list
 *   from(t).update(patch).eq(...)[.eq(...)] → thenable, mutates in place
 *   from(t).update(patch).eq(...).eq(...).select(cols) → applies patch, returns matched rows
 *   from(t).insert(rows) / .upsert(rows) → appends rows (both are plain
 *   appends here; this test suite is specifically what proves the *real*
 *   `recordUsage` call site uses `.insert`, not `.upsert`, against Supabase
 *   directly — see the live migration verification in the task report).
 */
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]),
  );

  function makeChain(table: string, kind: "select" | "update", patch?: Row) {
    const filters: Array<{ col: string; val: unknown; op: "eq" | "neq" }> = [];
    const match = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every(({ col, val, op }) => (op === "eq" ? row[col] === val : row[col] !== val)),
      );
    const applyUpdate = () => {
      for (const row of match()) Object.assign(row, patch);
    };

    const chain = {
      eq(col: string, val: unknown) {
        filters.push({ col, val, op: "eq" });
        return chain;
      },
      neq(col: string, val: unknown) {
        filters.push({ col, val, op: "neq" });
        return chain;
      },
      order() {
        return chain;
      },
      async maybeSingle() {
        return { data: (match()[0] as Row) ?? null, error: null };
      },
      select() {
        if (kind === "update") {
          const rows = match();
          applyUpdate();
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null });
        }
        return chain;
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

type ExtractKnowledgeFn = (
  input: unknown,
  opts: { extraInstruction?: string },
  onUsage?: OnPipelineUsage,
) => Promise<Extraction>;

type DecideMergesFn = (existing: unknown[], incoming: unknown[], onUsage?: OnPipelineUsage) => Promise<MergeDecision[]>;

const mocks = vi.hoisted(() => ({
  extractKnowledge: vi.fn<ExtractKnowledgeFn>(),
  decideMerges: vi.fn<DecideMergesFn>(),
  db: null as unknown as ReturnType<typeof makeDb>,
}));

vi.mock("@/server/ai/extract", () => ({ extractKnowledge: mocks.extractKnowledge }));
vi.mock("@/db/service", () => ({ serviceClient: () => mocks.db.client }));
vi.mock("@/server/pipeline/merge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../merge")>();
  return { ...actual, decideMerges: mocks.decideMerges };
});

import { processInterview } from "../process-interview";

const IV = "iv-1";
const SERIES = "series-1";
const ORG = "org-1";

/** A real `onUsage` payload shape — every field a genuine SDK response carries. */
function usageRec(phase: PipelineUsage["phase"], inputTokens: number, outputTokens: number): PipelineUsage {
  return {
    model: "claude-sonnet-5",
    phase,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    raw: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const emptyExtraction: Extraction = {
  summary: { short: "s", long: "l", bullets: ["a", "b", "c"] },
  facts: [],
  suggestedTopics: [],
  coverage: [],
};

const oneChildhoodFact: Extraction = {
  summary: { short: "s", long: "l", bullets: ["a", "b", "c"] },
  facts: [{ statement: "Grew up on a farm in Rotterdam.", topic: "Childhood", confidence: 0.9, sourceMessageId: null, entities: [] }],
  suggestedTopics: [],
  coverage: [],
};

/** 5 subject turns — enough to trip the ≥4 "every session must add facts" invariant. */
function conversationMessages(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push({ id: `m-q-${i}`, interview_id: IV, role: "interviewer", text: `q${i}`, t_offset_sec: i * 10, seq: i * 2 });
    rows.push({ id: `m-a-${i}`, interview_id: IV, role: "subject", text: `a${i}`, t_offset_sec: i * 10 + 5, seq: i * 2 + 1 });
  }
  return rows;
}

/** A single-turn transcript — deliberately under the invariant threshold, so
 * `extractKnowledge` is called exactly once per run with no forced retry. */
function trivialMessages(): Row[] {
  return [
    { id: "m-1", interview_id: IV, role: "interviewer", text: "q", t_offset_sec: 0, seq: 0 },
    { id: "m-2", interview_id: IV, role: "subject", text: "a", t_offset_sec: 5, seq: 1 },
  ];
}

function seedDb(interviewStatus: string, messages: Row[]) {
  mocks.db = makeDb({
    interviews: [
      { id: IV, series_id: SERIES, organization_id: ORG, status: interviewStatus, process_attempts: 0, process_error: null },
    ],
    series: [{ id: SERIES, goal: "Capture Dad's whole life", subject_name: "Henk" }],
    topics: [{ id: "t-childhood", series_id: SERIES, name: "Childhood", description: null, suggested: false, position: 0 }],
    interview_messages: messages,
    facts: [],
  });
}

beforeEach(() => {
  mocks.extractKnowledge.mockReset();
  mocks.decideMerges.mockReset();
});

describe("usage ledger — persistence on success and failure (task-usage-1 fix round 1)", () => {
  it("a successful run inserts one summed 'extract' row (initial + forced-retry) and one 'merge' row", async () => {
    seedDb("completed", conversationMessages());

    // First call: zero facts → trips the forced retry. Second call: facts,
    // so the pipeline proceeds. Both are real API calls with their own cost.
    mocks.extractKnowledge
      .mockImplementationOnce(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
        onUsage?.(usageRec("extract", 100, 50));
        return emptyExtraction;
      })
      .mockImplementationOnce(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
        onUsage?.(usageRec("extract", 80, 40));
        return oneChildhoodFact;
      });

    // decideMerges is called (existing "Childhood" fact-less series here, so
    // existingForMerge is empty, but the mock replaces real short-circuit
    // logic — simulate the LLM call actually happening, e.g. because
    // insertFacts was reached with the topic already known from elsewhere).
    mocks.decideMerges.mockImplementationOnce(async (_existing: unknown, _incoming: unknown, onUsage: OnPipelineUsage | undefined) => {
      onUsage?.(usageRec("merge", 30, 15));
      return [{ index: 0, action: "insert" }];
    });

    await processInterview(IV);

    const usage = mocks.db.tables.interview_usage ?? [];
    expect(usage).toHaveLength(2);

    const extractRow = usage.find((r) => r.phase === "extract")!;
    expect(extractRow.provider).toBe("anthropic");
    expect(extractRow.organization_id).toBe(ORG);
    expect(extractRow.input_tokens).toBe(180); // 100 + 80
    expect(extractRow.output_tokens).toBe(90); // 50 + 40
    expect(extractRow.total_tokens).toBe(270);

    const mergeRow = usage.find((r) => r.phase === "merge")!;
    expect(mergeRow.input_tokens).toBe(30);
    expect(mergeRow.output_tokens).toBe(15);
    expect(mergeRow.total_tokens).toBe(45);

    expect(mocks.db.tables.interviews[0].status).toBe("processed");
  });

  it("a run that throws NoFactsError after spending extract tokens still inserts the extract usage row", async () => {
    seedDb("completed", conversationMessages());

    // Every call (initial + forced retry) spends real tokens but returns
    // zero facts, so the pipeline soft-fails with NoFactsError.
    mocks.extractKnowledge.mockImplementation(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
      onUsage?.(usageRec("extract", 120, 60));
      return emptyExtraction;
    });

    await expect(processInterview(IV)).resolves.toBeUndefined(); // soft-fail, not rethrown

    const iv = mocks.db.tables.interviews[0];
    expect(iv.status).toBe("completed"); // left for the tick to retry
    expect(iv.process_error).toBe("no_facts");

    const usage = mocks.db.tables.interview_usage ?? [];
    expect(usage).toHaveLength(1);
    expect(usage[0].phase).toBe("extract");
    // Both the initial and the forced-retry call spent tokens — both must
    // be captured, not just discarded because the run ultimately failed.
    expect(usage[0].input_tokens).toBe(240); // 120 + 120
    expect(usage[0].output_tokens).toBe(120); // 60 + 60
    expect(mocks.decideMerges).not.toHaveBeenCalled(); // never reached persistExtraction
  });

  it("a run that throws a genuine error after spending extract tokens still inserts the extract usage row", async () => {
    seedDb("completed", trivialMessages()); // <4 subject turns: exactly one extractKnowledge call

    mocks.extractKnowledge.mockImplementationOnce(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
      onUsage?.(usageRec("extract", 55, 25));
      throw new Error("anthropic 529 overloaded");
    });

    await expect(processInterview(IV)).rejects.toThrow("anthropic 529 overloaded");

    const iv = mocks.db.tables.interviews[0];
    expect(iv.process_error).toBe("anthropic 529 overloaded");

    const usage = mocks.db.tables.interview_usage ?? [];
    expect(usage).toHaveLength(1);
    expect(usage[0].phase).toBe("extract");
    expect(usage[0].input_tokens).toBe(55);
    expect(usage[0].output_tokens).toBe(25);
  });

  it("reprocessing appends a new row instead of replacing the prior run's row — cumulative spend is the sum", async () => {
    seedDb("completed", trivialMessages());
    // Persistent across both runs: always "insert" the one fact, and never
    // reports merge usage (isolates this test to the extract ledger).
    mocks.decideMerges.mockResolvedValue([{ index: 0, action: "insert" }]);

    mocks.extractKnowledge.mockImplementationOnce(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
      onUsage?.(usageRec("extract", 100, 50));
      return oneChildhoodFact;
    });
    await processInterview(IV);
    expect(mocks.db.tables.interviews[0].status).toBe("processed");

    // Simulate a forced reprocess (Task 13): the trigger resets the row back
    // to `completed` so `processInterview` treats this as a brand-new run.
    mocks.db.tables.interviews[0].status = "completed";

    mocks.extractKnowledge.mockImplementationOnce(async (_input: unknown, _opts: unknown, onUsage: OnPipelineUsage | undefined) => {
      onUsage?.(usageRec("extract", 60, 20));
      return oneChildhoodFact;
    });
    await processInterview(IV);
    expect(mocks.db.tables.interviews[0].status).toBe("processed");

    const usage = (mocks.db.tables.interview_usage ?? []).filter((r) => r.phase === "extract");
    expect(usage).toHaveLength(2); // appended, not replaced

    const cumulativeInput = usage.reduce((sum, r) => sum + (r.input_tokens as number), 0);
    const cumulativeOutput = usage.reduce((sum, r) => sum + (r.output_tokens as number), 0);
    expect(cumulativeInput).toBe(160); // 100 + 60
    expect(cumulativeOutput).toBe(70); // 50 + 20
  });

  it("does not fabricate a zero-usage row: a run whose SDK calls never returned usage inserts nothing", async () => {
    seedDb("completed", trivialMessages());

    // extractKnowledge and decideMerges both "succeed" but never call onUsage
    // — the same as a real SDK response that came back without a `usage`
    // field on it.
    mocks.extractKnowledge.mockResolvedValueOnce(oneChildhoodFact);
    mocks.decideMerges.mockResolvedValueOnce([{ index: 0, action: "insert" }]);

    await processInterview(IV);

    expect(mocks.db.tables.interviews[0].status).toBe("processed");
    expect(mocks.db.tables.interview_usage ?? []).toHaveLength(0);
  });
});
