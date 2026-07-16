# Profile Editor — Avatar Upload + Display Name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user edit their display name and upload/crop a headshot from `/app/settings`, and show that photo on the current user's own avatars.

**Architecture:** Cropping/resizing happens client-side (react-easy-crop → 512×512 WebP on a canvas). The blob uploads to a new public Supabase Storage bucket `avatars` via the browser client; a server action then persists `full_name` + `avatar_url` into Supabase auth `user_metadata` and revalidates `/app`. The shared `Avatar` component renders the photo when an `imageUrl` is present, else today's initials.

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (auth + storage, `@supabase/ssr`), React 19, Tailwind, `react-easy-crop`, Vitest (node environment).

## Global Constraints

- **This is NOT stock Next.js** — read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md`).
- **SSR-safe:** no bare `window`/`document`/`localStorage` outside `"use client"` components or client-only handlers.
- **Tests are node-only:** vitest `include` is `src/**/__tests__/**/*.test.ts` (note: `.test.ts`, not `.tsx`), no jsdom / testing-library. Write pure-function and mocked-boundary tests only. Do NOT add DOM-render tests or new test tooling. Presentational components (`Avatar`, cropper, sheet) are verified manually, not with render tests.
- **Test file layout:** co-locate under a sibling `__tests__/` dir named `<thing>.test.ts` (matches repo, e.g. `src/lib/__tests__/names.test.ts`).
- **Supabase server client:** `import { createClient } from "@/db/server"` then `await createClient()` (async). Browser client: `import { createClient } from "@/db/client"` (sync).
- **Commit style:** Conventional Commits (`feat(...)`, `fix(...)`, `test(...)`, `chore(...)`). Do not push — commit only; the human pushes.
- **Migrations:** next number is `0012`, filename `supabase/migrations/0012_<slug>.sql`, leading `--` comment header explaining the change (matches `0011`).

---

## File Structure

- `supabase/migrations/0012_avatars_bucket.sql` — new public `avatars` bucket + RLS policies (Task 1).
- `src/lib/profile.ts` — pure helpers: `resolveDisplayName`, `cropDrawRect`, `avatarStoragePath` (Tasks 2, 4).
- `src/lib/__tests__/profile.test.ts` — unit tests for the above (Tasks 2, 4).
- `src/components/ui/Avatar.tsx` — add optional `imageUrl` prop (Task 3).
- `src/lib/canvas-crop.ts` — client-only: load image + export cropped WebP blob (Task 4).
- `src/app/app/settings/profile-actions.ts` — `updateProfileAction` server action (Task 5).
- `src/app/app/settings/__tests__/profile-actions.test.ts` — action test with mocked Supabase (Task 5).
- `src/app/app/settings/EditProfileSheet.tsx` — client sheet: name field + photo picker + cropper + upload/save (Task 6).
- `src/app/app/settings/page.tsx` — render the sheet, pass `avatarUrl` to header `Avatar` (Task 7).
- `src/app/app/layout.tsx` — thread `avatarUrl` to nav (Task 8).
- `src/components/nav/AppTopNav.tsx`, `src/components/nav/Sidebar.tsx` — accept + pass `imageUrl` (Task 8).
- `package.json` — add `react-easy-crop` (Task 3).

---

### Task 1: Avatars storage bucket + RLS migration

**Files:**
- Create: `supabase/migrations/0012_avatars_bucket.sql`

**Interfaces:**
- Produces: a public bucket `avatars`; authenticated users may insert/update objects only under a top folder equal to their `auth.uid()`; anyone may read.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_avatars_bucket.sql`:

```sql
-- 0012_avatars_bucket.sql
-- Public storage bucket for user profile photos. Objects live under a
-- per-user folder (`{userId}/headshot.webp`); an authenticated user may
-- write only inside their own folder, and reads are public so the CDN URL
-- stored in auth user_metadata.avatar_url works unauthenticated.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Sanity-check the SQL parses**

Run: `grep -c "create policy" supabase/migrations/0012_avatars_bucket.sql`
Expected: `3`

(The migration is applied against the real Supabase project by the human via the Supabase MCP/CLI at deploy time — see the wrap-up note. No local DB run here.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_avatars_bucket.sql
git commit -m "feat(profile): add public avatars storage bucket with per-user RLS"
```

