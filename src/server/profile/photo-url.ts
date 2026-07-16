/**
 * Public URL for a user's headshot stored in the `profile-avatars` bucket.
 *
 * The bucket is public, so the URL is deterministic — no Supabase client and
 * no signed-URL round-trip needed. Pure and env-only (`NEXT_PUBLIC_*` is
 * inlined at build), so it's safe in server components, client components, and
 * the nav alike. Returns null when there's no photo (fall back to initials).
 *
 * Mirrors `seriesPhotoUrl` / `SERIES_AVATAR_BUCKET`.
 */
export const PROFILE_AVATAR_BUCKET = "profile-avatars";

export function profilePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${path}`;
}
