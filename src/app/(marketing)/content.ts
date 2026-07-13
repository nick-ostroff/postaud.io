export const SITE_URL = "https://postaud.io";

export type Faq = { q: string; a: string };

export const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Start a series",
    body: "Name the person and what you want to remember. That's the whole setup.",
  },
  {
    n: "02",
    title: "Anna interviews",
    body: "One question at a time. She listens to the answer and follows up on the part that mattered — the way a good interviewer would.",
  },
  {
    n: "03",
    title: "The knowledge base grows",
    body: "Every session adds people, places, dates, and stories to a living record. Session six knows everything sessions one through five learned.",
  },
];

export const BENEFITS = [
  {
    title: "Voice-first, not a form",
    body: "Nobody fills out a questionnaire about their life. But everyone will answer a good question. Anna asks good questions.",
  },
  {
    title: "A knowledge base that compounds",
    body: "The transcript isn't the product. What accumulates is — facts, people, and context that stay organized and get richer every time you talk.",
  },
  {
    title: "Yours to keep",
    body: "Export everything as Markdown whenever you want. No lock-in, no export queue, no asking us for permission.",
  },
];

export const AUDIENCES = [
  {
    title: "Families",
    body: "Your mother's childhood, in her own voice, before it's a thing you meant to get around to.",
  },
  {
    title: "Founders",
    body: "The decisions, the near-misses, and the reasons — the context that lives in exactly one head.",
  },
  {
    title: "Experts",
    body: "Thirty years of judgment, captured before the person carrying it retires.",
  },
];

export const FAQS: Faq[] = [
  {
    q: "What is PostAud.io?",
    a: "PostAud.io is an AI interviewer. You talk; it asks good questions, listens, and follows up. What it builds isn't a transcript — it's a structured, growing knowledge base of everything it has learned about the person or subject.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Interviews happen in your browser, on a phone or a laptop. If the person you're interviewing can open a link, they can do this.",
  },
  {
    q: "Who can see my family's memories?",
    a: "Only the people you invite. Series are private to your workspace, and access is granted per person and per series — an interviewer you invite to one series cannot see the others.",
  },
  {
    q: "What happens to my data if I leave?",
    a: "You export everything as Markdown, any time, without asking us. It's your family's history. Holding it hostage would be a strange way to run a business.",
  },
  {
    q: "How long is a session?",
    a: "As long as you want, but the good ones tend to run fifteen to thirty minutes. Memory works better in short, regular conversations than in one exhausting marathon.",
  },
];

/**
 * FAQPage structured data, generated from FAQS — never hand-written. Google
 * penalizes structured data that doesn't match the visible page, so there is
 * exactly one place the FAQ copy lives, and both the DOM and this function
 * read from it. `content.test.ts` enforces that.
 */
export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PostAud.io",
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "A voice-first AI interviewer that turns conversation into a living knowledge base — not just a transcript.",
  };
}
