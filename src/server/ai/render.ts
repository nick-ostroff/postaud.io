import { anthropic } from "./clients";
import type { Summary } from "./summarize";

type OutputType =
  | "transcript.plain"
  | "summary.concise"
  | "qa.structured"
  | "blog.draft"
  | "crm.note"
  | "webhook.json";

type Answer = { prompt: string; answer: string; raw?: string };

type RenderInput = {
  outputType: OutputType;
  templateName: string;
  recipientName: string;
  answers: Answer[];
  summary: Summary;
};

export async function renderOutput(input: RenderInput): Promise<string> {
  switch (input.outputType) {
    case "transcript.plain":
      return renderPlain(input);
    case "summary.concise":
      return renderSummary(input);
    case "qa.structured":
      return renderQa(input);
    case "blog.draft":
      return renderBlog(input);
    case "crm.note":
      return renderCrm(input);
    case "webhook.json":
      return renderWebhookJson(input);
    default:
      return renderSummary(input);
  }
}

function renderPlain({ answers }: RenderInput): string {
  return answers.map((a) => `Q: ${a.prompt}\nA: ${a.answer || "(no answer)"}`).join("\n\n");
}

function renderSummary({ summary }: RenderInput): string {
  const bullets = summary.bullets.map((b) => `- ${b}`).join("\n");
  return `${summary.short}\n\n${summary.long}\n\n${bullets}`.trim();
}

function renderQa({ answers }: RenderInput): string {
  return JSON.stringify(
    {
      qa: answers.map((a) => ({ question: a.prompt, answer: a.answer })),
    },
    null,
    2,
  );
}

function renderWebhookJson(input: RenderInput): string {
  return JSON.stringify(
    {
      event: "interview.completed",
      template: input.templateName,
      recipient: input.recipientName,
      summary: input.summary,
      answers: input.answers.map((a) => ({ question: a.prompt, answer: a.answer })),
    },
    null,
    2,
  );
}

async function renderBlog(input: RenderInput): Promise<string> {
  const body = input.answers
    .map((a, i) => `Q${i + 1}: ${a.prompt}\nA${i + 1}: ${a.answer || "(no answer)"}`)
    .join("\n\n");

  const prompt = `You are a professional writer turning a short voice interview with ${input.recipientName} into a blog draft in Markdown.

Interview: "${input.templateName}"
Summary: ${input.summary.short}

${body}

Write a 400–700 word Markdown blog post. Include:
- A short H1 title
- 2–3 H2 section headings
- Quotes from the recipient where appropriate
- A closing line

Output ONLY the Markdown. Do not wrap in code fences. Do not invent facts beyond what's in the answers.`;

  const res = await anthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

async function renderCrm(input: RenderInput): Promise<string> {
  const body = input.answers
    .map((a, i) => `Q${i + 1}: ${a.prompt}\nA${i + 1}: ${a.answer || "(no answer)"}`)
    .join("\n\n");

  const prompt = `Turn the following short voice interview into a CRM note — one tight paragraph (max 120 words) that a salesperson or account manager can paste into HubSpot/Salesforce. Focus on the recipient's stated needs, timeline, and decision context. No markdown, no bullets. Plain prose.

Recipient: ${input.recipientName}
Template: ${input.templateName}

${body}`;

  const res = await anthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}
