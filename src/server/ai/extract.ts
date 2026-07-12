import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "./anthropic";

const MODEL = "claude-sonnet-5";
const TOOL_NAME = "submit_knowledge_extraction";

export interface ExtractTranscriptLine {
  id: string;
  role: string;
  text: string;
  tOffsetSec: number | null;
}

export interface ExtractTopic {
  name: string;
  description?: string;
}

export interface ExtractKnowledgeInput {
  seriesGoal: string;
  subjectName: string;
  topics: ExtractTopic[];
  transcript: ExtractTranscriptLine[];
}

/** Extra one-off instruction appended to the prompt, e.g. the invariant-guard retry. */
export interface ExtractKnowledgeOpts {
  extraInstruction?: string;
}

const factEntitySchema = z.object({
  kind: z.enum(["person", "place", "org", "event", "date"]),
  name: z.string().trim().min(1),
});

const factSchema = z.object({
  statement: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  sourceMessageId: z.string().trim().min(1).nullable(),
  entities: z.array(factEntitySchema).default([]),
});

const suggestedTopicSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

const coverageSchema = z.object({
  topic: z.string().trim().min(1),
  score: z.number().min(0).max(1),
});

const extractionSchema = z.object({
  summary: z.object({
    short: z.string().trim().min(1),
    long: z.string().trim().min(1),
    bullets: z.array(z.string().trim().min(1)).min(1),
  }),
  facts: z.array(factSchema).default([]),
  suggestedTopics: z.array(suggestedTopicSchema).default([]),
  coverage: z.array(coverageSchema).default([]),
});

export type Extraction = z.infer<typeof extractionSchema>;

const toolInputSchema: Anthropic.Messages.Tool["input_schema"] = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      description: "A warm recap of this single session, written for the person who just finished it.",
      properties: {
        short: {
          type: "string",
          description: "1-2 warm sentences, the very first thing the interviewee reads on their recap page.",
        },
        long: {
          type: "string",
          description: "A fuller paragraph recapping what was discussed this session.",
        },
        bullets: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 3,
          description: "Exactly 3 short highlight bullets from this session.",
        },
      },
      required: ["short", "long", "bullets"],
    },
    facts: {
      type: "array",
      description: "Atomic, self-contained facts extracted from the subject's answers only.",
      items: {
        type: "object",
        properties: {
          statement: {
            type: "string",
            description:
              'One atomic, past-tense, self-contained claim or event — e.g. "Met Jan, spring 1975, on the Hoek van Holland ferry." No question restatement, no filler, no merged unrelated events.',
          },
          topic: {
            type: "string",
            description:
              "The best-fitting topic name for this fact — reuse an existing topic name exactly when it fits, otherwise propose a short, well-scoped new topic name.",
          },
          confidence: {
            type: "number",
            description: "0 to 1: how directly and unambiguously the subject stated this.",
          },
          sourceMessageId: {
            type: ["string", "null"],
            description:
              "The exact bracketed message id shown before the subject's line this fact came from, or null if it can't be tied to one line.",
          },
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["person", "place", "org", "event", "date"] },
                name: { type: "string" },
              },
              required: ["kind", "name"],
            },
          },
        },
        required: ["statement", "topic", "confidence", "sourceMessageId", "entities"],
      },
    },
    suggestedTopics: {
      type: "array",
      description: "2-3 ideas worth exploring in a FUTURE session, phrased as topics/themes, not questions.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: 'A topic name/theme, e.g. "Early years in Rotterdam" — not a question.' },
          description: { type: "string", description: "One sentence on why this is worth a future session." },
        },
        required: ["name", "description"],
      },
    },
    coverage: {
      type: "array",
      description:
        "For every topic in the existing topic list (plus any new topic you introduced on a fact above), how well THIS session covered it.",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          score: { type: "number", description: "0 (not touched) to 1 (thoroughly covered) this session." },
        },
        required: ["topic", "score"],
      },
    },
  },
  required: ["summary", "facts", "suggestedTopics", "coverage"],
};

function formatRole(role: string): string {
  return role.toUpperCase();
}

