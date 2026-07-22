-- 0019_conversation_modes.sql
-- Conversation modes: 'deep' (today's full interview), 'flow' (pause after
-- each answer, offer follow-up cards), 'quickfire' (preset list, one question
-- after another). Mode replaces the depth dial in the settings UI; the depth
-- column STAYS so deep-mode series keep their stored register wording.
-- Backfill: 'single' series were already Q&A-style → 'quickfire'; all others
-- keep today's behavior → 'deep'.

create type conversation_mode as enum ('deep', 'flow', 'quickfire');

alter table series
  add column conversation_mode  conversation_mode not null default 'deep',
  add column ask_mode_each_time boolean           not null default false;

update series set conversation_mode = 'quickfire' where depth = 'single';

-- Mode actually used for one session (picker choice or series default at
-- start time). Null on historical rows = pre-modes deep behavior.
alter table interviews
  add column mode conversation_mode;

-- Saved follow-up questions ("the queue"): written by Flow sessions ('flow')
-- or typed by members ('member'). position 0 = "Next up". Soft states only —
-- 'asked'/'removed' rows stay for provenance, 'pending' is the live queue.
create table queued_questions (
  id                    uuid primary key default gen_random_uuid(),
  series_id             uuid not null references series(id) on delete cascade,
  text                  text not null,
  source                text not null check (source in ('flow', 'member')),
  created_by            uuid references users(id) on delete set null,
  source_interview_id   uuid references interviews(id) on delete set null,
  position              int  not null default 0,
  status                text not null default 'pending' check (status in ('pending', 'asked', 'removed')),
  asked_in_interview_id uuid references interviews(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on queued_questions (series_id, status, position);

alter table queued_questions enable row level security;

-- Mirrors topics: anyone who can view the series reads the queue; anyone who
-- can interview it may add (Flow's + button and member adds); management
-- (reorder/pin/remove) is admin — but marking 'asked' happens from a live
-- quickfire session, so update needs can_interview, matching "facts review".
create policy "queue read" on queued_questions for select
  using (can_view_series(series_id));
create policy "queue insert" on queued_questions for insert
  with check (can_interview_series(series_id));
create policy "queue update" on queued_questions for update
  using (can_interview_series(series_id))
  with check (can_interview_series(series_id));
