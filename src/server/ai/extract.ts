import { openai } from "./clients";

export type ExtractedAnswer = {
  answer_text: string;
  confidence: number;
};

const SYSTEM = `You clean up spoken answers. Remove filler words ("um", "uh"), fix obvious disfluencies and self-corrections, but preserve the speaker's voice and meaning. Do not invent facts. If the answer is blank or unrelated to the question, return an empty answer_text and confidence 0.`;

export async function extractAnswer(args: {
  questionPrompt: string;
  questionHint?: string | null;
  rawTranscript: string;
}): Promise<ExtractedAnswer> {
  const user = [
    `Question: ${args.questionPrompt}`,
    args.questionHint ? `Context hint: ${args.questionHint}` : "",
    ``,
    `Spoken answer (raw transcript):`,
    args.rawTranscript.trim() || "(no speech recorded)",
    ``,
    `Respond with a JSON object: {"answer_text": string, "confidence": number between 0 and 1}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await openai().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const content = res.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content) as Partial<ExtractedAnswer>;
    return {
      answer_text: typeof parsed.answer_text === "string" ? parsed.answer_text : "",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    };
  } catch {
    return { answer_text: args.rawTranscript.trim(), confidence: 0 };
  }
}
