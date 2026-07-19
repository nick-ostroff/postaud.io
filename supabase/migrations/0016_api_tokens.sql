-- 0016_api_tokens.sql
-- Personal access tokens, so the Obsidian plugin can authenticate as a user
-- without a browser session.
--
-- Only `token_hash` (sha-256 of the raw token) is stored; the raw `pat_…`
-- value is displayed once at creation and never again. Lookup is by hash, so
-- the column is unique and indexed.
--
-- Revocation is a soft delete (`revoked_at`) rather than a row delete so the
-- token list can keep showing what was revoked and when.

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  name text not null,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index api_tokens_user_id_idx on api_tokens (user_id);

alter table api_tokens enable row level security;

-- A user manages only their own tokens. The resolver reads this table with the
-- service role (the caller has no identity yet at that point), which bypasses
-- this policy by design; the policy governs the settings UI.
create policy api_tokens_owner on api_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
