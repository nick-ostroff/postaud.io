"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: "That image is too large — try a smaller one.",
  unsupported_type: "That file type isn't supported.",
  Forbidden: "You don't have permission to change this photo.",
};

/**
 * The series avatar on the detail page. Read-only for non-admins (plain
 * `Avatar`); for admins it becomes a button that opens a file picker + circular
 * cropper and POSTs the result to `/api/series/[id]/photo`, refreshing the page
 * so the new photo (and the card grid) pick it up.
 */
export function SeriesPhotoEditor({
  seriesId,
  name,
  photoUrl,
  canEdit,
  size = "md",
}: {
  seriesId: string;
  name: string;
  photoUrl: string | null;
  canEdit: boolean;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <Avatar name={name} size={size} tone="plain" src={photoUrl} />;
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = ""; // let the same file be re-picked later
    if (chosen) {
      setError(null);
      setFile(chosen);
    }
  }

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError((body?.error && UPLOAD_ERRORS[body.error]) ?? "Could not save the photo.");
        setBusy(false);
        return;
      }
      setFile(null);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="group relative -m-0.5 cursor-pointer rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-green"
        aria-label={photoUrl ? "Change series photo" : "Add series photo"}
        title={photoUrl ? "Change photo" : "Add photo"}
      >
        <Avatar name={name} size={size} tone="plain" src={photoUrl} />
        <span className="pointer-events-none absolute inset-0.5 flex items-center justify-center rounded-full bg-[rgba(20,18,15,0.5)] text-white opacity-0 transition-opacity group-hover:opacity-100">
          <CameraIcon />
        </span>
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
      {file && (
        <ImageCropperModal
          file={file}
          busy={busy}
          error={error}
          title={photoUrl ? "Change photo" : "Add photo"}
          onCancel={() => {
            if (!busy) {
              setFile(null);
              setError(null);
            }
          }}
          onCropped={upload}
        />
      )}
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
