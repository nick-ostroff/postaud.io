/**
 * Post-call pipeline stages. Each stage is idempotent.
 * See plan/02-technical-spec.md §2.5.
 */

export type JobStage =
  | "cleanup_transcript"
  | "extract_answers"
  | "summarize"
  | "render_output"
  | "deliver_webhook"
  | "notify_email";

export const STAGE_ORDER: JobStage[] = [
  "cleanup_transcript",
  "extract_answers",
  "summarize",
  "render_output",
  "deliver_webhook",
  "notify_email",
];

export async function runStage(_stage: JobStage, _sessionId: string, _refId?: string): Promise<void> {
  // TODO: dispatch per stage. Each impl should:
  //   1. check idempotency key (session_id, stage) → skip if done
  //   2. perform work
  //   3. write result rows, mark stage complete
  throw new Error(`runStage(${_stage}) not implemented`);
}
