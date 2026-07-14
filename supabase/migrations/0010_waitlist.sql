-- 0010: waitlist capture for the marketing landing page.
--
-- RLS is enabled with NO policies for anon/authenticated. That is deliberate,
-- not an oversight: the public must never read this list, and must never write
-- to it directly. Every insert goes through the `joinWaitlist` server action
-- (src/server/waitlist/join.ts) using the service-role client, which is where
-- validation and the honeypot check live.

create extension if not exists citext;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  -- citext so Nick@x.com and nick@x.com are one person, enforced by the DB
  -- rather than by remembering to lowercase at every call site.
  email      citext not null unique,
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;
-- Intentionally no policies. Service-role bypasses RLS; everyone else is denied.
