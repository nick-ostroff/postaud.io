"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * "Delete this series" in the settings danger zone — the permanent version of
 * ArchiveSeriesButton. Same type-the-title confirm, but DELETE with
 * ?permanent=1 removes the series row and everything under it: sessions,
 * memories, recordings, topics, and the queue. No undo.
 */
export function DeleteSeriesButton({ seriesId, title }: { seriesId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === title;

  async function destroy() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}?permanent=1`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't delete — try again.");
        setBusy(false);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Couldn't delete — try again.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="quiet-danger" onClick={() => setConfirming(true)}>
        Delete this series
      </Button>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-muted">
        Type <span className="font-semibold text-ink">{title}</span> to confirm — this deletes every
        session, memory, and recording. There&apos;s no undo.
      </p>
      <div className="mt-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={title}
          disabled={busy}
          aria-label={`Type ${title} to confirm deleting`}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="quiet-danger" onClick={destroy} disabled={busy || !matches}>
          {busy ? "Deleting…" : "Delete forever"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
      </div>
    </div>
  );
}
