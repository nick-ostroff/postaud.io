import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable holder so each test can control the mocked SDK's create() behavior
// and inspect what was sent to it (mirrors question-plan.test.ts's pattern).
const mockState = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockState.create } })),
}));

import { extractKnowledge } from "../extract";
import type { ExtractKnowledgeInput } from "../extract";

function toolUseResponse(input: unknown) {
  return { content: [{ type: "tool_use", name: "submit_knowledge_extraction", input }] };
}

const validExtraction = {
  summary: {
    short: "A lovely first session about childhood summers.",
    long: "Henk talked warmly about the summers he spent at his grandparents' farm, recalling specific smells and sounds.",
    bullets: ["Grew up visiting a farm", "Met Jan on a ferry", "Loved the smell of hay"],
  },
  facts: [
    {
      statement: "Met Jan, spring 1975, on the Hoek van Holland ferry.",
      topic: "Childhood",
      confidence: 0.9,
      sourceMessageId: "msg-2",
      entities: [
        { kind: "person", name: "Jan" },
        { kind: "place", name: "Hoek van Holland" },
      ],
    },
  ],
  suggestedTopics: [{ name: "Life at sea", description: "He mentioned sailing often — worth a full session." }],
  coverage: [{ topic: "Childhood", score: 0.6 }],
};

const input: ExtractKnowledgeInput = {
  seriesGoal: "Capture Henk's whole life story",
  subjectName: "Henk",
  topics: [{ name: "Childhood", description: "Early years" }],
  transcript: [
    { id: "msg-1", role: "interviewer", text: "Tell me about your childhood.", tOffsetSec: 0 },
    { id: "msg-2", role: "subject", text: "I met Jan on the ferry in 1975.", tOffsetSec: 12 },
  ],
};

describe("extractKnowledge", () => {
  beforeEach(() => {
    mockState.create.mockReset();
  });

  it("parses a valid tool_use payload and passes sourceMessageId through", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    const result = await extractKnowledge(input);

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].sourceMessageId).toBe("msg-2");
    expect(result.facts[0].entities).toEqual([
      { kind: "person", name: "Jan" },
      { kind: "place", name: "Hoek van Holland" },
    ]);
    expect(result.summary.bullets).toHaveLength(3);
    expect(result.suggestedTopics[0].name).toBe("Life at sea");
    expect(result.coverage[0]).toEqual({ topic: "Childhood", score: 0.6 });
    expect(mockState.create).toHaveBeenCalledTimes(1);
  });

  it("numbers transcript lines by message id in the prompt sent to the model", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    await extractKnowledge(input);

    const sentPrompt = mockState.create.mock.calls[0][0].messages[0].content as string;
    expect(sentPrompt).toContain("[msg-1] INTERVIEWER: Tell me about your childhood.");
    expect(sentPrompt).toContain("[msg-2] SUBJECT: I met Jan on the ferry in 1975.");
  });

  it("does not pass temperature/top_p/top_k to the model", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    await extractKnowledge(input);

    const args = mockState.create.mock.calls[0][0];
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("top_p");
    expect(args).not.toHaveProperty("top_k");
  });

  it("retries exactly once when the first response fails schema validation, then succeeds", async () => {
    const malformed = { ...validExtraction, facts: [{ statement: "no other required fields" }] };
    mockState.create.mockResolvedValueOnce(toolUseResponse(malformed));
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    const result = await extractKnowledge(input);

    expect(mockState.create).toHaveBeenCalledTimes(2);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].statement).toBe("Met Jan, spring 1975, on the Hoek van Holland ferry.");
  });

  it("throws if both the first response and the retry fail schema validation", async () => {
    const malformed = { ...validExtraction, facts: [{ statement: "no other required fields" }] };
    mockState.create.mockResolvedValueOnce(toolUseResponse(malformed));
    mockState.create.mockResolvedValueOnce(toolUseResponse(malformed));

    await expect(extractKnowledge(input)).rejects.toThrow(/schema/i);
    expect(mockState.create).toHaveBeenCalledTimes(2);
  });

  it("treats a response with no tool_use block as a parse failure and retries once", async () => {
    mockState.create.mockResolvedValueOnce({ content: [{ type: "text", text: "sorry, I can't do that" }] });
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    const result = await extractKnowledge(input);

    expect(mockState.create).toHaveBeenCalledTimes(2);
    expect(result.facts).toHaveLength(1);
  });

  it("appends opts.extraInstruction to the prompt (invariant-guard retry hook)", async () => {
    mockState.create.mockResolvedValueOnce(toolUseResponse(validExtraction));

    await extractKnowledge(input, { extraInstruction: "You must extract at least one fact." });

    const sentPrompt = mockState.create.mock.calls[0][0].messages[0].content as string;
    expect(sentPrompt).toContain("You must extract at least one fact.");
  });
});
