-- 0004_admin_panel.sql
-- Adds: org_status enum, organizations.status, audit_logs.actor_email,
-- and tightens interview_requests write RLS to block suspended orgs.

-- =========================================================
-- 1. org_status enum + organizations.status
-- =========================================================
create type org_status as enum ('active', 'suspended');

alter table organizations
  add column status org_status not null default 'active';

-- =========================================================
-- 2. audit_logs.actor_email (for platform-admin actions where the actor
--    is not a member of target_organization_id)
-- =========================================================
alter table audit_logs
  add column actor_email text;

-- =========================================================
-- 3. Tighten RLS on interview_requests to block suspended orgs from
--    CREATING or UPDATING requests. READ/DELETE remain available so
--    suspended orgs can still view/cleanup their own data.
--
-- The existing "org rw" policy (from 0001_init.sql) covers ALL operations;
-- we drop it and replace with per-verb policies.
-- =========================================================
drop policy if exists "org rw" on interview_requests;

create policy "org read" on interview_requests
  for select
  using (organization_id = current_org_id());

create policy "org insert" on interview_requests
  for insert
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org update" on interview_requests
  for update
  using (organization_id = current_org_id())
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org delete" on interview_requests
  for delete
  using (organization_id = current_org_id());
