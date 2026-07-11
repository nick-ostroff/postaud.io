import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let cached: Anthropic | null = null;

// Unit tests mock the SDK's default export as a plain `vi.fn(() => ({...}))`
// rather than a class, so `new` on it throws (arrow functions aren't
// constructible). The real SDK export IS a class and requires `new`. Try the
// real (constructor) path first and fall back to a plain call only for that
// specific "not a constructor" shape, so production behavior is unaffected.
function instantiate(apiKey: string): Anthropic {
  try {
    return new Anthropic({ apiKey });
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("is not a constructor")) {
      const factory = Anthropic as unknown as (opts: { apiKey: string }) => Anthropic;
      return factory({ apiKey });
    }
    throw err;
  }
}

/**
 * Singleton Anthropic client factory. Throws a clear error at call time
 * (not import time) if ANTHROPIC_API_KEY isn't configured, so routes can
 * surface a clean 500 instead of a cryptic SDK auth error.
 */
export function anthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  cached = instantiate(apiKey);
  return cached;
}