---

### Task 2: Pure profile helpers — name resolution + storage path

**Files:**
- Create: `src/lib/profile.ts`
- Test: `src/lib/__tests__/profile.test.ts`

**Interfaces:**
- Produces:
  - `resolveDisplayName(input: string | null | undefined, fallback: string): string` — trims `input`; returns it if non-empty, else `fallback`.
  - `avatarStoragePath(userId: string): string` — returns `` `${userId}/headshot.webp` ``.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avatarStoragePath, resolveDisplayName } from "@/lib/profile";

describe("resolveDisplayName", () => {
  it("returns the trimmed input when non-empty", () => {
    expect(resolveDisplayName("  Nick Ostroff  ", "you")).toBe("Nick Ostroff");
  });

  it("falls back when input is empty, whitespace, null, or undefined", () => {
    expect(resolveDisplayName("", "nick")).toBe("nick");
    expect(resolveDisplayName("   ", "nick")).toBe("nick");
    expect(resolveDisplayName(null, "nick")).toBe("nick");
    expect(resolveDisplayName(undefined, "nick")).toBe("nick");
  });
});

describe("avatarStoragePath", () => {
  it("keys the object under a per-user folder", () => {
    expect(avatarStoragePath("user-123")).toBe("user-123/headshot.webp");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/profile.test.ts`
Expected: FAIL — cannot resolve `@/lib/profile`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/profile.ts`:

```ts
/** Trims a candidate display name; falls back when it's blank. */
export function resolveDisplayName(
  input: string | null | undefined,
  fallback: string,
): string {
  const trimmed = (input ?? "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Storage object key for a user's headshot, under their own RLS folder. */
export function avatarStoragePath(userId: string): string {
  return `${userId}/headshot.webp`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/profile.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile.ts src/lib/__tests__/profile.test.ts
git commit -m "feat(profile): add display-name resolution and avatar path helpers"
```

---

### Task 3: Avatar supports a photo + add cropper dependency

**Files:**
- Modify: `src/components/ui/Avatar.tsx`
- Modify: `package.json` (add dependency)

**Interfaces:**
- Consumes: nothing.
- Produces: `Avatar` accepts `imageUrl?: string`. When set, renders a filling `<img>` (`object-cover`, rounded, sized to the existing box) with the initials string as `alt`; otherwise renders today's initials tile. Existing call sites (no `imageUrl`) are unchanged.

- [ ] **Step 1: Add the dependency**

Run: `npm install react-easy-crop`
Expected: `package.json` gains `react-easy-crop` under `dependencies`; lockfile updates.

- [ ] **Step 2: Modify `Avatar`**

In `src/components/ui/Avatar.tsx`, change the `Avatar` function to accept and render `imageUrl`. Replace the existing `export function Avatar(...)` block with:

```tsx
/** Initials avatar matching `.avatar`/`.avatar.lg`/`.avatar.warm`/`.avatar.plain` in postaudio-mockups.css. When `imageUrl` is set, shows the photo instead of initials. */
export function Avatar({
  name,
  tone = "green",
  size = "md",
  imageUrl,
}: {
  name: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={initials(name)}
        className={`inline-block shrink-0 rounded-full object-cover ${sizeClasses[size]}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${toneClasses[tone]} ${sizeClasses[size]}`}
    >
      {initials(name)}
    </span>
  );
}
```

Note: `sizeClasses` includes `text-*` sizing that's inert on an `<img>` — harmless; keeping the same class keeps the box dimensions identical (`w-8 h-8` / `w-11 h-11`).

- [ ] **Step 3: Verify the app still compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `Avatar.tsx` (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Avatar.tsx package.json package-lock.json
git commit -m "feat(profile): let Avatar render a photo and add react-easy-crop"
```

---

### Task 4: Crop geometry helper + canvas-to-WebP

**Files:**
- Modify: `src/lib/profile.ts` (add `cropDrawRect`)
- Modify: `src/lib/__tests__/profile.test.ts` (add tests)
- Create: `src/lib/canvas-crop.ts` (client-only canvas work)

**Interfaces:**
- Consumes: react-easy-crop's `croppedAreaPixels` shape `{ x: number; y: number; width: number; height: number }` (source-image pixels).
- Produces:
  - `cropDrawRect(px: CroppedAreaPixels, outputSize: number): { sx: number; sy: number; sWidth: number; sHeight: number; dSize: number }` — the `drawImage` source rect + square destination size.
  - `type CroppedAreaPixels = { x: number; y: number; width: number; height: number }`.
  - `getCroppedWebp(imageSrc: string, px: CroppedAreaPixels, outputSize?: number): Promise<Blob>` — loads the image and returns a square WebP blob (default 512).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/profile.test.ts`:

```ts
import { cropDrawRect } from "@/lib/profile";

describe("cropDrawRect", () => {
  it("maps the cropped pixel area to a square draw rect", () => {
    const rect = cropDrawRect({ x: 10, y: 20, width: 300, height: 300 }, 512);
    expect(rect).toEqual({ sx: 10, sy: 20, sWidth: 300, sHeight: 300, dSize: 512 });
  });

  it("defaults nothing — the destination is always the given square size", () => {
    const rect = cropDrawRect({ x: 0, y: 0, width: 128, height: 128 }, 256);
    expect(rect.dSize).toBe(256);
    expect(rect.sWidth).toBe(128);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/profile.test.ts`
Expected: FAIL — `cropDrawRect` is not exported.

- [ ] **Step 3: Implement `cropDrawRect` + type in `src/lib/profile.ts`**

Append to `src/lib/profile.ts`:

```ts
export type CroppedAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Turns react-easy-crop's source-pixel crop box into the arguments for a
 * canvas `drawImage` that renders it into a square `outputSize`×`outputSize`.
 */
export function cropDrawRect(px: CroppedAreaPixels, outputSize: number) {
  return {
    sx: px.x,
    sy: px.y,
    sWidth: px.width,
    sHeight: px.height,
    dSize: outputSize,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/profile.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Implement the client-only canvas exporter**

Create `src/lib/canvas-crop.ts`:

```ts
import { cropDrawRect, type CroppedAreaPixels } from "@/lib/profile";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the selected image."));
    img.src = src;
  });
}

/**
 * Renders the chosen crop of `imageSrc` into a square WebP blob. Runs only in
 * the browser (uses Image + canvas); call it from client event handlers.
 */
export async function getCroppedWebp(
  imageSrc: string,
  px: CroppedAreaPixels,
  outputSize = 512,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const { sx, sy, sWidth, sHeight, dSize } = cropDrawRect(px, outputSize);

  const canvas = document.createElement("canvas");
  canvas.width = dSize;
  canvas.height = dSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, dSize, dSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      "image/webp",
      0.9,
    );
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profile.ts src/lib/__tests__/profile.test.ts src/lib/canvas-crop.ts
git commit -m "feat(profile): add crop geometry helper and canvas WebP exporter"
```

---

### Task 5: `updateProfileAction` server action

**Files:**
- Create: `src/app/app/settings/profile-actions.ts`
- Test: `src/app/app/settings/__tests__/profile-actions.test.ts`

**Interfaces:**
- Consumes: `resolveDisplayName` (Task 2); `createClient` from `@/db/server`; `revalidatePath` from `next/cache`.
- Produces: `updateProfileAction(input: { fullName: string; avatarUrl?: string | null }): Promise<{ ok: true } | { ok: false; error: string }>`. Persists `full_name` (via `resolveDisplayName` with the email-prefix fallback) and, when `avatarUrl` is a non-empty string, `avatar_url` into `user_metadata`. Revalidates `/app` layout. On no user or Supabase error, returns `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/settings/__tests__/profile-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.fn();
const getUser = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/db/server", () => ({
  createClient: async () => ({ auth: { getUser, updateUser } }),
}));

