import type { InterviewUsage } from "@/db/types";

/**
 * PUBLISHED-RATE ESTIMATES — edit here to correct; token counts elsewhere
 * (interview_usage) are exact, as reported by the provider. Everything in
 * this file is a dollar *estimate* derived from a rate card we maintain by
 * hand — never present a number computed here as billed truth.
 */
export const RATES_UPDATED = "2026-07-12";

export type AnthropicRates = {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
};

export type RealtimeRates = {
  audioInput: number;
  audioOutput: number;
  textInput: number;
  textOutput: number;
  cachedAudioInput: number;
  cachedTextInput: number;
};

/** USD per million tokens. */
export const RATES = {
  anthropic: {
    // Standard (post-intro) published rates as of RATES_UPDATED. Anthropic's
    // intro pricing runs lower through 2026-08-31 — we deliberately use the
    // standard rate as the safe default so this estimate doesn't understate
    // what the bill becomes once intro pricing ends.
    "claude-sonnet-5": { input: 3.0, output: 15.0, cacheWrite5m: 3.75, cacheRead: 0.3 },
  },
  openai_realtime: {
    // Verified against developers.openai.com/api/docs/pricing on RATES_UPDATED.
    // The "gpt-realtime" alias resolves to gpt-realtime-2.1; these are its rates.
    // Re-check if OpenAI revises Realtime pricing.
    "gpt-realtime": {
      audioInput: 32.0,
      audioOutput: 64.0,
      textInput: 4.0,
      textOutput: 24.0,
      cachedAudioInput: 0.4,
      cachedTextInput: 0.4,
    },
  },
} satisfies {
  anthropic: Record<string, AnthropicRates>;
  openai_realtime: Record<string, RealtimeRates>;
};

/** Family-default model to fall back to when a row's exact model string
 * isn't a key in RATES for its provider (e.g. a dated/variant model id) —
 * this is a best-effort match, not a claim that the model is identical. */
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-5";
const REALTIME_FALLBACK_MODEL = "gpt-realtime";

function usd(ratePerMillion: number, tokens: number): number {
  return (ratePerMillion / 1_000_000) * tokens;
}

export type CostEstimate = {
  costUsd: number;
  /** True when the row's provider has no rate card on file at all — costUsd is 0, never guessed. */
  isUnknownModel: boolean;
  /** True when a realtime row had no audio/text detail columns and was priced off a blended input/output rate. */
  isCoarse: boolean;
};

/**
 * Estimates one ledger row's dollar cost from its EXACT token columns and
 * the RATES table. Every arithmetic input is a real column off the row —
 * nothing here is invented. See per-provider comments below for exactly
 * which columns feed which rate.
 */
export function estimateRowCost(row: InterviewUsage): CostEstimate {
  if (row.provider === "anthropic") {
    const rates = RATES.anthropic[row.model as keyof typeof RATES.anthropic] ?? RATES.anthropic[ANTHROPIC_FALLBACK_MODEL];
    // Our anthropic rows store input_tokens as the FULL input, cache reads
    // and cache writes included — price those two slices at their own
    // (cheaper) rates and the remainder at the plain input rate so no
    // token is billed twice.
    const cacheRead = row.cache_read_input_tokens ?? 0;
    const cacheCreation = row.cache_creation_input_tokens ?? 0;
    const plainInput = Math.max(0, row.input_tokens - cacheRead - cacheCreation);
    const costUsd =
      usd(rates.input, plainInput) +
      usd(rates.cacheRead, cacheRead) +
      usd(rates.cacheWrite5m, cacheCreation) +
      usd(rates.output, row.output_tokens);
    return { costUsd, isUnknownModel: false, isCoarse: false };
  }

  if (row.provider === "openai_realtime") {
    const rates =
      RATES.openai_realtime[row.model as keyof typeof RATES.openai_realtime] ?? RATES.openai_realtime[REALTIME_FALLBACK_MODEL];
    const hasDetail =
      row.audio_input_tokens != null ||
      row.text_input_tokens != null ||
      row.cached_input_tokens != null ||
      row.audio_output_tokens != null ||
      row.text_output_tokens != null;

    if (hasDetail) {
      const costUsd =
        usd(rates.audioInput, row.audio_input_tokens ?? 0) +
        usd(rates.textInput, row.text_input_tokens ?? 0) +
        usd(rates.cachedAudioInput, row.cached_input_tokens ?? 0) +
        usd(rates.audioOutput, row.audio_output_tokens ?? 0) +
        usd(rates.textOutput, row.text_output_tokens ?? 0);
      return { costUsd, isUnknownModel: false, isCoarse: false };
    }

    // No audio/text split reported for this row — fall back to a blended
    // in/out rate over the coarse input_tokens/output_tokens totals and
    // flag it so the UI can note the estimate is rougher than usual.
    const blendedInput = (rates.audioInput + rates.textInput) / 2;
    const blendedOutput = (rates.audioOutput + rates.textOutput) / 2;
    const costUsd = usd(blendedInput, row.input_tokens) + usd(blendedOutput, row.output_tokens);
    return { costUsd, isUnknownModel: false, isCoarse: true };
  }

  // Provider we have no rate card for at all — refuse to guess a dollar
  // amount; the caller surfaces this row's tokens with cost shown as "—".
  return { costUsd: 0, isUnknownModel: true, isCoarse: false };
}

