import type { SeriesTone } from "@/db/types";
import { anthropicClient } from "./anthropic";

export interface QuestionPlanInput {
  title: string;
  subjectName: string;
  subjectRelationship?: string;
  goal: string;
  openingPrompt?: string;
  mustCover: string[];
  tone: SeriesTone;
}

const MODEL = "claude-sonnet-5";

function buildPrompt(input: QuestionPlanInput): string {
  const relationship = input.subjectRelationship ? ` (${input.subjectRelationship})` : "";
  const mustCoverList =
    input.mustCover.length > 0
      ? input.mustCover.map((topic) => `- ${topic}`).join("\n")
      : "- No specific topics were flagged — use your judgment based on the goal.";

  return [
    "You are Anna, a warm, skilled spoken-word interviewer conducting a recorded oral-history",
    "interview. You are drafting the opening question plan for the very first session of a new",
    "interview series — before you've spoken with the subject at all.",
    "",
    `Series title: ${input.title}`,
    `Subject: ${input.subjectName}${relationship}`,
    `Goal for this series: ${input.goal}`,
    `Tone to strike: ${input.tone}`,
    "",
    "Topics that must be covered across this series (not necessarily all in one session):",
    mustCoverList,
    "",
    input.openingPrompt
      ? `The interviewer has a specific opening line or prompt to start the session with: "${input.openingPrompt}". Your first drafted question should follow naturally from that opening — a warm, easy on-ramp, not a repeat of it.`
      : "There is no fixed opening prompt — your first question should be a warm, easy on-ramp into the conversation.",
    "",
    "Draft 5 to 7 questions for this first session. Each question should:",
    "- Be written in plain, spoken English, exactly as Anna would say it out loud",
    "- Contain no numbering, labels, or bullet punctuation — just the sentence(s) Anna would speak",
    "- Move from easy and welcoming toward more specific and reflective",
    "- Reflect the tone, goal, and must-cover topics above",
    "",
    "Call the question_plan tool with your drafted questions.",
  ].join("\n");
}

/**
 * Drafts 5–7 opening-session interview questions for Anna to ask, using a
 * forced tool call so the model's output parses directly into a string array.
 */
export async function draftQuestionPlan(input: QuestionPlanInput): Promise<string[]> {
  const client = anthropicClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // No sampling params: claude-sonnet-5 returns 400 for non-default
    // temperature/top_p/top_k. Variety is steered via the prompt instead.
    tools: [
      {
        name: "question_plan",
        description: "Submit the drafted first-session opening question plan.",
        input_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
              minItems: 5,
              maxItems: 7,
              description: "5 to 7 opening-session questions, in plain spoken English, no numbering.",
            },
          },
          required: ["questions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "question_plan" },
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
  );
  const questions = (toolUse?.input as { questions?: unknown } | undefined)?.questions;
  if (!Array.isArray(questions)) {
    throw new Error("Anna's question plan response did not include a question list.");
  }
  return questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
}
