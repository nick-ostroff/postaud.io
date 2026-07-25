-- 0027: the spend ledger outlives what it paid for.
--
-- interview_usage rows used to cascade away with their interview, so deleting
-- a mistaken session (or a whole series) also erased the record of what that
-- session cost — the workspace activity log could never show a firm all-time
-- total. Costs were already incurred; the ledger keeps them.

-- 1. Detach the ledger from the interview lifecycle: nullable FK, SET NULL on
--    delete instead of CASCADE. Rows stay org-scoped forever.
alter table interview_usage
  alter column interview_id drop not null;

alter table interview_usage
  drop constraint interview_usage_interview_id_fkey;

alter table interview_usage
  add constraint interview_usage_interview_id_fkey
    foreign key (interview_id) references interviews(id) on delete set null;

-- 2. Human-readable snapshot of where the spend came from ("Dad's Stories —
--    Session 3"), stamped by the delete routes just before the interview /
--    series rows go away — orphaned ledger rows still read as something in
--    the activity log.
alter table interview_usage
  add column context_label text;

-- 3. Org admins can read the whole workspace ledger (the settings activity
--    log), including orphaned rows the per-interview "usage read" policy can
--    no longer see once the interview join is gone.
create policy "usage admin read" on interview_usage for select
  using (is_org_admin() and organization_id = current_org_id());
