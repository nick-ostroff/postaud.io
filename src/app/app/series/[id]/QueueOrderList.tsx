"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type QueueOrderItem = { id: string; text: string };

/**
 * The Question queue card's list: numbered pending questions with ↑/↓
 * controls (admins only) that reorder via the queue API's existing
 * `reorder` action. Optimistic — the swap shows immediately and rolls back
 * if the write fails; the queue page stays the place for pin/remove/add.
 */
export function QueueOrderList({
  seriesId,
  initialItems,
  canManage,
}: {
  seriesId: string;
  initialItems: QueueOrderItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (busy || next < 0 || next >= items.length) return;
    const prev = items;
    const order = [...items];
    [order[idx], order[next]] = [order[next], order[idx]];
    setItems(order);
    setBusy(true);
    setError(null);
    fetch(`/api/series/${seriesId}/queue`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", ids: order.map((i) => i.id) }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        router.refresh();
      })
      .catch(() => {
        setItems(prev);
        setError("Couldn't reorder — try again.");
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-1">
      {items.map((q, i) => (
        <div key={q.id} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0">
          <span className="w-5 shrink-0 text-right text-[12px] font-semibold text-faint">{i + 1}</span>
          <span className="serif min-w-0 flex-1 text-[14.5px] leading-[1.5] text-ink">{q.text}</span>
          {canManage && (
            <span className="flex shrink-0 items-center gap-0.5 self-center">
              <ArrowButton
                label="Move up"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </ArrowButton>
              <ArrowButton
                label="Move down"
                disabled={busy || i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </ArrowButton>
            </span>
          )}
        </div>
      ))}
      {error && <p className="mt-2 text-[12.5px] font-medium text-amber">{error}</p>}
    </div>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-faint transition-colors hover:bg-[rgba(33,30,26,0.05)] hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
