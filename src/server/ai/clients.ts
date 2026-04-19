import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;

export function openai(): OpenAI {
  if (_openai) return _openai;
  const key = env().OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export function anthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}
