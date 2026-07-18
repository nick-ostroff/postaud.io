"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { inputBase } from "@/components/ui/Input";
import { createToken, revokeToken } from "./token-actions";
import type { ApiTokenRow } from "./page";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Owns both halves of the token screen: the create form and the list.
 * `tokens` comes from the server component as props, so after a create or
 * revoke we call `router.refresh()` to re-run the server query rather than
 * hand-rolling client-side list state — that's the same round-trip
 * `ProfileNameEditor` uses and keeps this component from ever drifting out
 * of sync with what's actually in the database.
 *
 * `revealedToken` is local-only state, deliberately never derived from
 * `tokens`: the raw value doesn't exist anywhere the server could hand it
 * back a second time, so the only copy of it lives here, for exactly one
 * render cycle, until the user navigates away or creates another token.
 */
export function TokenManager({ tokens }: { tokens: ApiTokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const { token } = await createToken(name);
      setRevealedToken({ name: name.trim(), value: token });
      setCopied(false);
      setName("");
      router.refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create token.");
    } finally {
      setCreating(false);
    }
  }

  async function onCopy() {
    if (!revealedToken) return;
    try {
      // navigator.clipboard requires a secure context; this runs only from a
      // click handler inside a client component, so it's never touched
      // during SSR — but guard it anyway in case it's unavailable (older
      // Safari, non-HTTPS local dev over LAN, etc.).
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(revealedToken.value);
        setCopied(true);
      }
    } catch {
      setCopied(false);
    }
  }

  async function onRevoke(id: string) {
    setRevokingId(id);
    setRevokeError(null);
    try {
      await revokeToken(id);
      router.refresh();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Could not revoke token.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <form onSubmit={onCreate} className="flex flex-wrap items-center gap-2.5">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setCreateError(null);
          }}
          placeholder="Name this token — e.g. Obsidian – laptop"
          required
          disabled={creating}
          className={`w-full max-w-[380px] flex-1 ${inputBase}`}
        />
        <Button type="submit" variant="primary" disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create token"}
        </Button>
      </form>
      {createError && <div className="mt-2 text-xs font-medium text-amber">{createError}</div>}

      {revealedToken && (
        <div className="mt-4 rounded-sm border-[1.5px] border-amber-tint bg-amber-tint px-4 py-3.5">
          <div className="text-[13px] font-semibold text-amber">
            Copy this now — you won&apos;t be able to see it again.
          </div>
          <div className="mt-1 text-[12.5px] text-ink-soft">
            This is the only time &ldquo;{revealedToken.name}&rdquo; will be shown. Once you navigate away, only
            postaud.io keeps a one-way hash of it — not the token itself.
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-sm border border-line-strong bg-card px-3 py-2 text-[12.5px] text-ink">
              {revealedToken.value}
            </code>
            <Button type="button" size="md" onClick={onCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedToken(null)}
            className="mt-2.5 text-[12px] font-medium text-muted hover:text-ink"
          >
            Done — dismiss
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        {tokens.length === 0 && (
          <div className="py-6 text-center text-[13.5px] text-muted">No tokens yet.</div>
        )}
        {tokens.map((t) => {
          const isRevoked = Boolean(t.revoked_at);
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0 ${
                isRevoked ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-ink">{t.name}</div>
                <div className="mt-0.5 text-[12px] text-faint">
                  Created {formatDate(t.created_at)}
                  {" · "}
                  {isRevoked
                    ? `Revoked ${formatDate(t.revoked_at as string)}`
                    : t.last_used_at
                      ? `Last used ${formatDate(t.last_used_at)}`
                      : "Never used"}
                </div>
              </div>
              {!isRevoked && (
                <Button
                  type="button"
                  variant="quiet-danger"
                  size="md"
                  onClick={() => onRevoke(t.id)}
                  disabled={revokingId === t.id}
                >
                  {revokingId === t.id ? "Revoking…" : "Revoke"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {revokeError && <div className="mt-2 text-xs font-medium text-amber">{revokeError}</div>}
    </div>
  );
}