import { updateProfileAction } from "@/app/app/settings/profile-actions";

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
  getUser.mockReset().mockResolvedValue({
    data: { user: { id: "u1", email: "nick@ostroff.la" } },
  });
  revalidatePath.mockReset();
});

describe("updateProfileAction", () => {
  it("persists name + avatar and revalidates the app layout", async () => {
    const res = await updateProfileAction({
      fullName: "  Nick  ",
      avatarUrl: "https://cdn/avatars/u1/headshot.webp?t=1",
    });
    expect(res).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({
      data: { full_name: "Nick", avatar_url: "https://cdn/avatars/u1/headshot.webp?t=1" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });

  it("falls back to the email prefix when the name is blank, and omits avatar when not given", async () => {
    const res = await updateProfileAction({ fullName: "   " });
    expect(res).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: "nick" } });
  });

  it("returns an error when Supabase rejects the update", async () => {
    updateUser.mockResolvedValue({ error: { message: "nope" } });
    const res = await updateProfileAction({ fullName: "Nick" });
    expect(res).toEqual({ ok: false, error: "nope" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an error when there is no signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateProfileAction({ fullName: "Nick" });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/app/settings/__tests__/profile-actions.test.ts`
Expected: FAIL — cannot resolve `@/app/app/settings/profile-actions`.

- [ ] **Step 3: Implement the action**

Create `src/app/app/settings/profile-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/db/server";
import { resolveDisplayName } from "@/lib/profile";

type UpdateProfileInput = { fullName: string; avatarUrl?: string | null };
type UpdateProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Persists the current user's display name and (optionally) avatar URL into
 * Supabase auth `user_metadata`, then revalidates the app shell so the nav and
 * settings avatars pick up the change. Name is trimmed and falls back to the
 * email prefix rather than persisting an empty string.
 */
export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const fallback = user.email?.split("@")[0] || "You";
  const data: { full_name: string; avatar_url?: string } = {
    full_name: resolveDisplayName(input.fullName, fallback),
  };
  if (typeof input.avatarUrl === "string" && input.avatarUrl.length > 0) {
    data.avatar_url = input.avatarUrl;
  }

  const { error } = await supabase.auth.updateUser({ data });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app", "layout");
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/app/settings/__tests__/profile-actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/app/settings/profile-actions.ts src/app/app/settings/__tests__/profile-actions.test.ts
git commit -m "feat(profile): add updateProfileAction to persist name + avatar"
```

---

### Task 6: EditProfileSheet client component

**Files:**
- Create: `src/app/app/settings/EditProfileSheet.tsx`

**Interfaces:**
- Consumes: `updateProfileAction` (Task 5); `getCroppedWebp` + `CroppedAreaPixels` (Task 4); `avatarStoragePath` (Task 2); `createClient` from `@/db/client`; `Avatar` (Task 3); `react-easy-crop`.
- Produces: `EditProfileSheet({ userId, name, email, avatarUrl }: { userId: string; name: string; email: string; avatarUrl?: string })` — a client component rendering a trigger button and a modal sheet with a name field, photo picker, circular cropper, error line, and Save/Cancel.

- [ ] **Step 1: Implement the component**

Create `src/app/app/settings/EditProfileSheet.tsx`:

```tsx
"use client";

import Cropper from "react-easy-crop";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/db/client";
import { getCroppedWebp } from "@/lib/canvas-crop";
import { avatarStoragePath, type CroppedAreaPixels } from "@/lib/profile";
import { updateProfileAction } from "./profile-actions";

const MAX_BYTES = 10 * 1024 * 1024;

export function EditProfileSheet({
  userId,
  name,
  email,
  avatarUrl,
}: {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(name);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<CroppedAreaPixels | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPixels(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
    setFullName(name);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is over 10 MB — please pick a smaller one.");
      return;
    }
    setError(null);
    setImageSrc(URL.createObjectURL(file));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      let nextUrl: string | undefined;
      if (imageSrc && areaPixels) {
        const blob = await getCroppedWebp(imageSrc, areaPixels);
        const supabase = createClient();
        const path = avatarStoragePath(userId);
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, blob, { upsert: true, contentType: "image/webp" });
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        nextUrl = `${data.publicUrl}?t=${Date.now()}`;
      }

      const res = await updateProfileAction({ fullName, avatarUrl: nextUrl });
      if (!res.ok) throw new Error(res.error);

      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-medium text-green-deep hover:underline"
      >
        Edit profile
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-[rgba(33,30,26,0.35)]"
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-paper p-5 shadow-xl sm:rounded-2xl">
            <h2 className="serif text-[20px]">Edit profile</h2>

            <label className="mt-4 block text-[12px] font-medium text-muted">Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink"
              placeholder={email.split("@")[0]}
            />

            <div className="mt-4 text-[12px] font-medium text-muted">Photo</div>
            {imageSrc ? (
              <div className="relative mt-2 h-56 w-full overflow-hidden rounded-xl bg-black/80">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, pixels) => setAreaPixels(pixels)}
                />
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3">
                <Avatar name={fullName || name} tone="warm" size="lg" imageUrl={avatarUrl} />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink hover:bg-[rgba(33,30,26,0.03)]"
                >
                  Change photo
                </button>
              </div>
            )}
            {imageSrc && (
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-3 w-full"
                aria-label="Zoom"
              />
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
            />

            {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="text-[13.5px] font-medium text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-lg bg-green-deep px-4 py-2 text-[13.5px] font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify design tokens exist**

Confirm the utility classes used (`bg-paper`, `text-ink`, `text-muted`, `border-line`, `bg-green-deep`/`text-green-deep`, `serif`) are real. Run:

`grep -nE "green-deep|--paper|text-ink|border-line|\.serif" src/app/globals.css | head`
Expected: matches for these tokens. If any is missing, substitute the nearest existing token used elsewhere in `src/app/app/settings/page.tsx` (e.g. plain `text-muted`, `bg-white`) rather than inventing one.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (react-easy-crop ships its own types).

- [ ] **Step 4: Commit**

```bash
git add src/app/app/settings/EditProfileSheet.tsx
git commit -m "feat(profile): add edit-profile sheet with photo crop + upload"
```

---

### Task 7: Wire the sheet + photo into the settings page

**Files:**
- Modify: `src/app/app/settings/page.tsx`

**Interfaces:**
- Consumes: `EditProfileSheet` (Task 6); `user.user_metadata.avatar_url`.
- Produces: settings header shows the photo and offers "Edit profile".

- [ ] **Step 1: Read the current page**

Run: `sed -n '1,50p' src/app/app/settings/page.tsx`
Expected: the component from the spec (imports, `name` derivation, header block).

- [ ] **Step 2: Add the import**

At the top of `src/app/app/settings/page.tsx`, add after the existing `Avatar` import line:

```tsx
import { EditProfileSheet } from "./EditProfileSheet";
```

- [ ] **Step 3: Read the avatar URL and pass it into the header**

After the `name` derivation (`const name = ...`), add:

```tsx
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
```

Then replace the header block (the `<div className="flex flex-col items-center gap-2.5 ...">` … through its closing `</div>` that wraps the avatar + name) with:

```tsx
      <div className="flex flex-col items-center gap-2.5 lg:items-start">
        <span className="lg:hidden">
          <Avatar name={name} tone="warm" size="lg" imageUrl={avatarUrl} />
        </span>
        <div className="text-center lg:text-left">
          <h1 className="text-[26px]">{name}</h1>
          <div className="mt-0.5 text-[13px] text-muted">
            {user.email} · {roleLabel}
          </div>
          <div className="mt-1.5">
            <EditProfileSheet
              userId={user.id}
              name={name}
              email={user.email ?? ""}
              avatarUrl={avatarUrl}
            />
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/settings/page.tsx
git commit -m "feat(profile): show photo and edit-profile control on settings"
```

---

### Task 8: Show the photo in the top nav + sidebar

**Files:**
- Modify: `src/app/app/layout.tsx`
- Modify: `src/components/nav/AppTopNav.tsx`
- Modify: `src/components/nav/Sidebar.tsx`

**Interfaces:**
- Consumes: `user.user_metadata.avatar_url` in the layout; `Avatar`'s `imageUrl` (Task 3).
- Produces: `AppTopNav` and `Sidebar` accept an optional `avatarUrl?: string` and pass it to their `Avatar`.

- [ ] **Step 1: Thread the URL from the layout**

Run: `sed -n '1,60p' src/app/app/layout.tsx` to locate the `name` derivation and the `<Sidebar .../>` / `<AppTopNav .../>` usages.

After the existing `const name = ...` derivation in `src/app/app/layout.tsx`, add:

```tsx
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
```

Then update both usages:

```tsx
        <Sidebar name={name} role={roleLabel} isPlatformAdmin={platformAdmin} avatarUrl={avatarUrl} />
```

```tsx
          <AppTopNav name={name} avatarUrl={avatarUrl} />
```

- [ ] **Step 2: Accept + pass the prop in `AppTopNav`**

In `src/components/nav/AppTopNav.tsx`, change the signature and the `Avatar` usage:

```tsx
export function AppTopNav({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
```

```tsx
        <Avatar name={name} tone="warm" imageUrl={avatarUrl} />
```

- [ ] **Step 3: Accept + pass the prop in `Sidebar`**

In `src/components/nav/Sidebar.tsx`, add `avatarUrl?: string` to the `Props` type, add it to the destructured params, and pass it to the `Avatar`:

```tsx
export function Sidebar({ name, role, isPlatformAdmin = false, avatarUrl }: Props) {
```

```tsx
        <Avatar name={name} imageUrl={avatarUrl} />
```

(Also add `avatarUrl?: string;` to the `type Props = { ... }` declaration near the top.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Full test + build sanity**

Run: `npm test`
Expected: all tests pass (including the new `profile.test.ts` and `profile-actions.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/app/app/layout.tsx src/components/nav/AppTopNav.tsx src/components/nav/Sidebar.tsx
git commit -m "feat(profile): show the current user's photo in nav and sidebar"
```

---

## Deploy note (human, after merge)

The `avatars` bucket + policies in `0012_avatars_bucket.sql` must be applied to the live Supabase project (via the Supabase MCP `apply_migration` or `supabase db push`). Until then, uploads will fail with a bucket/policy error. Do a manual QA pass: pick a photo → crop → save → confirm it appears in the top nav, sidebar, and settings header, and survives a reload.

---

## Self-Review

- **Spec coverage:** Storage bucket + RLS (Task 1) ✓; auth `user_metadata` persistence (Task 5) ✓; `Avatar` `imageUrl` (Task 3) ✓; `EditProfileSheet` (Task 6) ✓; `AvatarCropper`/react-easy-crop + 512² WebP (Tasks 3–4, 6) ✓; upload→URL→action flow (Task 6) ✓; `updateProfileAction` + `revalidatePath("/app","layout")` (Task 5) ✓; photo on top nav/sidebar/settings (Tasks 7–8) ✓; client validation (non-image / >10 MB) + inline error + sheet-stays-open (Task 6) ✓; name trim/fallback (Tasks 2, 5) ✓. Members/series lists intentionally left as initials per spec non-goals ✓.
- **Testing divergence from spec:** The spec listed an "Avatar renders img" render test, but the repo has no jsdom/testing-library and vitest only collects `.test.ts`. Adjusted to node-only tests (crop geometry, name resolution, action with mocked Supabase); `Avatar`/cropper/sheet verified manually. Documented in Global Constraints + deploy note.
- **Placeholder scan:** No TBD/TODO; every code step has complete code.
- **Type consistency:** `CroppedAreaPixels` defined in `profile.ts` (Task 4), consumed identically in `canvas-crop.ts` and `EditProfileSheet`. `updateProfileAction` signature `{ fullName; avatarUrl? }` matches its caller in Task 6. `avatarStoragePath` returns `{userId}/headshot.webp`, matching the RLS folder check in Task 1. `Avatar` `imageUrl?` prop (Task 3) matches all four call sites (Tasks 6–8).
