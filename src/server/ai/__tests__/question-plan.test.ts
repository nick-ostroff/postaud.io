import { describe, it, expect, vi } from "vitest";
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn(async () => ({
  content: [{ type: "tool_use", name: "question_plan", input: { questions: ["q1","q2","q3","q4","q5"] } }],
})) } })) }));
import { draftQuestionPlan } from "../question-plan";
it("returns the drafted questions", async () => {
  const qs = await draftQuestionPlan({ title: "Dad's Story", subjectName: "Henk",
    subjectRelationship: "My father", goal: "Capture Dad's whole life", mustCover: ["Childhood"], tone: "warm" });
  expect(qs).toHaveLength(5);
});