/** Convenience wrapper over `estimateRowCost` for callers that only need the dollar figure. */
export function estimateRowCostUsd(row: InterviewUsage): number {
  return estimateRowCost(row).costUsd;
}

export type UsageModelGroup = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioInputTokens: number;
  textInputTokens: number;
  cachedInputTokens: number;
  audioOutputTokens: number;
  textOutputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
  isUnknownModel: boolean;
  isCoarse: boolean;
};

export type UsageSummary = {
  byModel: UsageModelGroup[];
  totalTokens: number;
  totalCostUsd: number;
  hasUnknownRates: boolean;
  hasCoarseRows: boolean;
};

/**
 * Groups the append-only interview_usage ledger by (provider, model),
 * SUMs every token column verbatim across rows (multiple rows per
 * interview/provider/phase are expected — e.g. extract + merge, or a
 * forced-retry's extra extract call), and estimates a dollar total per
 * group and overall. Token sums are exact; costUsd figures are estimates.
 */
export function summarizeUsage(rows: InterviewUsage[]): UsageSummary {
  const groups = new Map<string, UsageModelGroup>();

  for (const row of rows) {
    const key = `${row.provider}::${row.model}`;
    const existing = groups.get(key) ?? {
      provider: row.provider,
      model: row.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      audioInputTokens: 0,
      textInputTokens: 0,
      cachedInputTokens: 0,
      audioOutputTokens: 0,
      textOutputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUsd: 0,
      isUnknownModel: false,
      isCoarse: false,
    };

    existing.inputTokens += row.input_tokens;
    existing.outputTokens += row.output_tokens;
    existing.totalTokens += row.total_tokens;
    existing.audioInputTokens += row.audio_input_tokens ?? 0;
    existing.textInputTokens += row.text_input_tokens ?? 0;
    existing.cachedInputTokens += row.cached_input_tokens ?? 0;
    existing.audioOutputTokens += row.audio_output_tokens ?? 0;
    existing.textOutputTokens += row.text_output_tokens ?? 0;
    existing.cacheReadInputTokens += row.cache_read_input_tokens ?? 0;
    existing.cacheCreationInputTokens += row.cache_creation_input_tokens ?? 0;

    const est = estimateRowCost(row);
    existing.costUsd += est.costUsd;
    if (est.isUnknownModel) existing.isUnknownModel = true;
    if (est.isCoarse) existing.isCoarse = true;

    groups.set(key, existing);
  }

  const byModel = Array.from(groups.values());
  const totalTokens = byModel.reduce((sum, g) => sum + g.totalTokens, 0);
  const totalCostUsd = byModel.reduce((sum, g) => sum + g.costUsd, 0);
  const hasUnknownRates = byModel.some((g) => g.isUnknownModel);
  const hasCoarseRows = byModel.some((g) => g.isCoarse);

  return { byModel, totalTokens, totalCostUsd, hasUnknownRates, hasCoarseRows };
}
