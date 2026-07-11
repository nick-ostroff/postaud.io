-- 0006: widen memberships/users SELECT policies so org admins (and any org
-- member) can see the full workspace roster, not just their own row.
--
-- current_org_id() was already made SECURITY DEFINER in
-- 0003_fix_memberships_rls_recursion.sql, so it's safe to reference from a
-- broader memberships policy without recursing — it evaluates as the
-- function owner, bypassing RLS on the memberships table it queries
-- internally.

create policy "org members read" on memberships
  for select using (organization_id = current_org_id());

-- The members roster join (memberships -> users) also needs org-mates to be
-- visible, not just the caller's own `users` row (0002_users_rls.sql only
-- granted `id = auth.uid()`).
create policy "org users read" on users
  for select using (
    exists (
      select 1 from memberships m
      where m.user_id = users.id and m.organization_id = current_org_id()
    )
  );
