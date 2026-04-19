-- RLS for the users table. Enabled after initial seed; mirrors auth.users 1:1.
alter table users enable row level security;
create policy "users read self" on users for select using (id = auth.uid());
create policy "users update self" on users for update using (id = auth.uid()) with check (id = auth.uid());
