-- 0024_question_plan_to_queue.sql
-- The wizard's drafted first-session questions used to be stored as
-- non-must-cover `topics` rows (a pre-queue workaround). Questions belong in
-- `queued_questions`; topics are subjects to cover. Move the existing
-- question rows over and delete them from topics.
--
-- Identifying them: at series-creation time only two topic shapes exist —
-- must-cover chips (must_cover=true, description null) and plan questions
-- (must_cover=false, description = the question text). Pipeline-created
-- topics also carry descriptions but are born AFTER the first session, so
-- the created-within-5-minutes-of-the-series guard keeps them out.
-- facts.topic_id is ON DELETE SET NULL, so linked memories survive (their
-- topic label falls back to "General").

insert into queued_questions (series_id, text, source, created_by, position)
select
  t.series_id,
  t.description,
  'member',
  s.created_by,
  coalesce(
    (select max(q.position) + 1 from queued_questions q
      where q.series_id = t.series_id and q.status = 'pending'),
    0
  ) + row_number() over (partition by t.series_id order by t.position) - 1
from topics t
join series s on s.id = t.series_id
where t.must_cover = false
  and t.suggested = false
  and t.description is not null
  and t.created_at < s.created_at + interval '5 minutes'
  and not exists (
    select 1 from queued_questions q2
    where q2.series_id = t.series_id
      and q2.status = 'pending'
      and q2.text = t.description
  );

delete from topics t
using series s
where s.id = t.series_id
  and t.must_cover = false
  and t.suggested = false
  and t.description is not null
  and t.created_at < s.created_at + interval '5 minutes';
