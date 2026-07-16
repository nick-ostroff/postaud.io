-- 0013_profile_photo.sql
-- Optional headshot for a user — shown in the avatar circle on the profile
-- screen, the top nav, and the desktop sidebar.
--
-- The object path lives in Supabase auth `user_metadata.avatar_path`
-- (e.g. `${userId}/${uuid}.webp`), not a DB column, mirroring how
-- `series.photo_path` stores a path rather than a full URL. Null / absent
-- means "no photo — fall back to initials." A fresh uuid segment per upload
-- busts the CDN cache when a photo is replaced; the route deletes the prior
-- object.

-- Public bucket: profile photos are display avatars fetched straight from an
-- <img> tag via getPublicUrl, so no signed-URL round-trip on every render.
-- Uploads happen via the service role (bypasses RLS); public read needs no
-- storage.objects policy on a `public = true` bucket.
insert into storage.buckets (id, name, public) values ('profile-avatars','profile-avatars', true)
  on conflict (id) do nothing;
