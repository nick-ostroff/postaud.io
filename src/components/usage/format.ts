import type { UsageModelGroup } from "@/server/usage/pricing";

/**
 * Shared display formatting for the interview_usage ledger — used by the
 * session results page's UsageCard and the series settings Activity card.
 * Pure string helpers; all arithmetic stays in server/usage/pricing.ts.
 */

/** Phase-agnostic human label per provider — a group can span multiple
 * phases (e.g. anthropic covers both "extract" and "merge" rows summed
 * together), so the label names the capability, not a specific phase. */
export function providerLabel(provider: string): string {
  if (provider === "openai_realtime") return "Voice conversation";
  if (provider === "anthropic") return "Knowledge extraction";
  return provider;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Talk time down to the second ("45 sec", "4 min 12 sec", "1 hr 5 min 12 sec") — hours once it earns them. */
export function fmtTalkTime(sec: number): string {
  const whole = Math.max(0, Math.round(sec));
  if (whole === 0) return "0 sec";
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hr`);
  if (m) parts.push(`${m} min`);
  if (s) parts.push(`${s} sec`);
  return parts.join(" ");
}

export function fmtUsd(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

/** "audio 1.2k in / text 300 in / cached 0 in / audio 800 out / text 40 out" style breakdown. */
export function realtimeBreakdown(g: UsageModelGroup): string {
  return [
    `${fmtInt(g.audioInputTokens)} audio in`,
    `${fmtInt(g.textInputTokens)} text in`,
    `${fmtInt(g.cachedInputTokens)} cached in`,
    `${fmtInt(g.audioOutputTokens)} audio out`,
    `${fmtInt(g.textOutputTokens)} text out`,
  ].join(" · ");
}

export function anthropicBreakdown(g: UsageModelGroup): string {
  const plainInput = Math.max(0, g.inputTokens - g.cacheReadInputTokens - g.cacheCreationInputTokens);
  return [
    `${fmtInt(plainInput)} input`,
    `${fmtInt(g.cacheReadInputTokens)} cache read`,
    `${fmtInt(g.cacheCreationInputTokens)} cache write`,
    `${fmtInt(g.outputTokens)} output`,
  ].join(" · ");
}
