"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type QueueItem = { id: string; text: string; provenance: string };

/**
 * Client half of the queue screen: pending list with per-item ⋮ actions
 * (admin), plus the member "Add question" composer. Every action round-trips
 * the queue API then router.refresh()es — the server page is the source of
 * truth for order and provenance.
 */
export function QueueList({
  seriesId,
  initialItems,
  canManage,
}: {
  seriesId: string;
  initialItems: QueueItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/queue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Couldn't update the queue — try again.");
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= items.length) return;
    const order = [...items];
    [order[idx], order[next]] = [order[next], order[idx]];
    setItems(order);
    void patch({ action: "reorder", ids: order.map((i) => i.id) });
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
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

  return (
    <div className="flex max-w-3xl flex-col gap-2.5">
      {items.length === 0 ? (
        <Card className="px-[22px] py-6 text-[14px] text-muted">
          Nothing waiting. Follow-ups you save during Flow sessions land here — or add one below.
        </Card>
      ) : (
        items.map((item, idx) => (
          <Card
            key={item.id}
            className={`relative px-[18px] py-3.5 ${idx === 0 ? "border-green-deep/40 border-[1.5px]" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {idx === 0 ? (
                  <span className="mb-1.5 inline-block rounded-full bg-green-tint px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-green-deep">
                    Next up
                  </span>
                ) : null}
                <p className="font-serif text-[15.5px] leading-snug">{item.text}</p>
                <p className="mt-1 text-[11.5px] text-muted">{item.provenance}</p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  aria-label="Question actions"
                  onClick={() => setMenuFor((v) => (v === item.id ? null : item.id))}
                  className="shrink-0 px-1 text-[17px] leading-none text-faint hover:text-ink"
                  disabled={busy}
                >
                  ⋮
                </button>
              ) : null}
            </div>
            {menuFor === item.id ? (
              <div className="absolute right-3 top-10 z-10 flex w-44 flex-col rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                {idx !== 0 ? (
                  <MenuButton onClick={() => void patch({ action: "pin", id: item.id })}>Pin as next up</MenuButton>
                ) : null}
                {idx > 0 ? <MenuButton onClick={() => move(item.id, -1)}>Move up</MenuButton> : null}
                {idx < items.length - 1 ? (
                  <MenuButton onClick={() => move(item.id, 1)}>Move down</MenuButton>
                ) : null}
                <MenuButton onClick={() => void patch({ action: "remove", id: item.id })}>Remove</MenuButton>
              </div>
            ) : null}
          </Card>
        ))
      )}

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add a question for the next session…"
          disabled={busy}
        />
        <Button type="button" variant="primary" onClick={() => void add()} disabled={busy || !draft.trim()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-[12.5px] font-medium text-amber">{error}</p> : null}
    </div>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 text-left text-[13.5px] hover:bg-black/5"
    >
      {children}
    </button>
  );
}
