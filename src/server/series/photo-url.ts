/**
 * Public URL for a series photo stored in the `series-avatars` bucket.
 *
 * The bucket is public, so the URL is deterministic — no Supabase client and
 * no signed-URL round-trip needed. Pure and env-only (`NEXT_PUBLIC_*` is
 * inlined at build), so it's safe in server components, client components, and
 * the card grid alike. Returns null when there's no photo (fall back to
 * initials).
 */
export const SERIES_AVATAR_BUCKET = "series-avatars";

export function seriesPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${SERIES_AVATAR_BUCKET}/${path}`;
}
