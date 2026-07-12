import { describe, it, expect } from "vitest";
import { TranscriptBatch } from "../transcript-batch";

describe("TranscriptBatch", () => {
  it("accumulates turns with monotonically increasing seq starting at 0", () => {
    const b = new TranscriptBatch();
    const a = b.add("interviewer", "Tell me about the bakery.", 1.2);
    const c = b.add("subject", "Warm rye, always.", 4.8);
    const d = b.add("interviewer", "And the sugar?", 9.1);

    expect(a.seq).toBe(0);
    expect(c.seq).toBe(1);
    expect(d.seq).toBe(2);
    expect(b.pending()).toHaveLength(3);
    expect(b.pending().map((t) => t.seq)).toEqual([0, 1, 2]);
    // returned turns carry role/text/offset verbatim
    expect(a).toEqual({ role: "interviewer", text: "Tell me about the bakery.", tOffsetSec: 1.2, seq: 0 });
  });

  it("pending() returns a snapshot copy, not the live buffer", () => {
    const b = new TranscriptBatch();
    b.add("subject", "one", 0);
    const snap = b.pending();
    b.add("subject", "two", 1);
    // the earlier snapshot must not have grown
    expect(snap).toHaveLength(1);
    expect(b.pending()).toHaveLength(2);
  });

  it("drains unsent turns once markSent is called with them", () => {
    const b = new TranscriptBatch();
    b.add("subject", "a", 0);
    b.add("subject", "b", 1);
    expect(b.hasPending()).toBe(true);

    const flushed = b.pending();
    b.markSent(flushed);

    expect(b.hasPending()).toBe(false);
    expect(b.pending()).toHaveLength(0);
  });

  it("retains turns on a failed flush (markSent never called)", () => {
    const b = new TranscriptBatch();
    b.add("subject", "a", 0);
    b.add("subject", "b", 1);

    // simulate: took a snapshot to send, the POST failed, so we do NOT markSent
    const attempted = b.pending();
    expect(attempted).toHaveLength(2);

    // still pending for the next flush
    expect(b.hasPending()).toBe(true);
    expect(b.pending()).toHaveLength(2);
  });

  it("keeps seq monotonic across flush boundaries (does not reset)", () => {
    const b = new TranscriptBatch();
    b.add("subject", "a", 0); // seq 0
    b.add("subject", "b", 1); // seq 1
    b.markSent(b.pending());

    const next = b.add("subject", "c", 2);
    expect(next.seq).toBe(2); // continues, not reset to 0
    expect(b.pending()).toEqual([{ role: "subject", text: "c", tOffsetSec: 2, seq: 2 }]);
  });

  it("markSent removes only the flushed subset, keeping turns added after the snapshot", () => {
    const b = new TranscriptBatch();
    b.add("subject", "a", 0);
    b.add("subject", "b", 1);
    const firstBatch = b.pending(); // seqs 0,1

    // a new turn arrives after we snapshotted the batch we're sending
    b.add("subject", "c", 2); // seq 2

    b.markSent(firstBatch); // only 0,1 confirmed

    expect(b.pending()).toEqual([{ role: "subject", text: "c", tOffsetSec: 2, seq: 2 }]);
  });
});
