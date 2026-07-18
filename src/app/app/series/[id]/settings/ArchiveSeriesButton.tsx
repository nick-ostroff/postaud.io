"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * "Archive this series" in the settings danger zone. DELETE on the series API
 * archives (status flip, nothing deleted) — the first click reveals a
 * type-the-title confirm so a stray tap can't archive, then lands back on the
 * dashboard, where archived series no longer appear.
 */
export function ArchiveSeriesButton({ seriesId, title }: { seriesId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === title;

  async function archive() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't archive — try again.");
        setBusy(false);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Couldn't archive — try again.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
        Archive this series
      </Button>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-muted">
        Type <span className="font-semibold text-ink">{title}</span> to confirm.
      </p>
      <div className="mt-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={title}
          disabled={busy}
          aria-label={`Type ${title} to confirm archiving`}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="primary" onClick={archive} disabled={busy || !matches}>
          {busy ? "Archiving…" : "Archive"}
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
