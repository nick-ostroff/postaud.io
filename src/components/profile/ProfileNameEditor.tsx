"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { updateProfileNameAction } from "@/app/app/settings/profile-actions";

/**
 * The display name on the profile screen: shown as the page heading with a
 * quiet "Edit" affordance that swaps in an input + Save. Persists through
 * `updateProfileNameAction` and refreshes so the nav/sidebar pick up the new
 * name. `fallback` (the email prefix) is the placeholder and the value the
 * server falls back to when the field is left blank.
 */
export function ProfileNameEditor({ name, fallback }: { name: string; fallback: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateProfileNameAction(value);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-2 lg:justify-start">
        <h1 className="text-[26px]">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setError(null);
            setEditing(true);
          }}
          className="text-[12.5px] font-medium text-green-deep hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 lg:items-start">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={fallback}
        disabled={busy}
        aria-label="Display name"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape" && !busy) setEditing(false);
        }}
        className="w-full max-w-xs rounded-lg border border-line-strong bg-card px-3 py-2 text-[16px] text-ink"
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-[12.5px] text-amber">{error}</p>}
    </div>
  );
}
