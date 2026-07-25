# Unsplash search for the series photo

**Date:** 2026-07-24 · **Status:** Shipped

> **Amended same day:** Unsplash's catalog proved thin on niche terms (e.g.
> pickleball), so search became `GET /api/photo-search` — a merged proxy that
> fans out to Unsplash **and** Pexels (`PEXELS_API_KEY`) in parallel and
> interleaves results. A provider with no key, a rate limit, or an error just
> drops out. Each provider searches square-first and retries unconstrained
> when empty. `/api/unsplash/use` remains for Unsplash's download-tracking
> ping (Pexels needs none). The rest of the design below is unchanged.

## Goal

Give admins a second way to set the series photo: search Unsplash and pick an
image, alongside the existing upload flow. One image per series (the existing
circular `photo_path` avatar) — no schema changes, no new storage.

## Architecture

Client search UI + thin server proxy. The Unsplash access key stays
server-side; a picked photo feeds through the existing `ImageCropperModal`
and the existing storage pipeline (`/api/series/[id]/photo` in settings, the
pending-blob flow in the new-series wizard).

### Backend

- `UNSPLASH_ACCESS_KEY` env var (server-only). In `.env.local`, `.env.example`,
  and all three Vercel environments.
- `GET /api/unsplash/search?query=&page=` — signed-in users with an org only.
  Proxies `api.unsplash.com/search/photos` (squarish orientation, high content
  filter, 24/page) and returns a trimmed shape per result: `id`, `alt`,
  `thumbUrl`, `regularUrl` (crop source, ~1080w), `downloadLocation`,
  `photographerName`, `photographerUrl`. Errors: `503 not_configured` when the
  key is missing, `429 rate_limited` on Unsplash 403, `502 unsplash_error`
  otherwise.
- `POST /api/unsplash/use` `{ downloadLocation }` — fires Unsplash's required
  download-tracking endpoint when a photo is picked (their API terms). Validates
  the URL is `api.unsplash.com/photos/*/download` before calling.

### Frontend

- `PhotoSourceModal` (new, `src/components/series/`) — one compact modal:
  an "Upload a photo" button, an "or search Unsplash" divider, search box +
  thumbnail grid with per-photo "Photo by X" credits linking to Unsplash
  (per their attribution guidelines), and a Load-more pager. Picking a result
  tracks the download, fetches `regularUrl` (Unsplash's image CDN allows CORS),
  and hands back a `File` for the cropper.
- `SeriesPhotoEditor` — tapping the avatar now opens `PhotoSourceModal` instead
  of the file input directly. Both paths land in the existing cropper + POST.
- New-series wizard — "Add photo" opens the same modal; an Unsplash pick lands
  in the existing `photoFile` → crop → pending-blob flow.

## Error handling

Friendly messages for missing key, rate limit, and fetch failures; all errors
keep the modal open so the user can retry.

## Testing

Vitest route tests mirroring the existing photo-route pattern: auth/org gating,
missing key → 503, response trimming, rate-limit passthrough, and
download-location validation on `/use`.
