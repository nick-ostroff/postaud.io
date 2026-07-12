"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = { factId: string; initialStatement: string };

type PatchBody = { action: "confirm" } | { action: "correct"; statement: string } | { action: "retell" };

const textareaClasses =
  "w-full rounded-sm border border-line-strong bg-card px-[13px] py-2.5 text-[14.5px] leading-[1.5] text-ink placeholder:text-faint focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

/**
 * The three stacked review actions on the memory-detail screen (mockup
 * #1g): "That's right" (primary — confirms as-is), "Fix a detail" (reveals
 * a textarea, then saves the correction), "Retell next time" (ghost —
 * queues it for Anna to ask about again). Exactly one primary action; the
 * other two are visually quieter, matching the "one primary action per
 * screen" rule the interviewee-facing UI follows throughout.
 *
 * All three PATCH the same route (`/api/facts/[id]`) — the original
 * transcript/audio are never touched here, only ever the fact's own
 * statement/status (spec invariant: transcripts and audio are immutable).
 */
export function ReviewActions({ factId, initialStatement }: Props) {
  const router = useRouter();
  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState(initialStatement);
  const [pending, setPending] = useState<"confirm" | "correct" | "retell" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(body: PatchBody, doneMessage: string) {
    setPending(body.action);
    setError(null);
    try {
      const res = await fetch(`/api/facts/${factId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setDone(doneMessage);
        setFixing(false);
        router.refresh();
      } else {
        setError(json?.error ?? "Something went wrong — try again.");
      }
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return <p className="py-2 text-center text-[14px] font-medium text-green-deep">{done}</p>;
  }

  return (
    <div className="flex flex-col gap-[11px]">
      {!fixing && (
        <Button
          variant="primary"
          size="big"
          className="w-full justify-center"
          disabled={pending !== null}
          onClick={() => send({ action: "confirm" }, "That's right — saved as is.")}
        >
          {pending === "confirm" ? "Saving…" : "That's right"}
        </Button>
      )}

      {fixing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className={textareaClasses}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 justify-center"
              disabled={pending !== null}
              onClick={() => {
                setFixing(false);
                setDraft(initialStatement);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1 justify-center"
              disabled={pending !== null || draft.trim().length < 3}
              onClick={() => send({ action: "correct", statement: draft.trim() }, "Fixed — thanks for the detail.")}
            >
              {pending === "correct" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            size="big"
            className="w-full justify-center"
            disabled={pending !== null}
            onClick={() => setFixing(true)}
          >
            Fix a detail
          </Button>
          <p className="mt-1.5 text-center text-[12.5px] text-faint">say it or type it</p>
        </div>
      )}

      <Button
        variant="ghost"
        className="w-full justify-center"
        disabled={pending !== null}
        onClick={() => send({ action: "retell" }, "Got it — Anna will ask again next time.")}
      >
        {pending === "retell" ? "Queuing…" : "Retell next time"}
      </Button>

      {error && <p className="text-center text-[12.5px] text-amber">{error}</p>}
    </div>
  );
}
