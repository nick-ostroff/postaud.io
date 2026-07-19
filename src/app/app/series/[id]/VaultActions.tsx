"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { requestVaultPush, unlinkVault } from "./vault-actions";

/**
 * The interactive half of the VaultCard's linked states: "Send update to
 * vault" (or the queued-status text, once `pending` is true) plus "Unlink".
 * Both actions only ever touch `series_vault_links` — never the local vault
 * itself — so after either resolves we `router.refresh()` to re-run
 * VaultCard's server-side read rather than hand-rolling the next state here.
 */
export function VaultActions({ seriesId, pending }: { seriesId: string; pending: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    setSending(true);
    setError(null);
    try {
      await requestVaultPush(seriesId);
      router.refresh();
    } catch {
      setError("Couldn't queue the update — try again.");
    } finally {
      setSending(false);
    }
  }

  async function onUnlink() {
    setUnlinking(true);
    setError(null);
    try {
      await unlinkVault(seriesId);
      router.refresh();
    } catch {
      setError("Couldn't unlink — try again.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {pending ? (
        <span className="text-[13px] font-medium text-green-deep">
          Update queued — it&apos;ll arrive next time Obsidian is open.
        </span>
      ) : (
        <Button type="button" variant="primary" onClick={onSend} disabled={sending}>
          {sending ? "Queuing…" : "Send update to vault"}
        </Button>
      )}
      <button
        type="button"
        onClick={onUnlink}
        disabled={unlinking}
        className="text-[12.5px] font-medium text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {unlinking ? "Unlinking…" : "Unlink"}
      </button>
      {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
    </div>
  );
}
