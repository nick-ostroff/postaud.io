import OpenAI from "openai";
import { env } from "@/lib/env";

let cached: OpenAI | null = null;

/**
 * Singleton OpenAI client factory. Mirrors anthropicClient()'s shape: throws
 * a clear error at call time (not import time) if OPENAI_API_KEY isn't
 * configured, so the realtime-token route can surface a clean 500 instead of
 * a cryptic SDK auth error.
 */
export function openaiClient(): OpenAI {
  if (cached) return cached;
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  cached = new OpenAI({ apiKey });
  return cached;
}
