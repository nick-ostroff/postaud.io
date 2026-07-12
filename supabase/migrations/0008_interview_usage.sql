-- 0008: exact (non-estimated) API token usage capture, per interview.
-- One row per (interview, provider, phase): the OpenAI Realtime session's
-- accumulated response.usage for 'interview', and the Anthropic pipeline's
-- 'extract' / 'merge' calls. `raw` keeps the verbatim provider usage payload
-- as audit ground truth alongside the normalized columns.

create table interview_usage (
  id                          uuid primary key default gen_random_uuid(),
  interview_id                uuid not null references interviews(id) on delete cascade,
  organization_id             uuid not null references organizations(id) on delete cascade,
  provider                    text not null,   -- 'openai_realtime' | 'anthropic'
  phase                       text not null,   -- 'interview' | 'extract' | 'merge'
  model                       text not null,
  input_tokens                int not null default 0,
  output_tokens               int not null default 0,
  total_tokens                int not null default 0,
  -- OpenAI Realtime detail (nullable — not applicable to Anthropic rows)
  audio_input_tokens          int,
  text_input_tokens           int,
  cached_input_tokens         int,
  audio_output_tokens         int,
  text_output_tokens          int,
  -- Anthropic detail (nullable — not applicable to Realtime rows)
  cache_read_input_tokens     int,
  cache_creation_input_tokens int,
  raw                         jsonb not null default '{}',
  created_at                  timestamptz not null default now(),
  -- upsert target: reprocessing an interview replaces its prior pipeline
  -- usage rows; the realtime session posts its accumulated usage once.
  unique (interview_id, provider, phase)
);
create index on interview_usage (interview_id);

alter table interview_usage enable row level security;

create policy "usage read" on interview_usage for select
  using (exists (select 1 from interviews i where i.id = interview_id and can_view_series(i.series_id)));
-- no insert/update/delete policies for authed users — all writes are
-- service-role, same pattern as interview_summaries/facts pipeline writes.
