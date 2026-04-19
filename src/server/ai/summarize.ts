import { anthropic } from "./clients";

export type Summary = {
  short: string;
  long: string;
  bullets: string[];
};

export async function summarizeInterview(args: {
  templateName: string;
  answers: { prompt: string; answer: string }[];
}): Promise<Summary> {
  const body = args.answers
    .map((a, i) => `Q${i + 1}: ${a.prompt}\nA${i + 1}: ${a.answer || "(no answer)"}`)
    .join("\n\n");

  const prompt = `You are writing a short summary of a voice interview called "${args.templateName}".

Below are the questions asked and the recipient's answers:

${body}

Return ONLY valid JSON with this exact shape:
{
  "short": "one or two sentences capturing the key point",
  "long": "up to 120 words, paragraph-form, preserving specifics",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
}

Be specific. Cite names, numbers, and concrete details from the answers. Do not invent anything.`;

  const res = await anthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  const json = extractJson(raw);
  return {
    short: typeof json.short === "string" ? json.short : "",
    long: typeof json.long === "string" ? json.long : "",
    bullets: Array.isArray(json.bullets) ? json.bullets.filter((x) => typeof x === "string") : [],
  };
}

function extractJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* fallthrough */
      }
    }
    return {};
  }
}
