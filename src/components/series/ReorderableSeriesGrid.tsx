"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; card: ReactNode };

/**
 * The series grid with admin drag-to-reorder. Cards stay server-rendered
 * (passed in as ReactNodes); this wrapper only owns the ordering.
 *
 * HTML5 drag & drop — the list re-sorts live as you drag over other cards,
 * then a single PATCH persists the whole visible order on drop. Mouse only;
 * touch devices keep the saved order but can't drag (the mobile home rail is
 * the phone-first surface anyway).
 */
export function ReorderableSeriesGrid({ items, canReorder }: { items: Item[]; canReorder: boolean }) {
  const router = useRouter();
  const serverKey = items.map((i) => i.id).join(",");
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const orderAtDragStart = useRef<string[]>([]);

  // Re-sync when the server list changes (new series, archive, refresh) —
  // state reset during render, per the React "derived state" pattern.
  const [prevServerKey, setPrevServerKey] = useState(serverKey);
  if (prevServerKey !== serverKey) {
    setPrevServerKey(serverKey);
    setOrder(serverKey ? serverKey.split(",") : []);
  }

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function moveDraggedTo(targetId: string) {
    const id = dragId.current;
    if (!id || id === targetId) return;
    setOrder((prev) => {
      const from = prev.indexOf(id);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }

  async function finishDrag() {
    const id = dragId.current;
    dragId.current = null;
    setDragging(null);
    if (!id || order.join(",") === orderAtDragStart.current.join(",")) return;

    const res = await fetch("/api/series/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: order }),
    }).catch(() => null);
    if (!res?.ok) {
      setOrder(orderAtDragStart.current);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
      {order.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <div
            key={id}
            draggable={canReorder}
            onDragStart={(e) => {
              dragId.current = id;
              orderAtDragStart.current = order;
              setDragging(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              // The drag often starts on the card's stretched overlay link —
              // use the whole card as the ghost, not a transparent anchor.
              e.dataTransfer.setDragImage(e.currentTarget, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            }}
            onDragEnter={() => canReorder && moveDraggedTo(id)}
            onDragOver={(e) => canReorder && e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={finishDrag}
            className={dragging === id ? "opacity-40" : undefined}
          >
            {item.card}
          </div>
        );
      })}
    </div>
  );
}
