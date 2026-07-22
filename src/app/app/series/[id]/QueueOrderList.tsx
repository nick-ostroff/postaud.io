"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type QueueOrderItem = { id: string; text: string };

/**
 * The Question queue card's list: numbered pending questions that admins can
 * reorder by dragging the ⠿ handle (HTML5 drag & drop — desktop) or with the
 * ↑/↓ buttons (also the touch/keyboard path), both via the queue API's
 * existing `reorder` action. Optimistic — the new order shows immediately and
 * rolls back if the write fails; the queue page stays the place for
 * pin/remove.
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
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Order at drag start — what we diff against on drop, and roll back to on failure.
  const preDrag = useRef<QueueOrderItem[] | null>(null);

  function commit(order: QueueOrderItem[], rollbackTo: QueueOrderItem[]) {
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
        setItems(rollbackTo);
        setError("Couldn't reorder — try again.");
      })
      .finally(() => setBusy(false));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (busy || next < 0 || next >= items.length) return;
    const order = [...items];
    [order[idx], order[next]] = [order[next], order[idx]];
    setItems(order);
    commit(order, items);
  }

  function onDragStart(idx: number) {
    if (busy) return;
    preDrag.current = items;
    setDragIdx(idx);
  }

  // Live-preview: as the dragged row passes over another, swap it there.
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || idx === dragIdx) return;
    const order = [...items];
    const [moved] = order.splice(dragIdx, 1);
    order.splice(idx, 0, moved);
    setItems(order);
    setDragIdx(idx);
  }

  function onDragEnd() {
    const prev = preDrag.current;
    preDrag.current = null;
    setDragIdx(null);
    if (dragIdx === null || !prev) return;
    if (prev.map((i) => i.id).join(",") === items.map((i) => i.id).join(",")) return;
    commit(items, prev);
  }

  return (
    <div className="mt-1">
      {items.map((q, i) => (
        <div
          key={q.id}
          draggable={canManage && !busy}
          onDragStart={() => onDragStart(i)}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={(e) => e.preventDefault()}
          onDragEnd={onDragEnd}
          className={`flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0 ${
            dragIdx === i ? "opacity-50" : ""
          }`}
        >
          {canManage && (
            <span
              aria-hidden
              title="Drag to reorder"
              className="shrink-0 cursor-grab self-center text-[13px] leading-none text-faint active:cursor-grabbing"
            >
              ⠿
            </span>
          )}
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
