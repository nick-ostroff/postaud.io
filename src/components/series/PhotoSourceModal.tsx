"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const UTM = "utm_source=postaudio&utm_medium=referral";

type UnsplashResult = {
  id: string;
  alt: string | null;
  color: string | null;
  thumbUrl: string;
  regularUrl: string;
  downloadLocation: string;
  photographerName: string;
  photographerUrl: string;
};

const SEARCH_ERRORS: Record<string, string> = {
  not_configured: "Unsplash search isn't set up yet — add an UNSPLASH_ACCESS_KEY.",
  rate_limited: "Unsplash is rate-limiting us — try again in a minute.",
};

/**
 * Source chooser for the series photo: upload a file, or search Unsplash and
 * pick a result. Either path ends in a `File` the caller feeds to the existing
 * `ImageCropperModal` — this modal never uploads anything itself. Search goes
 * through our `/api/unsplash/*` proxy (key stays server-side); the picked
 * image's bytes come straight from Unsplash's CDN, which allows CORS.
 */
export function PhotoSourceModal({
  title = "Series photo",
  onUpload,
  onPicked,
  onClose,
}: {
  title?: string;
  /** User chose "upload" — caller opens its file input (modal closes itself first). */
  onUpload: () => void;
  /** User picked an Unsplash photo, downloaded and wrapped as a File. */
  onPicked: (file: File) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashResult[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [busy, setBusy] = useState<"search" | "more" | "pick" | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function search(nextPage: number) {
    const q = query.trim();
    if (!q) return;
    setBusy(nextPage === 1 ? "search" : "more");
    setError(null);
    try {
      const res = await fetch(`/api/unsplash/search?query=${encodeURIComponent(q)}&page=${nextPage}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError((body?.error && SEARCH_ERRORS[body.error]) ?? "Search failed — please try again.");
        return;
      }
      setResults((prev) => (nextPage === 1 ? body.results : [...(prev ?? []), ...body.results]));
      setPage(nextPage);
      setTotalPages(body.totalPages);
    } catch {
      setError("Search failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function pick(photo: UnsplashResult) {
    setBusy("pick");
    setPickingId(photo.id);
    setError(null);
    try {
      // Required by Unsplash's API terms on every pick; best-effort — a failed
      // ping shouldn't block the user's photo.
      fetch("/api/unsplash/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
      }).catch(() => {});

      const res = await fetch(photo.regularUrl);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      onPicked(new File([blob], `unsplash-${photo.id}.jpg`, { type: blob.type || "image/jpeg" }));
    } catch {
      setError("Couldn't fetch that photo — try another one.");
      setBusy(null);
      setPickingId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,18,15,0.55)] p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line-strong bg-card p-5 shadow-xl">
        <h3 className="mb-3">{title}</h3>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => {
              onClose();
              onUpload();
            }}
          >
            Upload a photo
          </Button>
          <span className="text-[12.5px] text-muted">or search Unsplash:</span>
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search(1);
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try "sunset", "family dinner", "workshop"…'
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-green"
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={busy !== null || query.trim().length === 0}>
            {busy === "search" ? "Searching…" : "Search"}
          </Button>
        </form>

        {error && <p className="mt-3 text-[12.5px] text-amber">{error}</p>}

        {results && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {results.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No photos found — try a different search.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {results.map((p) => (
                    <figure key={p.id} className="m-0">
                      <button
                        type="button"
                        onClick={() => pick(p)}
                        disabled={busy !== null}
                        className="group relative block w-full cursor-pointer overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-green"
                        style={{ backgroundColor: p.color ?? undefined }}
                        aria-label={p.alt ? `Use photo: ${p.alt}` : "Use this photo"}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.thumbUrl}
                          alt={p.alt ?? ""}
                          loading="lazy"
                          className="aspect-square w-full object-cover transition-opacity group-hover:opacity-85"
                        />
                        {pickingId === p.id && (
                          <span className="absolute inset-0 flex items-center justify-center bg-[rgba(20,18,15,0.5)] text-[12px] font-medium text-white">
                            Fetching…
                          </span>
                        )}
                      </button>
                      <figcaption className="mt-0.5 truncate text-[10.5px] text-faint">
                        <a
                          href={`${p.photographerUrl}?${UTM}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {p.photographerName}
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                {page < totalPages && (
                  <div className="mt-3 flex justify-center">
                    <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => search(page + 1)}>
                      {busy === "more" ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-faint">
            Photos from{" "}
            <a
              href={`https://unsplash.com/?${UTM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Unsplash
            </a>
          </span>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy === "pick"}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
