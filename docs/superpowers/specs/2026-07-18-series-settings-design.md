# Series Settings Screen — Design

**Date:** 2026-07-18
**Status:** Approved by Nick; built (7baffc1 + follow-up). One approved-then-revised
point: access management is EMBEDDED in the settings page (the old
`/access` URL redirects here) rather than linked, since the implementation
landed that way and it reads well — the standalone Access page is gone.

## Problem

Series are configured once through the creation wizard (`/app/series/new`) and
then most of those choices become invisible. Admins have no screen to go back
and change the general settings — title, goal, photo, interview guide-rails —
after creation. Members/access has its own page, but nothing ties it together.

## Solution

A new admin-only settings screen at `/app/series/[id]/settings` that edits the
fields `PATCH /api/series/[id]` already accepts, reusing the wizard's form
components. **No API changes are needed** — the PATCH (guide-rail fields),
photo upload (`POST /api/series/[id]/photo`), and archive
(`DELETE /api/series/[id]`) endpoints all exist.

## Routes & files

| File | Role |
|---|---|
| `src/app/app/series/[id]/settings/page.tsx` | Server page: `getViewer()` + `getSeries()`, redirect non-admins to `/app/series/[id]` (same guard as the Access page), fetch access summary, render form |
| `src/app/app/series/[id]/settings/SeriesDetailsForm.tsx` | Client form: title, relationship, goal |
| `src/app/app/series/[id]/settings/InterviewGuideForm.tsx` | Client form: voice, opening prompt, don't-bring-up, tone, length, depth, planned sessions |
| `src/app/app/series/[id]/settings/AccessManager.tsx` | Moved from the old Access page |
| `src/app/app/series/[id]/settings/ArchiveSeriesButton.tsx` | Type-the-title confirm → DELETE |

**Entry point:** a "Settings" ghost `Button` in the series-hub header, next to
the existing Access button. The "Manage access →" sidebar link stays.

## Sections

Each section is a `Card` with its own Save button and its own
idle/saving/saved/error state (wizard pattern), so a small change never
re-submits unrelated fields.

1. **Basics** — series photo (`SeriesPhotoEditor` with `canEdit`, already
   POSTs to the photo endpoint and refreshes), title, goal, subject
   relationship. Text inputs use the wizard's `formkit` (`WizardField`,
   `inputClasses`, `textareaClasses`).
2. **Interview guide** — opening prompt, don't-bring-up (`ChipEditor`), tone
   (`RadioCard`), session length 10/20/45 (`RadioCard`), voice
   (`VoicePicker`; server re-derives `interviewer_name` from the voice),
   depth (`RadioCard`), planned sessions (number input, blank = open-ended).
3. **Access** — the Owners card + "Who can see this" card with the full
   `AccessManager` (moved from the old Access page, which now redirects
   here). Subject pinned with implicit-access note; no-account subjects get
   the hand-the-mic explainer card.
4. **Danger zone** — "Archive series". Type the series title to confirm,
   then `DELETE /api/series/[id]` (sets `status='archived'`, history kept)
   and redirect to `/app/series`.

**Excluded:** the topic queue (must-cover) — already editable on the series
hub itself.

## Save behavior

- Each section PATCHes only its own fields; empty optional strings send `""`
  (the schema trims), `plannedSessions` blank sends `null`.
- On success: brief "Saved" state + `router.refresh()` so the hub/header pick
  up title/photo changes.
- On error: inline error text in the section, fields stay editable.

## Testing

- Page test: non-admin gets redirected to the series hub; admin renders.
- Form test: saving a section sends only that section's fields to PATCH;
  archive requires the exact title before the button enables.
- API behavior is already covered by existing `PATCH`/`DELETE` route tests.
