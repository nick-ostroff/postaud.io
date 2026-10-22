import type { ConversationMode } from "@/db/types";

/**
 * Flow only ever asks what's in the queue: the prompt opens with queue row 0
 * near-verbatim and every later question is a follow-up the subject picks on
 * screen. With nothing queued there is nothing to open with, so a NEW Flow
 * session must not start. Resuming an in-progress session is always allowed —
 * the opener gets consumed once asked, so an empty queue mid-session is normal.
 *
 * Quickfire and Ritual are deliberately excluded: their prompts carry their
 * own empty-queue behaviour (must-cover topics / "how did today go").
 * Legacy `deep` rows run as Flow everywhere else, so they gate as Flow here.
 */
export function flowNeedsQueuedQuestion({
  mode,
  queuedCount,
  hasResumable,
}: {
  mode: ConversationMode;
  queuedCount: number;
  hasResumable: boolean;
}): boolean {
  const isFlow = mode === "flow" || mode === "deep";
  return isFlow && queuedCount === 0 && !hasResumable;
}
