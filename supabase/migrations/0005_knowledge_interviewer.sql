-- 0005: V1 pivot — browser voice interviews + compounding knowledge base.

-- ============ drop phone-era tables & types ============
drop table if exists webhook_deliveries, output_jobs, summaries, extracted_answers,
  transcripts, call_events, interview_sessions, interview_requests,
  template_questions, interview_templates, contacts, jobs cascade;
-- extend with every enum found in Step 1 (0001_init.sql):
drop type if exists consent_status cascade;
drop type if exists output_type_enum cascade;
drop type if exists request_status cascade;
drop type if exists session_status cascade;
drop type if exists job_status cascade;
drop type if exists delivery_status cascade;

-- ============ roles ============
create type member_role as enum ('admin','interviewer','viewer');
alter table memberships add column if not exists accepted_at timestamptz;
alter table memberships alter column role drop default;
alter table memberships alter column role type member_role
  using (case role::text when 'owner' then 'admin' else 'interviewer' end)::member_role;
alter table memberships alter column role set default 'interviewer';
drop type membership_role;
update memberships set accepted_at = created_at where accepted_at is null;

create or replace function is_org_admin() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from memberships
      where user_id = auth.uid() and organization_id = current_org_id() and role = 'admin');
  $$;

-- ============ new enums ============
create type series_status    as enum ('active','paused','archived');
create type subject_kind     as enum ('member','self','person','organization');
create type interview_status as enum ('in_progress','completed','processed','abandoned');
create type message_role     as enum ('interviewer','subject');
create type fact_status      as enum ('active','needs_review','superseded','retell_queued');
create type entity_kind      as enum ('person','place','org','event','date');
create type series_tone      as enum ('warm','neutral','playful');

-- ============ tables ============
create table series (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  title                text not null,
  subject_kind         subject_kind not null default 'person',
  subject_user_id      uuid references users(id) on delete set null,
  subject_name         text not null,
  subject_relationship text,
  goal                 text not null,
  opening_prompt       text,
  dont_bring_up        jsonb not null default '[]',
  tone                 series_tone not null default 'warm',
  session_minutes      int not null default 20 check (session_minutes in (10,20,45)),
  status               series_status not null default 'active',
  created_by           uuid references users(id),
  created_at           timestamptz not null default now()
);
create index on series (organization_id);

create table series_access (
  series_id     uuid not null references series(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  can_view      boolean not null default true,
  can_interview boolean not null default false,
  primary key (series_id, user_id)
);

create table interviews (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references series(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  status           interview_status not null default 'in_progress',
  conducted_by     uuid references users(id),
  hand_the_mic     boolean not null default false,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_sec     int,
  audio_path       text,
  credit_charged   boolean not null default false,
  process_error    text,
  process_attempts int not null default 0
);
create index on interviews (series_id);
create index on interviews (status) where status = 'completed';

create table interview_messages (
  id           uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  role         message_role not null,
  text         text not null,
  t_offset_sec numeric,
  seq          int not null,
  created_at   timestamptz not null default now(),
  unique (interview_id, seq)
);

create table topics (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references series(id) on delete cascade,
  name           text not null,
  description    text,
  coverage_score numeric not null default 0 check (coverage_score between 0 and 1),
  must_cover     boolean not null default false,
  suggested      boolean not null default false,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  unique (series_id, name)
);

create table facts (
  id                  uuid primary key default gen_random_uuid(),
  series_id           uuid not null references series(id) on delete cascade,
  topic_id            uuid references topics(id) on delete set null,
  source_interview_id uuid references interviews(id) on delete set null,
  source_message_id   uuid references interview_messages(id) on delete set null,
  audio_offset_sec    numeric,
  statement           text not null,
  confidence          numeric not null default 0.8,
  status              fact_status not null default 'active',
  superseded_by       uuid references facts(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on facts (series_id, status);

create table entities (
  id        uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  kind      entity_kind not null,
  name      text not null,
  detail    text,
  unique (series_id, kind, name)
);

create table fact_entities (
  fact_id   uuid not null references facts(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  primary key (fact_id, entity_id)
);

create table interview_summaries (
  interview_id uuid primary key references interviews(id) on delete cascade,
  short        text not null,
  long         text,
  bullets      jsonb not null default '[]',
  model        text,
  created_at   timestamptz not null default now()
);

-- ============ RLS ============
create or replace function can_view_series(s_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from series s
      where s.id = s_id and s.organization_id = current_org_id()
        and (is_org_admin()
             or s.subject_user_id = auth.uid()
             or exists (select 1 from series_access a
                        where a.series_id = s.id and a.user_id = auth.uid() and a.can_view)));
  $$;

create or replace function can_interview_series(s_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from series s
      where s.id = s_id and s.organization_id = current_org_id()
        and (is_org_admin()
             or s.subject_user_id = auth.uid()
             or exists (select 1 from series_access a
                        where a.series_id = s.id and a.user_id = auth.uid() and a.can_interview)));
  $$;

alter table series             enable row level security;
alter table series_access      enable row level security;
alter table interviews         enable row level security;
alter table interview_messages enable row level security;
alter table topics             enable row level security;
alter table facts              enable row level security;
alter table entities           enable row level security;
alter table fact_entities      enable row level security;
alter table interview_summaries enable row level security;

create policy "series read"   on series for select using (can_view_series(id));
create policy "series admin"  on series for all
  using (is_org_admin() and organization_id = current_org_id())
  with check (is_org_admin() and organization_id = current_org_id());

create policy "access read"   on series_access for select using (can_view_series(series_id));
create policy "access admin"  on series_access for all
  using (is_org_admin() and can_view_series(series_id))
  with check (is_org_admin() and can_view_series(series_id));

create policy "interviews read"   on interviews for select using (can_view_series(series_id));
create policy "interviews start"  on interviews for insert
  with check (can_interview_series(series_id) and organization_id = current_org_id());
create policy "interviews update" on interviews for update
  using (can_interview_series(series_id));

create policy "messages read" on interview_messages for select
  using (exists (select 1 from interviews i where i.id = interview_id and can_view_series(i.series_id)));
create policy "messages append" on interview_messages for insert
  with check (exists (select 1 from interviews i
    where i.id = interview_id and i.status = 'in_progress' and can_interview_series(i.series_id)));
-- invariant: no update/delete policies on interview_messages — transcripts are immutable.

create policy "topics read"  on topics for select using (can_view_series(series_id));
create policy "topics admin" on topics for all
  using (is_org_admin() and can_view_series(series_id))
  with check (is_org_admin() and can_view_series(series_id));

create policy "facts read" on facts for select using (can_view_series(series_id));
create policy "facts review" on facts for update
  using (can_interview_series(series_id)) with check (can_interview_series(series_id));

create policy "entities read"      on entities for select using (can_view_series(series_id));
create policy "fact_entities read" on fact_entities for select
  using (exists (select 1 from facts f where f.id = fact_id and can_view_series(f.series_id)));
create policy "summaries read"     on interview_summaries for select
  using (exists (select 1 from interviews i where i.id = interview_id and can_view_series(i.series_id)));
-- pipeline writes (facts/entities/topics scores/summaries inserts) happen via service role.

-- ============ storage ============
insert into storage.buckets (id, name, public) values ('interview-audio','interview-audio', false)
  on conflict (id) do nothing;
-- no storage.objects policies: bucket is service-role only; playback via signed URLs.
