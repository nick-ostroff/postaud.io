"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/Button";

/** On-screen diameter of the crop circle. */
const VIEWPORT = 288;
/** Stored image is a square this many px on a side (the circle's bounding box). */
const OUTPUT = 512;
const MAX_ZOOM = 3;

type Natural = { w: number; h: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Self-contained circular photo cropper — no external dependency. Shows the
 * chosen image inside a circular viewport the user can drag to reposition and
 * zoom, then exports the visible square (bounding box of the circle) as a
 * downsized webp Blob. WYSIWYG: the circle you see is exactly what gets stored
 * and shown in the avatar.
 */
export function ImageCropperModal({
  file,
  busy = false,
  error = null,
  title = "Crop photo",
  onCancel,
  onCropped,
}: {
  file: File | null;
  busy?: boolean;
  error?: string | null;
  title?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Object URL for the chosen file, derived (not stored) so we never call
  // setState from an effect. The transform (natural/zoom/offset) resets in
  // `handleImageLoad`, which fires each time this url swaps into the <img>.
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [natural, setNatural] = useState<Natural | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // baseScale maps the image's shorter side to the viewport ("cover"). At
  // zoom 1 the shorter side exactly fills the circle.
  const baseScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const displayed = natural
    ? { w: natural.w * baseScale * zoom, h: natural.h * baseScale * zoom }
    : { w: VIEWPORT, h: VIEWPORT };

  const clampOffset = useCallback(
    (x: number, y: number, dispW: number, dispH: number) => ({
      x: clamp(x, VIEWPORT - dispW, 0),
      y: clamp(y, VIEWPORT - dispH, 0),
    }),
    [],
  );

  // Revoke the object URL once it's no longer rendered.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    setNatural(nat);
    const scale = VIEWPORT / Math.min(nat.w, nat.h);
    const dispW = nat.w * scale;
    const dispH = nat.h * scale;
    setZoom(1);
    setOffset({ x: (VIEWPORT - dispW) / 2, y: (VIEWPORT - dispH) / 2 });
  }

  function applyZoom(next: number) {
    if (!natural) return;
    const nextZoom = clamp(next, 1, MAX_ZOOM);
    // Anchor the zoom on the viewport center so the framed face stays put.
    const natCenterX = (VIEWPORT / 2 - offset.x) / (baseScale * zoom);
    const natCenterY = (VIEWPORT / 2 - offset.y) / (baseScale * zoom);
    const dispW = natural.w * baseScale * nextZoom;
    const dispH = natural.h * baseScale * nextZoom;
    const nx = VIEWPORT / 2 - natCenterX * baseScale * nextZoom;
    const ny = VIEWPORT / 2 - natCenterY * baseScale * nextZoom;
    setZoom(nextZoom);
    setOffset(clampOffset(nx, ny, dispW, dispH));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.px);
    const ny = drag.current.oy + (e.clientY - drag.current.py);
    setOffset(clampOffset(nx, ny, displayed.w, displayed.h));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function save() {
    const img = imgRef.current;
    if (!img || !natural || busy) return;
    const px = baseScale * zoom; // displayed px per natural px
    const sSize = VIEWPORT / px; // source square side, in natural px
    const sx = -offset.x / px;
    const sy = -offset.y / px;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(
      (blob) => {
        if (blob) onCropped(blob);
      },
      "image/webp",
      0.85,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,18,15,0.55)] p-4"
      onPointerDown={(e) => {
        // Backdrop click cancels; clicks inside the panel stop here.
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-line-strong bg-card p-5 shadow-xl">
        <h3 className="mb-1">{title}</h3>
        <p className="mb-4 text-[12.5px] text-muted">Drag to reposition · pinch or use the slider to zoom.</p>

        <div className="flex flex-col items-center">
          <div
            className="relative touch-none select-none overflow-hidden rounded-full border border-line-strong bg-[rgba(33,30,26,0.06)]"
            style={{ width: VIEWPORT, height: VIEWPORT, cursor: natural ? "grab" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={url}
                alt=""
                onLoad={handleImageLoad}
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: offset.x,
                  top: offset.y,
                  width: displayed.w,
                  height: displayed.h,
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-[rgba(255,255,255,0.4)]" />
          </div>

          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={busy || !natural}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="mt-4 w-full max-w-[288px] accent-green"
          />
        </div>

        {error && <p className="mt-3 text-[12.5px] text-amber">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={save} disabled={busy || !natural}>
            {busy ? "Saving…" : "Save photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