function buildPrompt(input: ExtractKnowledgeInput, extraNotes: string[]): string {
  const topicList =
    input.topics.length > 0
      ? input.topics.map((t) => (t.description ? `- ${t.name}: ${t.description}` : `- ${t.name}`)).join("\n")
      : "- No topics defined yet — use your judgment to name topics as they come up.";

  const transcriptLines = input.transcript
    .map((line) => `[${line.id}] ${formatRole(line.role)}: ${line.text}`)
    .join("\n");

  const notes = extraNotes.length > 0 ? `\nIMPORTANT:\n${extraNotes.map((n) => `- ${n}`).join("\n")}\n` : "";

  return [
    "You are Anna's knowledge-extraction pass — the step that runs right after an oral-history interview",
    "session ends. Your job is to permanently add to this subject's knowledge base from what was just said,",
    "and to warmly summarize the session for the person who just finished it.",
    "",
    `Subject: ${input.subjectName}`,
    `Series goal: ${input.seriesGoal}`,
    "",
    "Existing topics for this series:",
    topicList,
    "",
    "Full transcript for this session, each line prefixed with its message id:",
    transcriptLines,
    "",
    "--- What makes a good atomic fact ---",
    "Each fact must be ONE clear event or claim, written in past tense, specific, and self-contained —",
    'readable on its own with no surrounding context. Example: "Met Jan, spring 1975, on the Hoek van',
    'Holland ferry." Do not restate the interviewer\'s question. Do not include filler or hedging. Do not',
    "merge multiple unrelated events into a single fact — split them into separate facts instead. Do not",
    "fabricate specifics (names, dates, places) the subject didn't actually say. Only extract facts from",
    "the SUBJECT's own lines, not the interviewer's.",
    "",
    "For each fact, assign the single best-fitting topic: reuse an existing topic name exactly when it",
    "fits, or otherwise propose the best new topic name (short, in the same style as the existing list).",
    "",
    "Extract every person, place, organization, event, and date entity referenced by a fact, classified by",
    "kind. Cite each fact's sourceMessageId using the exact bracketed id shown before the subject's line it",
    "came from, or null if it genuinely can't be tied to one line.",
    "",
    "Write a warm 1-2 sentence short summary, a fuller long paragraph, and exactly 3 highlight bullets for",
    "this session. Then suggest 2-3 topics/themes (not questions) worth exploring in a future session.",
    "Finally, score coverage (0 to 1) for every existing topic plus any new topic you introduced above,",
    "reflecting how well THIS session covered it.",
    notes,
    `Call the ${TOOL_NAME} tool with your results.`,
  ].join("\n");
}

async function callModel(prompt: string): Promise<unknown> {
  const client = anthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // No sampling params: claude-sonnet-5 returns 400 for non-default
    // temperature/top_p/top_k. Precision comes from the prompt + forced schema.
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit the extracted facts, entities, summary, suggested future topics, and coverage scores.",
        input_schema: toolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
  );
  return toolUse?.input;
}

/**
 * Extracts facts/entities/summary/coverage from one interview's transcript via
 * a forced tool call. One retry on schema-parse failure (malformed or missing
 * tool_use input) — if the retry also fails to parse, throws.
 *
 * `opts.extraInstruction` lets callers (the invariant guard in
 * `processInterview`) append a one-off instruction, e.g. to force at least
 * one fact out of a transcript that clearly has content.
 */
export async function extractKnowledge(
  input: ExtractKnowledgeInput,
  opts: ExtractKnowledgeOpts = {},
): Promise<Extraction> {
  const baseNotes = opts.extraInstruction ? [opts.extraInstruction] : [];

  const first = await callModel(buildPrompt(input, baseNotes));
  const firstParsed = extractionSchema.safeParse(first);
  if (firstParsed.success) return firstParsed.data;

  const retryNotes = [
    ...baseNotes,
    "Your previous response did not match the required tool schema exactly. Re-read the schema carefully " +
      "and call the tool again with strictly valid input — every required field present and correctly typed.",
  ];
  const second = await callModel(buildPrompt(input, retryNotes));
  const secondParsed = extractionSchema.safeParse(second);
  if (secondParsed.success) return secondParsed.data;

  throw new Error("extractKnowledge: model response did not match the expected schema after one retry");
}
