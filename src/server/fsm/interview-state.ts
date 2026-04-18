/**
 * Interview session FSM — see plan/02-technical-spec.md §3.
 *
 *   initial → greeting → consent_yes → asking(q0)
 *   consent_no → declined
 *   asking(qN) → listening(qN) → [followup? → followup(qN) → listening(qN)] → asking(qN+1)
 *   asking(last) → wrapup → completed
 *   + hangup → partial
 *   + websocket_error + reconnect_failed → failed
 */

export type State =
  | { name: "greeting" }
  | { name: "consent" }
  | { name: "asking";     questionIndex: number }
  | { name: "listening";  questionIndex: number; followupCount: number }
  | { name: "followup";   questionIndex: number }
  | { name: "wrapup" }
  | { name: "done";       status: "completed" | "partial" | "failed" | "declined" };

export type Event =
  | { type: "consent.yes" }
  | { type: "consent.no" }
  | { type: "answer.done"; lowCoverage: boolean; questionAllowsFollowup: boolean }
  | { type: "followup.done" }
  | { type: "hangup" }
  | { type: "error" };

export function nextState(_state: State, _event: Event, _totalQuestions: number): State {
  // TODO: implement transitions. Returning a noop to keep the scaffold compiling.
  return _state;
}
