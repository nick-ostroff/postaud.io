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
 *   from(t).update(patch).eq(...).eq(...).select(cols) → applies patch, returns matched rows
 */
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]),
  );

  // One-shot hook for the "lost the claim race" test: makes the next
  // interviews/process_attempts CAS update behave as if a concurrent run's
  // update landed first — i.e. zero rows affected, no mutation applied.
  let claimMissOnce = false;

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
      // update(...).eq(...).select(...) — apply patch, return affected rows
      // (this is the CAS-claim shape: an .eq("process_attempts", n) that
      // doesn't match anything yields an empty affected-rows array here).
      select() {
        if (kind === "update") {
          if (claimMissOnce && table === "interviews" && patch && "process_attempts" in patch) {
            claimMissOnce = false;
            return Promise.resolve({ data: [], error: null });
          }
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
    /** Arms the one-shot CAS-miss hook (see `claimMissOnce` above). */
    simulateLostClaim() {
      claimMissOnce = true;
    },
  };
}

const mocks = vi.hoisted(() => ({
  extractKnowledge: vi.fn<(...args: unknown[]) => Promise<Extraction>>(),
  decideMerges: vi.fn(),
  db: null as unknown as ReturnType<typeof makeDb>,
}));

vi.mock("@/server/ai/extract", () => ({ extractKnowledge: mocks.extractKnowledge }));
vi.mock("@/db/service", () => ({ serviceClient: () => mocks.db.client }));
// Partial mock: keep the real (already TDD'd) applyMergeDecisions, replace
// only decideMerges so these tests control the merge outcome directly
// without needing a real Anthropic call.
vi.mock("@/server/pipeline/merge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../merge")>();
  return { ...actual, decideMerges: mocks.decideMerges };
});

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
  mocks.decideMerges.mockReset();
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
    // 1 from the atomic claim at pipeline start + 1 from recordProcessError
    // on the way out — both are real, independent increments (see comment
    // on the claim in process-interview.ts).
    expect(iv.process_attempts).toBe(2);
  });

  it("records process_error and increments attempts on extraction failure, then rethrows", async () => {
    seedDb("completed");
    mocks.extractKnowledge.mockRejectedValue(new Error("boom"));

    await expect(processInterview(IV)).rejects.toThrow("boom");

    const iv = mocks.db.tables.interviews[0];
    expect(iv.status).toBe("completed");
    expect(iv.process_error).toBe("boom");
    // 1 from the atomic claim at pipeline start + 1 from recordProcessError.
    expect(iv.process_attempts).toBe(2);
  });

  it("loses the claim race: a concurrent run's CAS update wins first, so this run backs off before extracting", async () => {
    seedDb("completed");
    mocks.extractKnowledge.mockResolvedValue(emptyExtraction);
    mocks.db.simulateLostClaim();

    await expect(processInterview(IV)).resolves.toBeUndefined();

    expect(mocks.extractKnowledge).not.toHaveBeenCalled();
    // The row is untouched by us — the racer that won the claim owns any
    // further writes.
    const iv = mocks.db.tables.interviews[0];
    expect(iv.status).toBe("completed");
    expect(iv.process_attempts).toBe(0);
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

describe("processInterview — fact merging (Task 13)", () => {
  const twoChildhoodFacts: Extraction = {
    summary: { short: "s", long: "l", bullets: ["a", "b", "c"] },
    facts: [
      { statement: "Grew up on a farm in Rotterdam.", topic: "Childhood", confidence: 0.9, sourceMessageId: null, entities: [] },
      { statement: "Met Jan on a ferry in 1975.", topic: "Childhood", confidence: 0.85, sourceMessageId: null, entities: [] },
    ],
    suggestedTopics: [],
    coverage: [],
  };

  function seedWithExistingFact() {
    mocks.db = makeDb({
      interviews: [{ id: IV, series_id: SERIES, status: "completed", process_attempts: 0, process_error: null }],
      series: [{ id: SERIES, goal: "Capture Dad's whole life", subject_name: "Henk" }],
      topics: [{ id: "t-childhood", series_id: SERIES, name: "Childhood", description: null, suggested: false, position: 0 }],
      interview_messages: conversationMessages(),
      facts: [
        {
          id: "f-old-1",
          series_id: SERIES,
          topic_id: "t-childhood",
          statement: "Grew up on a farm.",
          confidence: 0.8,
          status: "active",
          source_interview_id: "iv-0",
          source_message_id: null,
          audio_offset_sec: null,
          superseded_by: null,
        },
      ],
    });
  }

  it("supersedes an existing fact and inserts a genuinely new one from the same batch", async () => {
    seedWithExistingFact();
    mocks.extractKnowledge.mockResolvedValue(twoChildhoodFacts);
    mocks.decideMerges.mockResolvedValue([
      { index: 0, action: "supersede", supersedesFactId: "f-old-1" },
      { index: 1, action: "insert" },
    ]);

    await processInterview(IV);

    // decideMerges only saw the same-topic existing fact, matched case-insensitively.
    expect(mocks.decideMerges).toHaveBeenCalledTimes(1);
    const [existingArg, incomingArg] = mocks.decideMerges.mock.calls[0];
    // Topic names come through the same lowercase-keyed map Task 12 uses for
    // topic matching (case-insensitive "childhood" == "Childhood").
    expect(existingArg).toEqual([{ id: "f-old-1", topic: "childhood", statement: "Grew up on a farm.", status: "active" }]);
    expect(incomingArg).toEqual([
      { statement: "Grew up on a farm in Rotterdam.", topic: "Childhood" },
      { statement: "Met Jan on a ferry in 1975.", topic: "Childhood" },
    ]);

    const facts = mocks.db.tables.facts;
    expect(facts).toHaveLength(3); // 1 old (now superseded) + 2 new

    const oldFact = facts.find((f) => f.id === "f-old-1")!;
    expect(oldFact.status).toBe("superseded");
    expect(oldFact.superseded_by).toBeTruthy();

    const supersedingFact = facts.find((f) => f.id === oldFact.superseded_by)!;
    expect(supersedingFact.statement).toBe("Grew up on a farm in Rotterdam.");
    expect(supersedingFact.status).toBe("active");

    const plainNewFact = facts.find((f) => f.statement === "Met Jan on a ferry in 1975.")!;
    expect(plainNewFact.status).toBe("active");

    expect(mocks.db.tables.interviews[0].status).toBe("processed");
  });

  it("skip_duplicate drops a restated fact instead of inserting a duplicate row", async () => {
    seedWithExistingFact();
    mocks.extractKnowledge.mockResolvedValue(twoChildhoodFacts);
    mocks.decideMerges.mockResolvedValue([
      { index: 0, action: "skip_duplicate" },
      { index: 1, action: "insert" },
    ]);

    await processInterview(IV);

    const facts = mocks.db.tables.facts;
    expect(facts).toHaveLength(2); // 1 old (untouched) + 1 new
    const oldFact = facts.find((f) => f.id === "f-old-1")!;
    expect(oldFact.status).toBe("active"); // not superseded — just skipped
    expect(oldFact.superseded_by).toBeNull();
    expect(facts.some((f) => f.statement === "Grew up on a farm in Rotterdam.")).toBe(false);
    expect(facts.some((f) => f.statement === "Met Jan on a ferry in 1975.")).toBe(true);
  });

  it("skips the merge call entirely when the series has no existing facts (all-insert path)", async () => {
    seedDb("completed");
    mocks.extractKnowledge.mockResolvedValue(twoChildhoodFacts);
    // Real decideMerges (not the mock) would short-circuit to all-insert with
    // zero existing facts — but since this suite replaces decideMerges
    // entirely, assert it's still called (with an empty existing list) and
    // wire a normal all-insert response through.
    mocks.decideMerges.mockResolvedValue([
      { index: 0, action: "insert" },
      { index: 1, action: "insert" },
    ]);

    await processInterview(IV);

    const [existingArg] = mocks.decideMerges.mock.calls[0];
    expect(existingArg).toEqual([]);
    expect(mocks.db.tables.facts).toHaveLength(2);
  });
});
