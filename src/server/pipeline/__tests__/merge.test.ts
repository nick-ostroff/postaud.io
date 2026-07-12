import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable holder so each test can control the mocked SDK's create() behavior
// and inspect what was sent to it (mirrors extract.test.ts's pattern).
const mockState = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockState.create } })),
}));

import { applyMergeDecisions, decideMerges } from "../merge";
import type { MergeDecision } from "../merge";

function toolUseResponse(input: unknown) {
  return { content: [{ type: "tool_use", name: "submit_merge_decisions", input }] };
}

// ---------------------------------------------------------------------------
// applyMergeDecisions — pure function, TDD per Task 13 brief.
// ---------------------------------------------------------------------------

describe("applyMergeDecisions", () => {
  const incoming = [{ statement: "a" }, { statement: "b" }, { statement: "c" }];

  it("defaults every item to insert when there are no decisions at all", () => {
    const result = applyMergeDecisions(incoming, []);
    expect(result.toInsert).toHaveLength(3);
    expect(result.toInsert.map((f) => f.statement)).toEqual(["a", "b", "c"]);
    expect(result.skipped).toBe(0);
  });

  it("drops an item decided skip_duplicate and counts it as skipped", () => {
    const decisions: MergeDecision[] = [
      { index: 0, action: "insert" },
      { index: 1, action: "skip_duplicate" },
      { index: 2, action: "insert" },
    ];
    const result = applyMergeDecisions(incoming, decisions);
    expect(result.toInsert.map((f) => f.statement)).toEqual(["a", "c"]);
    expect(result.skipped).toBe(1);
  });

  it("carries supersedesFactId through on a supersede decision", () => {
    const decisions: MergeDecision[] = [
      { index: 0, action: "supersede", supersedesFactId: "fact-old-1" },
      { index: 1, action: "insert" },
      { index: 2, action: "insert" },
    ];
    const result = applyMergeDecisions(incoming, decisions);
    expect(result.toInsert[0]).toEqual({ statement: "a", supersedesFactId: "fact-old-1" });
    expect(result.toInsert[1].supersedesFactId).toBeUndefined();
    expect(result.skipped).toBe(0);
  });

  it("ignores an out-of-range decision index safely, defaulting that item to insert", () => {
    const decisions: MergeDecision[] = [
      { index: 99, action: "skip_duplicate" },
      { index: -1, action: "skip_duplicate" },
      { index: 1, action: "skip_duplicate" },
    ];
    const result = applyMergeDecisions(incoming, decisions);
    // index 1 is a valid in-range skip; 99 and -1 are out of range and ignored
    // (fail-open: the items at 0 and 2 default to insert).
    expect(result.toInsert.map((f) => f.statement)).toEqual(["a", "c"]);
    expect(result.skipped).toBe(1);
  });

  it("fails open on an unrecognized action string, defaulting to insert", () => {
    const decisions = [{ index: 0, action: "delete_everything" as unknown as "insert" }];
    const result = applyMergeDecisions(incoming, decisions);
    expect(result.toInsert.map((f) => f.statement)).toEqual(["a", "b", "c"]);
    expect(result.skipped).toBe(0);
  });

  it("preserves extra fields on the incoming item alongside supersedesFactId", () => {
    const items = [{ statement: "a", topic: "Childhood", index: 7 }];
    const decisions: MergeDecision[] = [{ index: 0, action: "supersede", supersedesFactId: "old-id" }];
    const result = applyMergeDecisions(items, decisions);
    expect(result.toInsert[0]).toEqual({ statement: "a", topic: "Childhood", index: 7, supersedesFactId: "old-id" });
  });
});

// ---------------------------------------------------------------------------
// decideMerges — Claude call, forced tool-use, same-topic comparison only.
// ---------------------------------------------------------------------------

describe("decideMerges", () => {
  beforeEach(() => {
    mockState.create.mockReset();
  });

  it("skips the LLM call entirely when there are no existing facts", async () => {
    const decisions = await decideMerges([], [{ statement: "New fact", topic: "Childhood" }]);
    expect(mockState.create).not.toHaveBeenCalled();
    expect(decisions).toEqual([{ index: 0, action: "insert" }]);
  });

  it("skips the LLM call when no existing facts share a topic with any incoming fact", async () => {
    const decisions = await decideMerges(
      [{ id: "e1", topic: "Career", statement: "Worked at IBM", status: "active" }],
      [{ statement: "New fact", topic: "Childhood" }],
    );
    expect(mockState.create).not.toHaveBeenCalled();
    expect(decisions).toEqual([{ index: 0, action: "insert" }]);
  });

  it("calls the model with only same-topic existing facts and returns its decisions", async () => {
    mockState.create.mockResolvedValueOnce(
      toolUseResponse({
        decisions: [{ index: 0, action: "skip_duplicate" }],
      }),
    );

    const decisions = await decideMerges(
      [
        { id: "e1", topic: "Childhood", statement: "Grew up on a farm.", status: "active" },
        { id: "e2", topic: "Career", statement: "Worked at IBM.", status: "active" },
      ],
      [{ statement: "Grew up on a farm in Rotterdam.", topic: "childhood" }],
    );

    expect(mockState.create).toHaveBeenCalledTimes(1);
    const sentPrompt = mockState.create.mock.calls[0][0].messages[0].content as string;
    expect(sentPrompt).toContain("e1");
    expect(sentPrompt).not.toContain("e2");
    expect(decisions).toEqual([{ index: 0, action: "skip_duplicate" }]);
  });

  it("fails open (inserts everything) when the model response doesn't parse", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse({ garbage: true }));

    const decisions = await decideMerges(
      [{ id: "e1", topic: "Childhood", statement: "Grew up on a farm.", status: "active" }],
      [
        { statement: "Grew up on a farm in Rotterdam.", topic: "Childhood" },
        { statement: "Met Jan on a ferry.", topic: "Childhood" },
      ],
    );

    expect(decisions).toEqual([
      { index: 0, action: "insert" },
      { index: 1, action: "insert" },
    ]);
  });

  it("does not send no sampling params to the model (claude-sonnet-5 400s on those)", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse({ decisions: [] }));
    await decideMerges(
      [{ id: "e1", topic: "Childhood", statement: "x", status: "active" }],
      [{ statement: "y", topic: "Childhood" }],
    );
    const callArgs = mockState.create.mock.calls[0][0];
    expect(callArgs.temperature).toBeUndefined();
    expect(callArgs.top_p).toBeUndefined();
    expect(callArgs.top_k).toBeUndefined();
  });
});
