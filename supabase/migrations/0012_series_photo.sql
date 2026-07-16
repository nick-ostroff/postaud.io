-- 0012_series_photo.sql
-- Optional subject photo for a series — shown in the avatar circle on the
-- detail page, the series-card grid, and set from the create wizard.
--
-- `photo_path` is the object path inside the public `series-avatars` bucket
-- (e.g. `${orgId}/${seriesId}/${uuid}.webp`), mirroring how `interviews`
-- stores `audio_path` rather than a full URL. Null means "no photo — fall
-- back to initials." A fresh uuid segment per upload busts the CDN cache when
-- a photo is replaced; the route deletes the prior object.

alter table series
  add column photo_path text null;

-- Public bucket: series photos are display avatars fetched straight from an
-- <img> tag via getPublicUrl, so no signed-URL round-trip on every render.
-- Uploads happen via the service role (bypasses RLS); public read needs no
-- storage.objects policy on a `public = true` bucket.
insert into storage.buckets (id, name, public) values ('series-avatars','series-avatars', true)
  on conflict (id) do nothing;
