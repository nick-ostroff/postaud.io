-- 0014_users_profile_sync.sql
-- Profile edits (Settings) write to auth `user_metadata.full_name` /
-- `.avatar_path`, but roster surfaces (series "Who's involved", access page,
-- members page) read `public.users` via joins — so edits never showed there.
--
-- Fix: mirror both fields onto `public.users`. The profile save paths now
-- write here too (service role); this migration adds the column and backfills
-- existing rows from auth metadata so already-edited profiles catch up.

alter table public.users add column if not exists avatar_path text;

update public.users u
set
  display_name = coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), u.display_name),
  avatar_path  = coalesce(nullif(au.raw_user_meta_data->>'avatar_path', ''), u.avatar_path)
from auth.users au
where au.id = u.id;
