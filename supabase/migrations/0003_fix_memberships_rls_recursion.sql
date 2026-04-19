-- The original SELECT policy on memberships referenced current_org_id(), which
-- itself queries memberships -> infinite recursion -> zero rows returned.
-- Users should always be able to see their own memberships; scope by user_id.
drop policy if exists "members read memberships" on memberships;
create policy "members read own memberships" on memberships
  for select using (user_id = auth.uid());

-- Make current_org_id() SECURITY DEFINER so it can evaluate regardless of
-- caller's RLS view. This keeps the "org rw" policies on tenant tables
-- working even when nested inside other policy evaluations.
create or replace function current_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
    select organization_id from memberships where user_id = auth.uid() limit 1;
  $$;
