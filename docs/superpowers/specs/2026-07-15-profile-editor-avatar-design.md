# Profile Editor — Avatar Upload + Display Name

**Date:** 2026-07-15
**Status:** Approved, ready for implementation plan

## Goal

Let a signed-in user edit their own profile from the settings screen
(`/app/settings`): change their display name and upload a headshot photo that
they crop to a circular avatar. The cropped photo replaces the initials avatar
everywhere the current user's own avatar is shown.

Workspace name / plan / credits stay read-only — those are owned by the
operator console, not self-serve.

## Non-goals (YAGNI)

- Showing other members' photos in the members / series-access lists. Those
  render *other* users, whose `avatar_url` isn't loaded on those pages. Leaving
  them as initials is fine and is an easy future add.
- Multiple photos, image galleries, or GIF/animated avatars.
- Server-side image processing. All cropping/resizing happens client-side; the
  server only stores the resulting URL + name in auth metadata.

## Architecture

### Storage & data

- New **Supabase Storage bucket `avatars`** (public read), created in migration
  `0012_avatars_bucket.sql`.
- RLS policy on `storage.objects`: an authenticated user may `insert`/`update`
  objects only under a top-level folder equal to their own `auth.uid()`
  (`(storage.foldername(name))[1] = auth.uid()::text`). Public `select` is
  allowed on the bucket so the CDN URL works unauthenticated.
- Upload path: `avatars/{userId}/headshot.webp` with `upsert: true`. Overwriting
  the same key avoids orphaned files. Because a public URL for a fixed key is
  cached, the stored URL carries a `?t={timestamp}` cache-buster.
- Persisted to Supabase **auth `user_metadata`**:
  - `full_name: string`
  - `avatar_url: string` (public URL incl. `?t=` suffix)
  - No new database table or column.

### Components & flow

1. **`Avatar`** (`src/components/ui/Avatar.tsx`) gains an optional
   `imageUrl?: string` prop. When present it renders a filling `<img>`
   (`object-cover`, rounded-full, sized to the existing `md`/`lg` boxes) with
   the initials as `alt`. When absent it renders today's initials tile.
   Fully backward-compatible — existing call sites are unaffected.

2. **`EditProfileSheet`** (new client component, rendered on the settings
   page). Trigger: the avatar / an "Edit profile" control on
   `/app/settings`. Opens a bottom sheet / modal containing:
   - a display-name text field (prefilled from current name)
   - a photo control: current avatar preview + "Change photo" file picker
   - Save / Cancel

3. **`AvatarCropper`** (new client component) wrapping **`react-easy-crop`**:
   circular crop mask, drag-to-pan, zoom slider. On confirm, a hidden canvas
   draws the selected source region and exports a **512×512 WebP** blob
   (quality ~0.9).

4. **Save sequence** (client):
   1. If a new photo was chosen, upload the WebP blob via the browser Supabase
      client to `avatars/{userId}/headshot.webp` (`upsert: true`), then read the
      public URL and append `?t={Date.now()}`.
   2. Call the server action `updateProfileAction({ fullName, avatarUrl })`.

5. **`updateProfileAction`** (server action, `"use server"`): calls
   `supabase.auth.updateUser({ data: { full_name, avatar_url } })` using the
   request-scoped server client, then `revalidatePath("/app", "layout")` so the
   top-nav / sidebar / settings avatars refresh immediately. Returns a typed
   `{ ok: true } | { ok: false; error: string }` result.

### Where the photo shows (current user only)

- Top nav (`AppTopNav`)
- Sidebar (`Sidebar`)
- Settings header (`/app/settings`)

Each of these already has access to the current user; pass
`user_metadata.avatar_url` down to `Avatar` as `imageUrl`.

## Error handling & validation

- Client rejects non-image files and files larger than ~10 MB *before*
  cropping (the picker validates `type`/`size`).
- Crop output is always a small, clean WebP regardless of source size.
- Upload or save failure surfaces an inline error inside the sheet and keeps the
  sheet open, so the user's name edit and chosen photo aren't lost.
- Name is trimmed; empty name falls back to the existing derived name rather
  than persisting an empty string.

## Testing

- **`Avatar`**: renders an `<img>` with the given `imageUrl` when set; renders
  initials when not. Both `md` and `lg` sizes keep their box dimensions.
- **Crop geometry**: a pure helper that converts react-easy-crop's
  `croppedAreaPixels` into the canvas draw rectangle is unit-tested with a few
  crop/zoom cases. The canvas-to-blob wrapper is a thin shell over it.
- **`updateProfileAction`**: with a mocked Supabase client, asserts it calls
  `auth.updateUser` with `{ data: { full_name, avatar_url } }` and revalidates;
  asserts empty name falls back rather than persisting `""`.

## New dependency

- `react-easy-crop` (~15 kB, mobile-friendly drag+zoom cropper).
