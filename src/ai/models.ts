import { providers, type ProviderName } from "./provider";

/**
 * Logical model names mapped to provider+model. Change a one-liner to swap.
 */
export const models = {
  "fast-extract":   { provider: "openai" as ProviderName,    model: "gpt-4o-mini",       temperature: 0.2 },
  "followup-score": { provider: "openai" as ProviderName,    model: "gpt-4o-mini",       temperature: 0.1 },
  "followup-gen":   { provider: "openai" as ProviderName,    model: "gpt-4o-mini",       temperature: 0.4 },
  "clean":          { provider: "openai" as ProviderName,    model: "gpt-4o-mini",       temperature: 0.1 },
  "summary":        { provider: "anthropic" as ProviderName, model: "claude-sonnet-4-6", temperature: 0.3 },
  "creative-long":  { provider: "anthropic" as ProviderName, model: "claude-sonnet-4-6", temperature: 0.7 },
} as const;

export type LogicalModel = keyof typeof models;

export function getProvider(name: LogicalModel) {
  const cfg = models[name];
  return { provider: providers[cfg.provider], cfg };
}
