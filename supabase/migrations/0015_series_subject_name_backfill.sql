-- 0015_series_subject_name_backfill.sql
-- `series.subject_name` was snapshotted at creation for account-holding
-- subjects (self/member) and never updated on profile rename — so a series
-- created before the user set their name kept showing the email-prefix
-- placeholder. Profile renames now propagate (profile-actions updates every
-- series where subject_user_id = the user); this catches existing rows up.

update public.series s
set subject_name = u.display_name
from public.users u
where s.subject_user_id = u.id
  and u.display_name is not null
  and u.display_name <> ''
  and s.subject_name is distinct from u.display_name;
