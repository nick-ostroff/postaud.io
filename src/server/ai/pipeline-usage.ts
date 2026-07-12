/**
 * Shape reported to the optional `onUsage` callback accepted by
 * `extractKnowledge` (src/server/ai/extract.ts) and `decideMerges`
 * (src/server/pipeline/merge.ts). Every numeric field is copied verbatim from
 * the Anthropic SDK response's `message.usage` — nothing here is estimated or
 * derived. `raw` carries the exact `Anthropic.Messages.Usage` object as
 * received, for audit ground truth (mirrors `interview_usage.raw`).
 */
export type PipelineUsage = {
  model: string;
  phase: "extract" | "merge";
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  raw: unknown;
};

export type OnPipelineUsage = (usage: PipelineUsage) => void;
