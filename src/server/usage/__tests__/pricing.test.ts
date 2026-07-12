import { describe, expect, it } from "vitest";
import type { InterviewUsage } from "@/db/types";
import { RATES, estimateRowCost, estimateRowCostUsd, summarizeUsage } from "../pricing";

/**
 * Builds a fully-populated interview_usage row for tests, all detail
 * columns defaulting to null (the shape a bare input/output-only row has)
 * so each test only sets the columns it cares about.
 */
function makeRow(overrides: Partial<InterviewUsage> & Pick<InterviewUsage, "provider" | "model">): InterviewUsage {
  return {
    id: "row-1",
    interview_id: "iv-1",
    organization_id: "org-1",
    phase: "interview",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    audio_input_tokens: null,
    text_input_tokens: null,
    cached_input_tokens: null,
    audio_output_tokens: null,
    text_output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    raw: {},
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("estimateRowCost — anthropic", () => {
  it("prices input/output at the model's published rate", () => {
    const row = makeRow({
      provider: "anthropic",
      model: "claude-sonnet-5",
      input_tokens: 1000,
      output_tokens: 500,
    });
    const rates = RATES.anthropic["claude-sonnet-5"];
    const expected = (1000 / 1_000_000) * rates.input + (500 / 1_000_000) * rates.output;
    expect(estimateRowCostUsd(row)).toBeCloseTo(expected, 10);
  });

  it("prices cache_read and cache_creation tokens at their own rates without double-counting them inside input_tokens", () => {
    // Our anthropic rows store input_tokens as the FULL input including
    // cached portions — cache_read (200) and cache_creation (100) are a
    // subset of the 1000, so the "plain" input priced at the input rate
    // must be 1000 - 200 - 100 = 700, not the full 1000.
    const row = makeRow({
      provider: "anthropic",
      model: "claude-sonnet-5",
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 100,
    });
    const rates = RATES.anthropic["claude-sonnet-5"];
    const expected =
      (700 / 1_000_000) * rates.input +
      (200 / 1_000_000) * rates.cacheRead +
      (100 / 1_000_000) * rates.cacheWrite5m +
      (500 / 1_000_000) * rates.output;
    const result = estimateRowCost(row);
    expect(result.costUsd).toBeCloseTo(expected, 10);
    expect(result.isUnknownModel).toBe(false);
    expect(result.isCoarse).toBe(false);
  });

  it("falls back to the anthropic family default rate for an unrecognized claude-sonnet-5 variant string", () => {
    const known = makeRow({ provider: "anthropic", model: "claude-sonnet-5", input_tokens: 900, output_tokens: 300 });
    const variant = makeRow({
      provider: "anthropic",
      model: "claude-sonnet-5-20260701",
      input_tokens: 900,
      output_tokens: 300,
    });
    const knownResult = estimateRowCost(known);
    const variantResult = estimateRowCost(variant);
    expect(variantResult.costUsd).toBeCloseTo(knownResult.costUsd, 10);
    expect(variantResult.isUnknownModel).toBe(false);
  });
});

describe("estimateRowCost — openai_realtime", () => {
  it("prices each detail column (audio/text in, cached in, audio/text out) at its own rate", () => {
    const row = makeRow({
      provider: "openai_realtime",
      model: "gpt-realtime",
      phase: "interview",
      audio_input_tokens: 1000,
      text_input_tokens: 500,
      cached_input_tokens: 200,
      audio_output_tokens: 300,
      text_output_tokens: 100,
      input_tokens: 1700,
      output_tokens: 400,
      total_tokens: 2100,
    });
    const rates = RATES.openai_realtime["gpt-realtime"];
    const expected =
      (1000 / 1_000_000) * rates.audioInput +
      (500 / 1_000_000) * rates.textInput +
      (200 / 1_000_000) * rates.cachedAudioInput +
      (300 / 1_000_000) * rates.audioOutput +
      (100 / 1_000_000) * rates.textOutput;
    const result = estimateRowCost(row);
    expect(result.costUsd).toBeCloseTo(expected, 10);
    expect(result.isCoarse).toBe(false);
    expect(result.isUnknownModel).toBe(false);
  });

  it("falls back to a blended coarse rate and flags the row when detail columns are all null", () => {
    const row = makeRow({
      provider: "openai_realtime",
      model: "gpt-realtime",
      input_tokens: 1000,
      output_tokens: 400,
      total_tokens: 1400,
      // all detail columns left null (the makeRow default)
    });
    const rates = RATES.openai_realtime["gpt-realtime"];
    const blendedInput = (rates.audioInput + rates.textInput) / 2;
    const blendedOutput = (rates.audioOutput + rates.textOutput) / 2;
    const expected = (1000 / 1_000_000) * blendedInput + (400 / 1_000_000) * blendedOutput;
    const result = estimateRowCost(row);
    expect(result.costUsd).toBeCloseTo(expected, 10);
    expect(result.isCoarse).toBe(true);
    expect(result.isUnknownModel).toBe(false);
  });
});

describe("estimateRowCost — unknown provider", () => {
  it("returns 0 cost and marks the row unknown rather than guessing", () => {
    const row = makeRow({
      provider: "some_future_provider",
      model: "mystery-model",
      input_tokens: 5000,
      output_tokens: 2000,
    });
    const result = estimateRowCost(row);
    expect(result.costUsd).toBe(0);
    expect(result.isUnknownModel).toBe(true);
  });
});

describe("summarizeUsage", () => {
  it("sums exact token columns across multiple append-only rows for the same (provider, model)", () => {
    const rows: InterviewUsage[] = [
      makeRow({
        id: "r1",
        provider: "anthropic",
        model: "claude-sonnet-5",
        phase: "extract",
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      }),
      makeRow({
        id: "r2",
        provider: "anthropic",
        model: "claude-sonnet-5",
        phase: "extract",
        input_tokens: 80,
        output_tokens: 40,
        total_tokens: 120,
      }),
      makeRow({
        id: "r3",
        provider: "anthropic",
        model: "claude-sonnet-5",
        phase: "merge",
        input_tokens: 30,
        output_tokens: 15,
        total_tokens: 45,
      }),
    ];

    const summary = summarizeUsage(rows);

    expect(summary.byModel).toHaveLength(1);
    const group = summary.byModel[0];
    expect(group.provider).toBe("anthropic");
    expect(group.model).toBe("claude-sonnet-5");
    // Exact sums — no rounding/derivation, straight ledger addition.
    expect(group.inputTokens).toBe(210); // 100 + 80 + 30
    expect(group.outputTokens).toBe(105); // 50 + 40 + 15
    expect(group.totalTokens).toBe(315); // 150 + 120 + 45
    expect(summary.totalTokens).toBe(315);
  });

  it("groups separately by (provider, model) and totals cost across groups", () => {
    const rows: InterviewUsage[] = [
      makeRow({
        id: "r1",
        provider: "openai_realtime",
        model: "gpt-realtime",
        phase: "interview",
        audio_input_tokens: 1000,
        audio_output_tokens: 300,
        input_tokens: 1000,
        output_tokens: 300,
        total_tokens: 1300,
      }),
      makeRow({
        id: "r2",
        provider: "anthropic",
        model: "claude-sonnet-5",
        phase: "extract",
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
      }),
    ];

    const summary = summarizeUsage(rows);
    expect(summary.byModel).toHaveLength(2);
    expect(summary.totalTokens).toBe(2800);

    const expectedTotal = summary.byModel.reduce((sum, g) => sum + g.costUsd, 0);
    expect(summary.totalCostUsd).toBeCloseTo(expectedTotal, 10);
    expect(summary.hasUnknownRates).toBe(false);
    expect(summary.hasCoarseRows).toBe(false);
  });

  it("flags hasUnknownRates when any row's provider has no rate on file, without throwing", () => {
    const rows: InterviewUsage[] = [
      makeRow({ provider: "anthropic", model: "claude-sonnet-5", input_tokens: 100, output_tokens: 50, total_tokens: 150 }),
      makeRow({ provider: "some_future_provider", model: "mystery", input_tokens: 999, output_tokens: 999, total_tokens: 1998 }),
    ];
    const summary = summarizeUsage(rows);
    expect(summary.hasUnknownRates).toBe(true);
    // The unknown row's exact tokens still count toward the total — only its
    // dollar contribution is withheld (0), never a fabricated cost.
    expect(summary.totalTokens).toBe(2148);
  });

  it("flags hasCoarseRows when a realtime row has no detail columns", () => {
    const rows: InterviewUsage[] = [
      makeRow({
        provider: "openai_realtime",
        model: "gpt-realtime",
        input_tokens: 1000,
        output_tokens: 400,
        total_tokens: 1400,
      }),
    ];
    const summary = summarizeUsage(rows);
    expect(summary.hasCoarseRows).toBe(true);
  });

  it("returns an empty, zeroed summary for zero rows", () => {
    const summary = summarizeUsage([]);
    expect(summary.byModel).toHaveLength(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.hasUnknownRates).toBe(false);
    expect(summary.hasCoarseRows).toBe(false);
  });
});
