import { it, expect, vi } from "vitest";

// Mutable holder so each test can control what the mocked SDK returns.
const mockState = vi.hoisted(() => ({ questions: ["q1", "q2", "q3", "q4", "q5"] as string[] }));

vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn(async () => ({
  content: [{ type: "tool_use", name: "question_plan", input: { questions: mockState.questions } }],
})) } })) }));
import { draftQuestionPlan } from "../question-plan";
import type { QuestionPlanInput } from "../question-plan";

const input: QuestionPlanInput = {
  title: "Dad's Story",
  subjectName: "Henk",
  subjectRelationship: "My father",
  goal: "Capture Dad's whole life",
  mustCover: ["Childhood"],
  tone: "warm",
};

it("returns the drafted questions", async () => {
  mockState.questions = ["q1", "q2", "q3", "q4", "q5"];
  const qs = await draftQuestionPlan(input);
  expect(qs).toHaveLength(5);
});

it("rejects when the plan comes back too short", async () => {
  mockState.questions = ["q1", "q2"];
  await expect(draftQuestionPlan(input)).rejects.toThrow("question plan came back too short");
});

it("trims an overlong plan to seven questions", async () => {
  mockState.questions = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];
  const qs = await draftQuestionPlan(input);
  expect(qs).toHaveLength(7);
  expect(qs[6]).toBe("q7");
});
