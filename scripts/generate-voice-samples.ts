/**
 * One-off: generates the voice-picker sample clips into public/voices/.
 * Run manually after changing VOICES, never as part of the build:
 *
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-voice-samples.ts
 *
 * The clips are committed to the repo so the picker costs nothing at runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { VOICES } from "../src/lib/voices";

/** Interviewer-flavored so the sample previews the job, not just the timbre. */
const SCRIPT =
  "Tell me about the house you grew up in. Start anywhere — the front door, a smell, a room you remember.";

const OUT_DIR = path.join(process.cwd(), "public", "voices");

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const client = new OpenAI({ apiKey });

  await mkdir(OUT_DIR, { recursive: true });

  for (const voice of VOICES) {
    const res = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice.id,
      input: SCRIPT,
      instructions: `You are ${voice.name}, an oral-history interviewer. ${voice.blurb} Speak the line the way you would to someone you are about to interview: unhurried, curious, and human.`,
      response_format: "mp3",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const out = path.join(OUT_DIR, `${voice.id}.mp3`);
    await writeFile(out, buf);
    console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB) — ${voice.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
