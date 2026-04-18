/**
 * Provider-abstracted LLM interface. Swap OpenAI/Anthropic by changing models.ts.
 * See plan/02-technical-spec.md §4–5.
 */

export type CompleteOptions = {
  system?: string;
  prompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export interface AIProvider {
  complete(opts: CompleteOptions): Promise<{ text: string; usage?: { input: number; output: number } }>;
}

class OpenAIProvider implements AIProvider {
  async complete(_opts: CompleteOptions): ReturnType<AIProvider["complete"]> {
    // TODO: implement via `openai` SDK
    throw new Error("OpenAIProvider.complete not implemented");
  }
}

class AnthropicProvider implements AIProvider {
  async complete(_opts: CompleteOptions): ReturnType<AIProvider["complete"]> {
    // TODO: implement via `@anthropic-ai/sdk`
    throw new Error("AnthropicProvider.complete not implemented");
  }
}

export const providers = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
} as const;

export type ProviderName = keyof typeof providers;
