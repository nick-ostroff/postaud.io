-- 0018_series_vault_links.sql
-- Tracks that a series is linked to a user's Obsidian vault, and whether the
-- user has asked for an update to be sent.
--
-- The server deliberately stores NO local filesystem path — the vault folder
-- and layout live in the plugin's own config. All this table knows is *that* a
-- link exists (so the UI can show a Vault card) and *whether* an update is
-- waiting to be collected.
--
-- `push_requested_at` is latest-wins, not a queue: pressing Send twice before
-- the plugin collects means one delivery of current state, which is correct
-- for a mirror. Pending == push_requested_at > last_acked_at.
--
-- Primary key is (series_id, user_id): two users who both linked the same
-- series to their own vaults each get an independent flag.

create table series_vault_links (
  series_id uuid not null references series(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  linked_at timestamptz not null default now(),
  push_requested_at timestamptz null,
  last_acked_at timestamptz null,
  primary key (series_id, user_id)
);

create index series_vault_links_user_idx on series_vault_links (user_id);

alter table series_vault_links enable row level security;

-- A user sees and manages only their own links.
--
-- IMPORTANT: this policy scopes rows to their owner, but it does NOT stop a
-- user from linking a series they cannot view. PostgreSQL exempts foreign-key
-- and uniqueness checks from RLS — they compare against the full underlying
-- table, not the RLS-filtered view — so the series_id FK will happily accept
-- an id the caller has no can_view_series access to. Any route that inserts
-- here MUST check series visibility explicitly first (the vault-link route
-- does this via getSeries, which returns null under RLS and yields a 404).
-- Without that check, insert success/failure becomes a series-existence oracle.
create policy series_vault_links_owner on series_vault_links
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
