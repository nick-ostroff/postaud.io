-- PostAud.io — Supabase/Postgres schema (MVP)
-- Apply with: supabase db push   (after placing in /supabase/migrations)
-- Conventions: uuid PKs, timestamps default now(), RLS on every tenant table.

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- =========================================================
-- Enums
-- =========================================================
create type org_plan            as enum ('free','starter','growth','scale');
create type membership_role     as enum ('owner','member');
create type consent_status      as enum ('unknown','implied','verbal','written_and_verbal','revoked');
create type output_type_enum    as enum ('transcript.plain','summary.concise','qa.structured','blog.draft','crm.note','webhook.json');
create type request_status      as enum ('draft','sent','reminded','completed','expired','cancelled');
create type session_status      as enum ('active','completed','partial','failed','declined','expired');
create type job_status          as enum ('pending','running','succeeded','failed');
create type delivery_status     as enum ('pending','succeeded','failed','abandoned');

-- =========================================================
-- organizations
-- =========================================================
create table organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  plan                org_plan not null default 'free',
  credits_remaining   integer not null default 3,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

-- =========================================================
-- users (mirrors auth.users)
-- =========================================================
create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  display_name    text,
  created_at      timestamptz not null default now()
);

-- =========================================================
-- memberships
-- =========================================================
create table memberships (
  user_id          uuid not null references users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  role             membership_role not null default 'owner',
  created_at       timestamptz not null default now(),
  primary key (user_id, organization_id)
);

-- Helper: current org for an auth user (first membership for MVP single-workspace)
create or replace function current_org_id() returns uuid
  language sql stable as $$
    select organization_id from memberships where user_id = auth.uid() limit 1;
  $$;

-- =========================================================
-- contacts
-- =========================================================
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  phone_e164      text not null,
  first_name      text,
  last_name       text,
  email           text,
  consent_status  consent_status not null default 'unknown',
  created_at      timestamptz not null default now(),
  unique (organization_id, phone_e164)
);
create index on contacts (organization_id);

-- =========================================================
-- interview_templates
-- =========================================================
create table interview_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  intro_message   text,
  sms_body        text not null,
  output_type     output_type_enum not null default 'summary.concise',
  webhook_url     text,
  version         integer not null default 1,
  is_active       boolean not null default true,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index on interview_templates (organization_id, is_active);

-- =========================================================
-- template_questions
-- =========================================================
create table template_questions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references interview_templates(id) on delete cascade,
  position        integer not null,
  prompt          text not null,
  hint            text,
  allow_followup  boolean not null default true,
  max_seconds     integer not null default 90,
  required        boolean not null default true,
  unique (template_id, position)
);

-- =========================================================
-- interview_requests  (one per invite sent to one contact)
-- =========================================================
create table interview_requests (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  template_id        uuid not null references interview_templates(id) on delete restrict,
  template_snapshot  jsonb not null,              -- frozen copy of template + questions
  contact_id         uuid not null references contacts(id) on delete restrict,
  sender_user_id     uuid references users(id),
  token              text not null unique,        -- URL token (16-char base32)
  dial_code          text not null,               -- 6-digit, unique among active rows
  phone_assigned     text,                        -- nullable; for future dedicated-number upgrade
  status             request_status not null default 'draft',
  sent_at            timestamptz,
  completed_at       timestamptz,
  expires_at         timestamptz not null default now() + interval '7 days'
);
create index on interview_requests (organization_id, status);
create index on interview_requests (token);
-- Enforce uniqueness of dial_code among still-active requests
create unique index interview_requests_active_dial_code_idx
  on interview_requests (dial_code)
  where status in ('sent','reminded');

-- =========================================================
-- interview_sessions (one per actual call)
-- =========================================================
create table interview_sessions (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references interview_requests(id) on delete cascade,
  twilio_call_sid   text unique,
  caller_phone      text,
  status            session_status not null default 'active',
  consent_captured  boolean not null default false,
  consent_source    text,                         -- 'written' | 'verbal' | 'both'
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_sec      integer,
  recording_sid     text,
  recording_path    text                          -- path in Supabase Storage, not URL
);
create index on interview_sessions (request_id);

-- =========================================================
-- call_events (fine-grained event stream)
-- =========================================================
create table call_events (
  id          bigserial primary key,
  session_id  uuid not null references interview_sessions(id) on delete cascade,
  at          timestamptz not null default now(),
  event_type  text not null,    -- greeting, consent_yes, question_asked, answer_delta, answer_ended, followup_asked, skipped, error, wrapup
  question_id uuid,              -- references template_snapshot question id (not FK — snapshot is frozen JSON)
  payload     jsonb
);
create index on call_events (session_id, at);

-- =========================================================
-- transcripts
-- =========================================================
create table transcripts (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique references interview_sessions(id) on delete cascade,
  raw           jsonb not null,       -- [{ts, speaker, text}]
  cleaned_text  text,
  model         text,
  prompt_version text,
  completed_at  timestamptz
);

