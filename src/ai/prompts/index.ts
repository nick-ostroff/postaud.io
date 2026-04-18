/**
 * Versioned prompts. Bumping text ⇒ bump version constant.
 * Every LLM call records prompt_version on the resulting row.
 */

export const PROMPT_VERSIONS = {
  followupScorer:    "v1.0.0",
  followupGenerator: "v1.0.0",
  transcriptCleaner: "v1.0.0",
  answerExtractor:   "v1.0.0",
  summarizer:        "v1.0.0",
  renderBlog:        "v1.0.0",
  renderCrmNote:     "v1.0.0",
  renderSummary:     "v1.0.0",
  renderQaStructured:"v1.0.0",
  renderWebhookJson: "v1.0.0",
} as const;

// TODO: flesh each out per plan/02-technical-spec.md §4.
export const prompts = {
  followupScorer: () => `TODO: score answer coverage vs question intent; return {coverage, missing[]}`,
  followupGenerator: () => `TODO: generate ≤18-word clarifier`,
  transcriptCleaner: () => `TODO: remove disfluencies, preserve meaning`,
  answerExtractor: () => `TODO: extract {answer_text, confidence, followup_text?}`,
  summarizer: () => `TODO: return {short (≤2 sentences), long (≤120 words), bullets[5]}`,
  renderBlog: () => `TODO: render blog draft markdown`,
  renderCrmNote: () => `TODO: render CRM note paragraph`,
  renderSummary: () => `TODO: render concise summary`,
  renderQaStructured: () => `TODO: render structured Q&A JSON`,
  renderWebhookJson: () => `TODO: render webhook JSON payload`,
} as const;
