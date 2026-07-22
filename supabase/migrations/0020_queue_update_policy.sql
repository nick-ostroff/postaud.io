-- 0020_queue_update_policy.sql
-- Tighten the queued_questions UPDATE policy from can_interview to admin.
--
-- 0019 granted UPDATE to any interview-access member (matching "facts review")
-- so a live quickfire session could flip rows to 'asked'. But every app write
-- to this table — reorder/pin/remove AND markAsked — goes through the service
-- client, which bypasses RLS entirely. So the wide can_interview_series grant
-- protected nothing the app relies on; it only exposed direct PostgREST writes
-- from interview-access members (who could otherwise reorder/remove/re-status
-- the queue straight from the anon/authenticated API). Scope UPDATE to admins,
-- mirroring "topics admin" from 0005. Kept as an UPDATE policy (not `for all`);
-- the "queue insert" policy stays as-is so members can still add questions.
drop policy "queue update" on queued_questions;
create policy "queue update" on queued_questions for update
  using (is_org_admin() and can_view_series(series_id))
  with check (is_org_admin() and can_view_series(series_id));