-- =========================================================
-- extracted_answers
-- =========================================================
create table extracted_answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references interview_sessions(id) on delete cascade,
  question_id    uuid not null,
  question_prompt text not null,         -- denormalized from snapshot
  answer_text    text,
  confidence     numeric(3,2),
  followup_text  text,
  unique (session_id, question_id)
);

-- =========================================================
-- summaries
-- =========================================================
create table summaries (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null unique references interview_sessions(id) on delete cascade,
  short           text,
  long            text,
  bullets         jsonb,
  model           text,
  prompt_version  text,
  created_at      timestamptz not null default now()
);

-- =========================================================
-- output_jobs
-- =========================================================
create table output_jobs (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references interview_sessions(id) on delete cascade,
  output_type    output_type_enum not null,
  status         job_status not null default 'pending',
  payload        jsonb,                -- structured data prior to rendering
  rendered_text  text,                 -- final rendered Markdown/HTML/JSON as string
  error          text,
  attempts       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =========================================================
-- webhook_deliveries
-- =========================================================
create table webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references interview_sessions(id) on delete cascade,
  output_job_id    uuid references output_jobs(id) on delete cascade,
  url              text not null,
  request_body     jsonb not null,
  signature        text not null,
  response_status  integer,
  response_body    text,
  status           delivery_status not null default 'pending',
  attempted_at     timestamptz,
  attempts         integer not null default 0,
  next_attempt_at  timestamptz
);
create index on webhook_deliveries (status, next_attempt_at);

-- =========================================================
-- jobs (internal pipeline queue; used if Vercel Queues unavailable)
-- =========================================================
create table jobs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,         -- 'cleanup_transcript' | 'extract_answers' | 'summarize' | 'render_output' | 'deliver_webhook' | 'notify_email'
  session_id   uuid references interview_sessions(id) on delete cascade,
  ref_id       uuid,                  -- optional: output_jobs.id, webhook_deliveries.id, etc.
  status       job_status not null default 'pending',
  run_after    timestamptz not null default now(),
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index on jobs (status, run_after);

-- =========================================================
-- audit_logs
-- =========================================================
create table audit_logs (
  id              bigserial primary key,
  organization_id uuid,
  actor_user_id   uuid,
  action          text not null,
  target_type     text,
  target_id       text,
  ip              inet,
  at              timestamptz not null default now(),
  meta            jsonb
);
create index on audit_logs (organization_id, at desc);

-- =========================================================
-- RLS
-- =========================================================
alter table organizations        enable row level security;
alter table memberships          enable row level security;
alter table contacts             enable row level security;
alter table interview_templates  enable row level security;
alter table template_questions   enable row level security;
alter table interview_requests   enable row level security;
alter table interview_sessions   enable row level security;
alter table call_events          enable row level security;
alter table transcripts          enable row level security;
alter table extracted_answers    enable row level security;
alter table summaries            enable row level security;
alter table output_jobs          enable row level security;
alter table webhook_deliveries   enable row level security;
alter table jobs                 enable row level security;
alter table audit_logs           enable row level security;

-- Org-scoped read+write policies (members only)
create policy "members read org" on organizations for select using (id = current_org_id());
create policy "members read memberships" on memberships for select using (organization_id = current_org_id());

-- Template of policy for org-tenant tables
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','interview_templates','interview_requests'
  ] loop
    execute format('create policy "org rw" on %I for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());', t);
  end loop;
end$$;

-- Child tables: policy delegates to parent via join
create policy "via template" on template_questions for all using (
  exists (select 1 from interview_templates t where t.id = template_id and t.organization_id = current_org_id())
);
create policy "via request" on interview_sessions for all using (
  exists (select 1 from interview_requests r where r.id = request_id and r.organization_id = current_org_id())
);
create policy "via session" on call_events for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);
create policy "via session" on transcripts for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);
create policy "via session" on extracted_answers for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);
create policy "via session" on summaries for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);
create policy "via session" on output_jobs for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);
create policy "via session" on webhook_deliveries for all using (
  exists (select 1 from interview_sessions s join interview_requests r on r.id=s.request_id where s.id=session_id and r.organization_id=current_org_id())
);

-- jobs + audit_logs are server-only (service role). Deny all to authed users.
create policy "no client access" on jobs for all using (false) with check (false);
create policy "org audit read" on audit_logs for select using (organization_id = current_org_id());

-- =========================================================
-- Cron: pipeline tick every minute
-- =========================================================
-- schedule expects a SQL statement; we just trigger a pg_notify the app consumes,
-- or call an edge function via pg_cron+http extension. Stub for now:
-- select cron.schedule('postaud-jobs-tick', '* * * * *', $$ select 1 $$);
