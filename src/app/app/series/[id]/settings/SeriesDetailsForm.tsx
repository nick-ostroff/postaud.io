"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, inputClasses } from "@/components/ui/Input";

/**
 * The editable basics on the series settings page: name, relationship (hidden
 * for "about you" stories), and goal. Saves only the fields that changed via
 * PATCH /api/series/[id], then refreshes so the header/breadcrumbs pick up a
 * rename.
 */
export function SeriesDetailsForm({
  seriesId,
  initialTitle,
  initialRelationship,
  initialGoal,
  showRelationship,
}: {
  seriesId: string;
  initialTitle: string;
  initialRelationship: string;
  initialGoal: string;
  showRelationship: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [goal, setGoal] = useState(initialGoal);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title.trim() !== initialTitle ||
    relationship.trim() !== initialRelationship ||
    goal.trim() !== initialGoal;

  async function save() {
    const patch: Record<string, string> = {};
    if (title.trim() && title.trim() !== initialTitle) patch.title = title.trim();
    if (relationship.trim() !== initialRelationship) patch.subjectRelationship = relationship.trim();
    if (goal.trim() && goal.trim() !== initialGoal) patch.goal = goal.trim();
    if (Object.keys(patch).length === 0) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError("Couldn't save — try again.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 max-w-3xl">
      <Field label="Series name">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Raffi"
          disabled={busy}
        />
      </Field>
      {showRelationship && (
        <Field label="Relationship" hint="How the subject relates to you — “grandmother”, “dad”, “co-founder”.">
          <Input
            value={relationship}
            onChange={(e) => {
              setRelationship(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. grandmother"
            disabled={busy}
          />
        </Field>
      )}
      <Field label="Goal" hint="What this series is trying to capture — it steers where Anna takes the conversations.">
        <textarea
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
            setSaved(false);
          }}
          rows={3}
          disabled={busy}
          className={`${inputClasses} resize-y leading-normal`}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {saved && !dirty && <span className="text-[12.5px] font-medium text-green-deep">Saved</span>}
        {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
      </div>
    </div>
  );
}
