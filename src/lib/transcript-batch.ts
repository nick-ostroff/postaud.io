import type { MessageRole } from "@/db/types";

export type TranscriptTurn = {
  role: MessageRole;
  text: string;
  tOffsetSec: number;
  seq: number;
};

/**
 * Client-side accumulator for the live interview transcript. Assigns each turn
 * a monotonically-increasing `seq` (0, 1, 2, …) that maps directly to the
 * unique `(interview_id, seq)` index on `interview_messages`, and holds turns
 * as "unsent" until a flush POST succeeds.
 *
 * The flow it supports (in LiveInterview.tsx): every 5s and on teardown, take a
 * `pending()` snapshot, POST it, and call `markSent()` only on success. A failed
 * POST simply skips `markSent`, so those turns stay buffered and go out with the
 * next flush — the server's unique-seq index makes any accidental re-send of an
 * already-inserted row a harmless no-op (409 rows are ignored), so at-least-once
 * delivery is safe.
 *
 * Pure and side-effect free (no fetch/no timers) so it's unit-testable; the
 * component owns the IO and the interval.
 */
export class TranscriptBatch {
  private nextSeq = 0;
  private unsent: TranscriptTurn[] = [];

  /** Append a turn, assigning the next seq. Returns the created turn. */
  add(role: MessageRole, text: string, tOffsetSec: number): TranscriptTurn {
    const turn: TranscriptTurn = { role, text, tOffsetSec, seq: this.nextSeq };
    this.nextSeq += 1;
    this.unsent.push(turn);
    return turn;
  }

  /** Snapshot copy of turns not yet confirmed sent. */
  pending(): TranscriptTurn[] {
    return [...this.unsent];
  }

  hasPending(): boolean {
    return this.unsent.length > 0;
  }

  /**
   * Remove the given turns (matched by seq) from the unsent buffer after a
   * successful flush. Turns added after the snapshot was taken are retained.
   */
  markSent(turns: TranscriptTurn[]): void {
    if (turns.length === 0) return;
    const sentSeqs = new Set(turns.map((t) => t.seq));
    this.unsent = this.unsent.filter((t) => !sentSeqs.has(t.seq));
  }
}
