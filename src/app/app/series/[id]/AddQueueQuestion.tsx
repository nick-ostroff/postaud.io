"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * The Question queue card's "+ Add your own question" affordance: a quiet
 * button that expands into a one-line composer. POSTs to the queue API
 * (interview access required — the page only renders this when the viewer
 * passes `canInterviewSeries`, same server-side gate as the queue page's
 * composer) then router.refresh()es so the new question appears in the list.
 */
export function AddQueueQuestion({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      setDraft("");
      router.refresh();
    } catch {
      setError("Couldn't add that question — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-green-deep hover:text-ink"
      >
        <span aria-hidden className="text-[15px] leading-none">+</span> Add your own question
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Add a question for the next session…"
          disabled={busy}
        />
        <Button type="button" variant="primary" onClick={() => void add()} disabled={busy || !draft.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] font-medium text-amber">{error}</p>}
    </div>
  );
}
