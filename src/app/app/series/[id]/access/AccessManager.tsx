"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Segmented";

export type AccessLevel = "none" | "view" | "interview";

export type AccessMember = {
  userId: string;
  name: string;
  email: string;
  pending: boolean;
  level: AccessLevel;
};

const LEVEL_OPTIONS = [
  { value: "view", label: "Can view" },
  { value: "interview", label: "Can interview" },
  { value: "none", label: "No access" },
];

/**
 * Editable roster for a series' access page — one Segmented control per
 * workspace member (owners and the account-holding subject are excluded
 * upstream, they're rendered as separate pinned rows). Each change PUTs the
 * full current set of member levels to `/api/series/[id]/access` right away
 * (no separate Save step, matching the mockup's live-toggle feel) and rolls
 * the optimistic update back on failure.
 */
export function AccessManager({ seriesId, initialMembers }: { seriesId: string; initialMembers: AccessMember[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setLevel(userId: string, level: AccessLevel) {
    const previous = members;
    const next = members.map((m) => (m.userId === userId ? { ...m, level } : m));
    setMembers(next);
    setSavingId(userId);
    setError(null);

    try {
      const res = await fetch(`/api/series/${seriesId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: next.map((m) => ({ userId: m.userId, level: m.level })),
        }),
      });
      if (!res.ok) {
        setMembers(previous);
        setError("Couldn't save that change — try again.");
      } else {
        router.refresh();
      }
    } catch {
      setMembers(previous);
      setError("Couldn't save that change — try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (members.length === 0) {
    return <p className="mt-2 text-[13.5px] text-muted">No other workspace members yet.</p>;
  }

  return (
    <div>
      {error && <p className="mb-2 text-[12.5px] font-medium text-amber">{error}</p>}
      {members.map((m) => (
        <div
          key={m.userId}
          className={
            "flex items-center gap-3 border-b border-line py-3 last:border-b-0 last:pb-1" +
            (savingId === m.userId ? " opacity-60" : "")
          }
        >
          <Avatar name={m.name} tone="plain" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">
              {m.name}
              {m.pending && (
                <span className="ml-1.5 inline-block align-middle">
                  <Badge tone="amber">invite pending</Badge>
                </span>
              )}
            </div>
            <div className="truncate text-xs text-faint">{m.email}</div>
          </div>
          <Segmented
            name={`access-${m.userId}`}
            options={LEVEL_OPTIONS}
            value={m.level}
            onChange={(value) => setLevel(m.userId, value as AccessLevel)}
          />
        </div>
      ))}
    </div>
  );
}
