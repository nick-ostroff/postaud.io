"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * "Archive this series" in the settings danger zone. DELETE on the series API
 * archives (status flip, nothing deleted) — confirm first, then land back on
 * the dashboard, where archived series no longer appear.
 */
export function ArchiveSeriesButton({ seriesId, title }: { seriesId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (!window.confirm(`Archive “${title}”? It disappears from the workspace, but every session and memory is kept.`)) {
      return;
    }
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

  return (
    <div>
      <Button type="button" variant="ghost" onClick={archive} disabled={busy}>
        {busy ? "Archiving…" : "Archive this series"}
      </Button>
      {error && <p className="mt-2 text-[12.5px] font-medium text-amber">{error}</p>}
    </div>
  );
}
