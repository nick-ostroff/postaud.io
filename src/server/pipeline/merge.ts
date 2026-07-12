import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/server/ai/anthropic";

const MODEL = "claude-sonnet-5";
const TOOL_NAME = "submit_merge_decisions";

export type MergeAction = "insert" | "skip_duplicate" | "supersede";

export type MergeDecision = {
  index: number;
  action: MergeAction;
  supersedesFactId?: string;
};

export interface ExistingFactForMerge {
  id: string;
  topic: string;
  statement: string;
  status: string;
}

export interface IncomingFactForMerge {
  statement: string;
  topic: string;
}

const decisionSchema = z.object({
  index: z.number().int(),
  action: z.enum(["insert", "skip_duplicate", "supersede"]),
  supersedesFactId: z.string().trim().min(1).optional(),
});

const responseSchema = z.object({ decisions: z.array(decisionSchema) });

const toolInputSchema: Anthropic.Messages.Tool["input_schema"] = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      description: "Exactly one decision per new fact, indexed 0-based to match the new facts list.",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "0-based index into the new facts list this decision applies to." },
          action: {
            type: "string",
            enum: ["insert", "skip_duplicate", "supersede"],
            description:
              '"insert": genuinely new, not covered by anything existing. "skip_duplicate": the same event/claim ' +
              "as an existing fact, just reworded. \"supersede\": a new detail that refines or contradicts an " +
              "existing fact.",
          },
          supersedesFactId: {
            type: "string",
            description:
              "Required when action is 'supersede': the exact existing fact id (shown in brackets below) being replaced.",
          },
        },
        required: ["index", "action"],
      },
    },
  },
  required: ["decisions"],
};

function allInsert(count: number): MergeDecision[] {
  return Array.from({ length: count }, (_, index) => ({ index, action: "insert" as const }));
}

function buildPrompt(existing: ExistingFactForMerge[], incoming: IncomingFactForMerge[]): string {
  const existingLines = existing.map((f) => `[${f.id}] (${f.topic}) ${f.statement}`).join("\n");
  const incomingLines = incoming.map((f, i) => `[${i}] (${f.topic}) ${f.statement}`).join("\n");

  return [
    "You are merging newly extracted facts into an existing knowledge base for one subject, so knowledge",
    "compounds over sessions instead of duplicating.",
    "",
    "Existing facts already saved (only facts sharing a topic with the new facts below are shown):",
    existingLines,
    "",
    "Newly extracted facts from this session, indexed 0-based:",
    incomingLines,
    "",
    "For EVERY new fact above, decide exactly one action:",
    '- "insert": a genuinely new fact not covered by anything existing.',
    '- "skip_duplicate": the same event/claim as an existing fact, just reworded — adds nothing new.',
    '- "supersede": a new detail that refines or contradicts an existing fact (more specific, corrected, or ',
    "  updated) — carry the existing fact's exact bracketed id as supersedesFactId.",
    "",
    `Call the ${TOOL_NAME} tool with one decision per new fact, index 0 to ${incoming.length - 1}.`,
  ].join("\n");
}

/**
 * Decides insert / skip_duplicate / supersede for each incoming fact against
 * the series' existing knowledge base, so re-processing (or two sessions
 * covering the same ground) compounds knowledge instead of duplicating it.
 *
 * Only existing facts that share a topic (case-insensitive) with at least one
 * incoming fact are sent to the model — keeps the prompt small and lets us
 * skip the LLM call entirely when there's nothing to compare against (a new
 * series, or an incoming batch covering only brand-new topics).
 *
 * Fails open on any unparseable model response: returns all-insert rather
 * than risk silently dropping knowledge.
 */
export async function decideMerges(
  existing: ExistingFactForMerge[],
  incoming: IncomingFactForMerge[],
): Promise<MergeDecision[]> {
  if (incoming.length === 0) return [];

  const relevantTopics = new Set(incoming.map((f) => f.topic.trim().toLowerCase()));
  const candidateExisting = existing.filter((f) => relevantTopics.has(f.topic.trim().toLowerCase()));

  if (candidateExisting.length === 0) return allInsert(incoming.length);

  const client = anthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // No sampling params: claude-sonnet-5 returns 400 for non-default
    // temperature/top_p/top_k. Precision comes from the prompt + forced schema.
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit one merge decision per newly extracted fact.",
        input_schema: toolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildPrompt(candidateExisting, incoming) }],
  });

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
  );
  const parsed = responseSchema.safeParse(toolUse?.input);
  if (!parsed.success) return allInsert(incoming.length);
  return parsed.data.decisions;
}

/**
 * Pure application of merge decisions onto the incoming items — no I/O.
 * Fail-open by construction: any incoming item without a valid, in-range
 * decision (including unrecognized/out-of-range indices, or an unrecognized
 * action) defaults to "insert" so knowledge is never silently dropped.
 */
export function applyMergeDecisions<T>(
  incoming: T[],
  decisions: MergeDecision[],
): { toInsert: (T & { supersedesFactId?: string })[]; skipped: number } {
  const decisionByIndex = new Map<number, MergeDecision>();
  for (const d of decisions) {
    if (Number.isInteger(d.index) && d.index >= 0 && d.index < incoming.length) {
      decisionByIndex.set(d.index, d);
    }
  }

  const toInsert: (T & { supersedesFactId?: string })[] = [];
  let skipped = 0;

  incoming.forEach((item, index) => {
    const decision = decisionByIndex.get(index);

    if (decision?.action === "skip_duplicate") {
      skipped++;
      return;
    }
    if (decision?.action === "supersede") {
      toInsert.push({ ...item, supersedesFactId: decision.supersedesFactId } as T & { supersedesFactId?: string });
      return;
    }
    // No decision, action "insert", or an unrecognized action string — fail open.
    toInsert.push({ ...item } as T & { supersedesFactId?: string });
  });

  return { toInsert, skipped };
}
