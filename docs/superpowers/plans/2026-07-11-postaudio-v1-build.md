# postaud.io V1 Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement postaud.io V1 — a browser voice-first AI knowledge interviewer with a compounding knowledge base — per `docs/superpowers/specs/2026-07-11-postaudio-v1-product-spec.md`, replacing the phone-era codebase.

**Architecture:** Next.js 16 App Router on Vercel; Supabase (auth, Postgres+RLS, Storage) for data; OpenAI Realtime API over WebRTC for the live voice interview (browser connects directly to OpenAI; our server only mints short-lived tokens); Claude (Anthropic SDK) for the post-interview knowledge pipeline (extract → merge → coverage). Server components for reads, route handlers for mutations, service-role client only for the pipeline, cron, storage, and operator console.

**Tech Stack:** Next.js 16.2 / React 19 / TypeScript / Tailwind 4 / Supabase JS + SSR / `openai` SDK / `@anthropic-ai/sdk` / zod v4 / vitest (new).

## Global Constraints

- **Read Next.js docs first**: this repo's AGENTS.md warns Next.js 16 has breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before writing app-router code in any task.
- **No `sed` edits** — Edit/Write tools only (global rule).
- **SSR-safe**: no bare `window`/`document`/`localStorage`/`navigator` outside client components with guards; the interview screen is `"use client"`.
- **Commit + push after each task** (global rule) with descriptive messages.
- **Design source of truth**: mockup files in repo root (`Postaudio *.dc.html`) + `postaudio-mockups.css`. Warm paper light theme everywhere; dark ONLY on live-session screens. Fonts: Newsreader (serif — headings + anything spoken, spoken = italic) + Instrument Sans (UI). Palette exactly: paper `#F7F5F0` / `#EFECE6`, ink `#211E1A`, muted `#6E675C`, green `oklch(0.52 0.06 165)`, mint `oklch(0.72 0.08 165)`, amber `oklch(0.50 0.10 50)`, borders `rgba(33,30,26,0.1)`.
- **Copy tone**: warm, plainspoken ("64 memories saved for the family", "going stale — interview soon"). AI interviewer persona is named **Anna** in interviewee-facing copy.
- **Spec invariants (§7)**: transcripts/audio immutable — corrections only update facts; interviewee UI = one primary action per screen; AI never initiates don't-bring-up topics; operator sees metadata only.
- **Models**: Realtime voice = OpenAI `gpt-realtime` (verify current model id in the `openai` package docs at implementation time). Pipeline = Anthropic `claude-sonnet-5`.
- **Existing patterns to follow**: `src/db/server.ts` (SSR user client), `src/db/service.ts` (service role), route handlers return `NextResponse.json`, zod-validated bodies, `src/lib/auth/is-platform-admin.ts` gate for `/admin`.
- **Screen width rule** (global CLAUDE.md): page containers `w-full`, no page-level `max-w-*`; cap individual inputs/prose at ~`max-w-3xl`.
- Tests: `npm test` = `vitest run`. TDD the pure-logic modules (prompt builder, merge application, export renderer, tick selection); UI verified by `npm run build` + rendering routes.

---

### Task 1: Preserve stale work, add vitest, tear down the phone-era code

**Files:**
- Delete: `src/app/api/webhooks/twilio/**`, `src/app/api/webhooks/stripe/**`, `src/app/api/billing/**`, `src/app/api/contacts/**`, `src/app/api/templates/**`, `src/app/api/interview-requests/**`, `src/app/api/sessions/**`, `src/app/api/public/**`, `src/app/api/integrations/**`, `src/app/api/jobs/run/route.ts`, `src/app/api/jobs/process-session/route.ts`, `src/app/api/_stub.ts`, `src/app/c/**`, `src/app/pricing/**`, `src/app/app/contacts/**`, `src/app/app/sends/**`, `src/app/app/templates/**`, `src/app/app/settings/billing/**`, `src/server/telephony/**`, `src/server/fsm/**`, `src/server/ai/**` (old pipeline — transcribe/extract/summarize/render/process-session all phone-shaped; rebuilt in Task 12), `src/server/jobs/stages.ts`, `src/ai/**`, `src/lib/{twilio,twilio-messaging,sms,dial-code,mocks,stripe,webhook-sign,token}.ts`
- Modify: `src/lib/env.ts`, `package.json`, `src/db/queries.ts` (strip queries referencing deleted tables), `src/app/api/jobs/tick/route.ts` (leave a passing stub: GET+POST returning `{ok:true, swept:0}` — real logic Task 13), `src/components/nav/Sidebar.tsx` (temporary: links to `/app` only)
- Create: `vitest.config.ts`, `src/lib/__tests__/env.test.ts`

**Interfaces:**
- Produces: `env()` with this exact schema — required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (default `hello@postaud.io`), `CRON_SECRET`, `PLATFORM_ADMIN_EMAILS` (default `""`), `APP_ENV`. Keep `platformAdminEmails()`. Remove Twilio/Stripe/webhook vars and `voicePoolNumbers()`.

- [ ] **Step 1:** `git stash push -m "pre-pivot dark dashboard redesign (superseded by warm-paper spec)"` to preserve the uncommitted `src/app/app/layout.tsx`, `src/app/app/page.tsx`, `src/components/nav/Sidebar.tsx` changes without carrying them.
- [ ] **Step 2:** `npm i -D vitest` and add `"test": "vitest run"` to package.json scripts. Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
```

- [ ] **Step 3:** Write `src/lib/__tests__/env.test.ts` (fails until env.ts is rewritten):

```ts
import { describe, it, expect } from "vitest";
describe("env", () => {
  it("no longer requires Twilio configuration", async () => {
    const src = await import("node:fs").then(fs =>
      fs.readFileSync("src/lib/env.ts", "utf8"));
    expect(src).not.toMatch(/TWILIO/);
    expect(src).not.toMatch(/STRIPE/);
    expect(src).toMatch(/OPENAI_API_KEY/);
    expect(src).toMatch(/CRON_SECRET/);
  });
});
```

- [ ] **Step 4:** Run `npm test` — expect FAIL (env.ts still lists TWILIO_*).
- [ ] **Step 5:** Rewrite `src/lib/env.ts` to the schema in Interfaces. Delete every file in the Delete list. Strip `src/db/queries.ts` to only org/user/membership/credits helpers. Stub tick route. Trim Sidebar to Home-only links so the build stands.
- [ ] **Step 6:** `npm uninstall twilio stripe` (keep `resend` for later email, keep `openai`, `@anthropic-ai/sdk`).
- [ ] **Step 7:** `rm -rf .next && npm run build` and `npm test` — both must pass. Fix any dangling imports the build surfaces.
- [ ] **Step 8:** Commit: `chore: tear down phone-era code (twilio/stripe/templates/sends), add vitest`.

### Task 2: Migration 0005 — knowledge-interviewer schema

**Files:**
- Create: `supabase/migrations/0005_knowledge_interviewer.sql`
- Modify: `src/db/types.ts` (replace with new row types), `src/db/queries.ts` (add series/interview helpers)

**Interfaces:**
- Produces DB tables: `series`, `series_access`, `interviews`, `interview_messages`, `topics`, `facts`, `entities`, `fact_entities`, `interview_summaries`; enums `member_role('admin','interviewer','viewer')`, `subject_kind('member','self','person','organization')`, `interview_status('in_progress','completed','processed','abandoned')`, `message_role('interviewer','subject')`, `fact_status('active','needs_review','superseded','retell_queued')`, `entity_kind('person','place','org','event','date')`, `series_tone('warm','neutral','playful')`, `series_status('active','paused','archived')`; SQL helpers `is_org_admin()`, `can_view_series(uuid)`, `can_interview_series(uuid)`; private storage bucket `interview-audio`.
- Produces TS types in `src/db/types.ts` matching every column below, exported as `Series`, `SeriesAccess`, `Interview`, `InterviewMessage`, `Topic`, `Fact`, `Entity`, `InterviewSummary`, `Membership`, `MemberRole`.

- [ ] **Step 1:** Read `supabase/migrations/0001_init.sql` fully and note every phone-era enum name (e.g. `consent_status`, request/session/output status types) for the drop list.
- [ ] **Step 2:** Write `0005_knowledge_interviewer.sql`:

```sql
-- 0005: V1 pivot — browser voice interviews + compounding knowledge base.

-- ============ drop phone-era tables & types ============
drop table if exists webhook_deliveries, output_jobs, summaries, extracted_answers,
  transcripts, call_events, interview_sessions, interview_requests,
  template_questions, interview_templates, contacts, jobs cascade;
-- extend with every enum found in Step 1:
drop type if exists consent_status cascade;
-- ... (one drop per phone-era enum)

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
```

- [ ] **Step 3:** Apply with `supabase db push` if the CLI is linked; otherwise apply via the Supabase MCP tool `apply_migration` (project is live — check `supabase/config.toml` for the ref). Verify with the MCP `list_tables` that all 9 new tables exist and old ones are gone.
- [ ] **Step 4:** Rewrite `src/db/types.ts` with row types for every table above (string unions matching the enums). Update `src/db/queries.ts` with typed helpers used by later tasks: `getSeriesForUser(sb)`, `getSeries(sb, id)`, `getSeriesKnowledge(sb, id)` (topics+facts+entities), `getInterview(sb, id)`, `listMembers(sb)`.
- [ ] **Step 5:** `npm run build` passes. Commit: `feat(db): migration 0005 — series/interviews/facts knowledge schema with role + per-series RLS`.

### Task 3: Warm-paper design system in the app

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx` (fonts), `src/app/app/layout.tsx`, `src/components/nav/Sidebar.tsx`
- Create: `src/components/ui/{Button,Card,Badge,Chip,Avatar,CoverageBar,Field,Segmented,StatTile}.tsx`

**Interfaces:**
- Produces components (exact props):
  - `Button({variant?: "primary"|"secondary"|"ghost"|"quiet-danger", size?: "md"|"big", ...buttonProps})` — pill-shaped
  - `Card({className?, children})`, `Badge({tone?: "green"|"amber"|"muted", children})`, `Chip({kicker?, children})`
  - `Avatar({name, tone?: "green"|"warm"|"plain", size?: "md"|"lg"})` → initials
  - `CoverageBar({value: number /*0..1*/, low?: boolean})`, `StatTile({n: string, label: string})`
  - `Field({label, hint?, children})`, `Segmented({options: {value,label}[], value, onChange?, name?})`
- Produces CSS custom properties in `globals.css` mirroring `postaudio-mockups.css` `:root` block exactly, plus `.spoken` (Newsreader italic) and `.dark-session` + `.orb` (with breathe/ring keyframes) copied from that file.

- [ ] **Step 1:** Read `postaudio-mockups.css` in the repo root — it is the design system. Port its `:root` tokens, `.spoken`, `.dark-session`, `.orb`, and keyframes into `globals.css` (Tailwind 4 `@theme`/vars). Load fonts in root `layout.tsx` with `next/font/google`: `Newsreader` (variable, with italic) and `Instrument_Sans`, exposed as CSS vars `--font-serif` / `--font-sans`.
- [ ] **Step 2:** Build each UI component to visually match its counterpart class in `postaudio-mockups.css` (`.btn/.btn-primary/...`, `.card`, `.badge`, `.chip`, `.avatar`, `.cov`, `.stat`, `.field`, `.seg`). Tailwind utilities referencing the vars are fine; match radii, colors, and weights exactly.
- [ ] **Step 3:** Rebuild `Sidebar.tsx` to the mockup sidebar (see `Postaudio Admin.dc.html` any app screen): wordmark `post**aud**.io`, "Workspace" group (Home `/app`, Series `/app/series`, Members `/app/members`), "You" group (Settings `/app/settings`), user chip at bottom (name + role from session). Active state = green tint pill. Rebuild `src/app/app/layout.tsx` as the shell (sidebar + main, paper background, `w-full`).
- [ ] **Step 4:** Point `src/app/app/page.tsx` at a temporary empty state ("No series yet — create your first") so the shell renders. `npm run build` + open `/app` locally to confirm the look matches `Postaudio Admin.dc.html#2a`'s frame.
- [ ] **Step 5:** Commit: `feat(ui): warm-paper design system, fonts, sidebar shell`.

### Task 4: Members, roles, invites, first-login accept

**Files:**
- Create: `src/app/app/members/page.tsx`, `src/app/app/members/InviteForm.tsx`, `src/app/api/members/route.ts` (POST invite, PATCH role), `src/app/welcome/page.tsx` + `src/app/welcome/AcceptForm.tsx`, `src/server/members/invite.ts`
- Modify: `src/app/auth/callback/route.ts` (route invited users to `/welcome` until `accepted_at` set)

**Interfaces:**
- Consumes: `member_role`, `memberships.accepted_at` (Task 2); `Avatar`, `Badge`, `Button` (Task 3).
- Produces: `inviteMember(email: string, role: MemberRole, orgId: string, invitedBy: string): Promise<{userId: string}>` in `src/server/members/invite.ts` — calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: env().NEXT_PUBLIC_APP_URL + "/auth/callback?next=/welcome" })` with the service client, upserts `users` + `memberships` (role, `accepted_at: null`), writes an `audit_logs` row `action:'member.invited'`.
- Produces: POST `/api/members` body `{email, role}` (admin-only, 403 otherwise) → `{ok:true}`; PATCH body `{userId, role}`.

- [ ] **Step 1:** Implement `invite.ts` + route handler (zod-validate body; guard: caller's membership role must be `admin`).
- [ ] **Step 2:** Members page (server component) matching `Postaudio Admin.dc.html#3a`: table of members (avatar, name/email, role badge, joined/last-active, amber "Invited — hasn't accepted" badge when `accepted_at is null`), `InviteForm` (email + role select + Invite button, posts to the API).
- [ ] **Step 3:** `/welcome` accept screen matching `Postaudio Login.dc.html#1b`: shows inviter workspace name, the member's role badge, series they can access (query `series_access` + subject series), a "set password" form (`supabase.auth.updateUser({password})`), then sets `accepted_at = now()` via a small POST in the same route file and redirects to `/app`.
- [ ] **Step 4:** Verify flow manually with a test email (Supabase sends the invite email). `npm run build` passes.
- [ ] **Step 5:** Commit: `feat(members): roles, invite-by-email, first-login accept`.

### Task 5: Series data layer, wizard, quick-create

**Files:**
- Create: `src/app/api/series/route.ts` (POST create), `src/app/api/series/[id]/route.ts` (PATCH, DELETE archive), `src/app/app/series/new/page.tsx`, `src/app/app/series/new/Wizard.tsx` (client), `src/server/series/create.ts`
- Modify: `src/db/queries.ts`

**Interfaces:**
- Consumes: Task 2 tables/types, Task 3 components, Task 4 members list (for subject/assign pickers).
- Produces: POST `/api/series` body:

```ts
{
  title: string; goal: string;
  subjectKind: "member"|"self"|"person"|"organization";
  subjectUserId?: string; subjectName: string; subjectRelationship?: string;
  openingPrompt?: string; mustCover: string[]; dontBringUp: string[];
  tone: "warm"|"neutral"|"playful"; sessionMinutes: 10|20|45;
  access: { userId: string; canView: boolean; canInterview: boolean }[];
  inviteSubjectEmail?: string;                       // invite-by-email inline
  questionPlan?: string[];                            // from Task 6, stored as topic descriptions
}
```
→ `{id}`. `createSeries()` inserts series + `series_access` rows + seeds `topics` from `mustCover` (`must_cover: true`, position by index) — and when `inviteSubjectEmail` present, calls Task 4's `inviteMember(email,'interviewer',...)` and uses the new userId as subject.

- [ ] **Step 1:** Implement `create.ts` + routes (admin-only for create; zod schema above).
- [ ] **Step 2:** Build the 4-step `Wizard.tsx` matching `Postaudio Admin.dc.html#6a–#6d`: Step 1 Basics (template radio-cards "Life story"/"Family recipes & traditions"/"Company history" — template only pre-fills goal placeholder + suggested must-cover chips; title; subject picker from members + "someone without an account" name field + relationship; goal textarea). Step 2 Assign (owner display, per-member segmented can-view/can-interview/no-access, inline invite row). Step 3 Guide (opening prompt, must-cover chip editor, don't-bring-up chip editor in amber with the "Anna will never raise these" explainer, tone Segmented, length Segmented). Step 4 Review (question plan list — populated by Task 6, editable/removable rows, "+ Add a question"; summary card; "Create series" + "Create & start first interview" buttons — the latter redirects to the interview screen route from Task 10 after create).
- [ ] **Step 3:** Quick-create page section per `#1d`: single condensed form (title/subject/goal → Create) rendered when `?quick=1`, link to the full wizard.
- [ ] **Step 4:** Build + manual run-through creating a series. Commit: `feat(series): create wizard with guide rails and per-member access`.

### Task 6: AI question plan + topic seeding

**Files:**
- Create: `src/server/ai/anthropic.ts` (client factory), `src/server/ai/question-plan.ts`, `src/app/api/series/question-plan/route.ts`, `src/server/ai/__tests__/question-plan.test.ts`

**Interfaces:**
- Produces: `draftQuestionPlan(input: {title, subjectName, subjectRelationship?, goal, openingPrompt?, mustCover: string[], tone}): Promise<string[]>` — Claude `claude-sonnet-5`, forced tool-use JSON `{questions: string[]}` (5–7 questions, warm register, first question follows the opening prompt, no don't-bring-up input needed here). Route: POST `/api/series/question-plan` (same body) → `{questions}` — called by Wizard step 3→4 transition.
- Produces: `anthropicClient()` singleton reading `env().ANTHROPIC_API_KEY` (throws a clear error if unset).

- [ ] **Step 1:** Write the failing test — mock the SDK, assert prompt contains goal + subject name and result parses to 5–7 strings:

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn(async () => ({
  content: [{ type: "tool_use", name: "question_plan", input: { questions: ["q1","q2","q3","q4","q5"] } }],
})) } })) }));
import { draftQuestionPlan } from "../question-plan";
it("returns the drafted questions", async () => {
  const qs = await draftQuestionPlan({ title: "Dad's Story", subjectName: "Henk",
    subjectRelationship: "My father", goal: "Capture Dad's whole life", mustCover: ["Childhood"], tone: "warm" });
  expect(qs).toHaveLength(5);
});
```

- [ ] **Step 2:** Run — FAIL (module missing). Implement `question-plan.ts` (tool schema with `questions: array of string`, `tool_choice` forced, temperature 0.7) and the route. Run — PASS.
- [ ] **Step 3:** Wire Wizard: entering step 4 calls the route with steps-1–3 data, rows editable. Build passes. Commit: `feat(ai): Anna drafts the first-session question plan`.

### Task 7: Workspace home + series detail hub

**Files:**
- Create: `src/app/app/series/page.tsx` (list = same cards as home), `src/app/app/series/[id]/page.tsx`, `src/server/series/staleness.ts`, `src/server/series/__tests__/staleness.test.ts`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `getSeriesForUser`, `getSeries`, `getSeriesKnowledge` (Task 2), UI kit (Task 3).
- Produces: `staleness(lastSessionAt: Date|null, now: Date): {stale: boolean, label: string}` — stale after 14 days; labels: never interviewed → `"no sessions yet"`, fresh → `"last session <relative>"`, stale → `"going stale — interview soon"`.
- Produces route conventions later tasks link to: series detail `/app/series/[id]`, interview `/app/series/[id]/interview`, knowledge `/app/series/[id]/knowledge`, access `/app/series/[id]/access`, export UI on the detail page.

- [ ] **Step 1:** TDD `staleness.ts` (test the three labels + 14-day boundary), commit inside the task flow.
- [ ] **Step 2:** Home `/app` (admin/owner view) per `Postaudio Admin.dc.html#2a`: greeting, 4 StatTiles (series count, memories = facts count, sessions this month, members), series card grid (title serif, subject line, CoverageBar with mean topic coverage, memories count, staleness line/badge amber when stale, "New series" button). Role-aware: if the signed-in member is NOT an admin and IS a subject of exactly one active series, render the interviewee one-job home instead (built in Task 11 — until then show the standard grid).
- [ ] **Step 3:** Series detail per `#2b`: page head (title, subject chip, coverage %, "Start interview" primary → `/app/series/[id]/interview`); left column: sessions list (date, duration, memories added, summary short line; each links to results page from Task 14) + topic queue (CoverageBar rows, amber low, "still blank" at 0; suggested topics as chips with + to promote `suggested→must_cover=false` queue position); right column: knowledge snapshot (people chips, 3 latest timeline items, "N memories saved for the family"), access card (link to access page), export card (buttons wired in Task 16).
- [ ] **Step 4:** Build + verify with seeded data. Commit: `feat(app): workspace home and series detail hub`.

### Task 8: Per-series access screen

**Files:**
- Create: `src/app/app/series/[id]/access/page.tsx`, `src/app/api/series/[id]/access/route.ts` (PUT rows)

**Interfaces:**
- Consumes: `series_access` (Task 2), Segmented (Task 3).
- Produces: PUT `/api/series/[id]/access` body `{rows: {userId, level: "none"|"view"|"interview"}[]}` (admin-only) → upserts/deletes `series_access` (`view` → can_view only; `interview` → both true).

- [ ] **Step 1:** Build page per `Postaudio Admin.dc.html#3b`: series header recap, owner row, member rows with three-state Segmented, hand-the-mic explainer card for no-account subjects.
- [ ] **Step 2:** Implement the PUT route; verify a non-admin gets 403 and RLS hides inaccessible series from a viewer account. Commit: `feat(series): per-series access management`.

### Task 9: Interview start — token mint + interviewer prompt (core logic)

**Files:**
- Create: `src/server/ai/interviewer-prompt.ts`, `src/server/ai/__tests__/interviewer-prompt.test.ts`, `src/app/api/series/[id]/interviews/route.ts` (POST start), `src/app/api/interviews/[id]/realtime-token/route.ts`, `src/server/interviews/start.ts`

**Interfaces:**
- Produces: `buildInterviewerInstructions(input: {series: {title; subjectName; subjectRelationship?: string|null; goal; openingPrompt?: string|null; dontBringUp: string[]; tone: "warm"|"neutral"|"playful"; sessionMinutes: number}, handTheMic: boolean, knownFacts: {topic: string; statement: string}[], topics: {name; coverageScore: number; mustCover: boolean; suggested: boolean}[], retellQueue: string[]}): string`
- Produces: POST `/api/series/[id]/interviews` → guards `can_interview` + org `credits_remaining > 0` (402 with `{error:"no_credits"}` when empty) → inserts interview `in_progress` → `{interviewId}`.
- Produces: POST `/api/interviews/[id]/realtime-token` → verifies caller can interview the series → builds instructions (facts digest capped at 80 most-recent active facts; topics ordered lowest-coverage-first) → calls OpenAI `client.realtime.clientSecrets.create(...)` (verify exact SDK surface in the installed `openai` package; REST fallback `POST /v1/realtime/client_secrets`) with `{session: {type: "realtime", model: "gpt-realtime", instructions, audio: {input: {transcription: {model: "whisper-1"}}, output: {voice: "marin"}}}}` → `{clientSecret, model}`.

- [ ] **Step 1:** Write failing tests for the prompt builder — it must: (a) name Anna and the subject; (b) include goal + opening prompt; (c) list every `dontBringUp` item under an explicit "never initiate" rule with the redirect behavior; (d) instruct one-question-at-a-time and no re-asking of known facts; (e) include the facts digest and lowest-coverage topics as priorities; (f) include retell queue items as "ask them to retell"; (g) in handTheMic mode, address the subject by name with slower/simpler phrasing; (h) state the target session length.

```ts
import { describe, it, expect } from "vitest";
import { buildInterviewerInstructions } from "../interviewer-prompt";
const base = { series: { title: "Dad's Story", subjectName: "Henk", subjectRelationship: "father",
  goal: "Capture Dad's whole life", openingPrompt: "Start warm: Rotterdam first", dontBringUp: ["Pieter's accident"],
  tone: "warm" as const, sessionMinutes: 20 }, handTheMic: false,
  knownFacts: [{ topic: "Meeting Jan", statement: "Met Jan, spring 1975, on the Hoek van Holland ferry." }],
  topics: [{ name: "Health & habits", coverageScore: 0, mustCover: true, suggested: false }], retellQueue: [] };
it("bakes in the guide rails", () => {
  const p = buildInterviewerInstructions(base);
  for (const s of ["Anna", "Henk", "Rotterdam first", "Pieter's accident", "never", "one question",
                   "Hoek van Holland", "Health & habits", "20 minutes"]) expect(p).toContain(s);
});
it("hand-the-mic changes the register", () => {
  const p = buildInterviewerInstructions({ ...base, handTheMic: true });
  expect(p.toLowerCase()).toContain("slower");
});
```

- [ ] **Step 2:** Run (FAIL) → implement the builder as a deterministic template (sections: WHO YOU ARE / THE SUBJECT / THE GOAL / WHAT YOU ALREADY KNOW (never re-ask) / EXPLORE NEXT (lowest coverage first) / RETELL REQUESTS / NEVER BRING UP / STYLE (tone + one question + follow-ups + session length) / ENDING) → PASS.
- [ ] **Step 3:** Implement both routes (`start.ts` holds the credit check + insert). No test for the OpenAI call itself; guard clauses unit-testable logic stays in `start.ts`.
- [ ] **Step 4:** Build passes; commit: `feat(interview): session start with credit gate + realtime token mint`.

### Task 10: The interview screen

**Files:**
- Create: `src/app/app/series/[id]/interview/page.tsx` (server: creates/loads in-progress interview via POST, passes props), `src/app/app/series/[id]/interview/LiveInterview.tsx` (client — the centerpiece), `src/app/api/interviews/[id]/messages/route.ts` (POST batch), `src/app/api/interviews/[id]/audio/route.ts` (POST blob), `src/app/api/interviews/[id]/complete/route.ts` (POST)
- Create: `src/server/interviews/complete.ts`

**Interfaces:**
- Consumes: Task 9 token route.
- Produces: POST `/api/interviews/[id]/messages` body `{messages: {role:"interviewer"|"subject", text: string, tOffsetSec: number, seq: number}[]}` — insert-only, ignores `seq` conflicts (idempotent retries).
- Produces: POST `/api/interviews/[id]/audio` — `audio/webm` body → service client upload to `interview-audio/${orgId}/${interviewId}.webm`, sets `interviews.audio_path`.
- Produces: POST `/api/interviews/[id]/complete` body `{durationSec}` → `complete.ts`: status `completed`, `ended_at`, decrement `organizations.credits_remaining` once (`credit_charged` guard), fire-and-forget `processInterview` (Task 12 — until then, a no-op import), returns `{recapUrl: "/app/interviews/"+id+"/recap"}`.

- [ ] **Step 1:** Build `LiveInterview.tsx` — design per `Postaudio Mockups.dc.html#1a` ("Stage" direction — chosen) responsive down to the phone layout of `Postaudio Mobile.dc.html#1d`: dark `.dark-session` full-viewport; top bar (series title, elapsed timer); center orb (CSS states: `speaking` = breathe animation running, `listening` = ring pulse, `thinking` = dimmed); Anna's current question in large serif (from the latest assistant transcript event); faint italic live transcription of the subject with gradient fade; controls: Pause (mutes mic track), Skip question (sends a data-channel `response.create` with instruction "move to the next topic"), **I'm done for today** (primary → teardown). Collapsible "transcript so far" drawer listing turns.
- [ ] **Step 2:** WebRTC wiring inside the component: POST start (from server page) → POST realtime-token → `RTCPeerConnection` + mic `getUserMedia` → offer SDP to `https://api.openai.com/v1/realtime/calls?model=<model>` with `Authorization: Bearer <clientSecret>` → answer SDP → remote audio to an `<audio autoplay>` el. Data channel `oai-events`: accumulate `conversation.item.input_audio_transcription.completed` (subject turns) and the assistant `response.output_audio_transcript.done` events (verify exact event names against the installed `openai` package docs/types before coding). Every 5s (and on teardown) flush unsent turns to the messages route with monotonically-increasing `seq` and `tOffsetSec = (Date.now()-startedAt)/1000` captured at event time. In parallel, run `MediaRecorder` on the mic stream; on end, upload the webm blob to the audio route.
- [ ] **Step 3:** End flow: stop tracks/recorder → final message flush → audio upload → complete POST → `router.push(recapUrl)`. Handle mic-permission denial (friendly card with retry) and OpenAI connect failure (error card, "Try again" — interview row stays `in_progress` and is reused on retry rather than double-charging).
- [ ] **Step 4:** Manual end-to-end: real voice conversation happens, transcript rows land in `interview_messages`, audio object exists in storage, credits decremented once. This is the riskiest task — verify with the running app (`npm run dev`), not just build.
- [ ] **Step 5:** Commit: `feat(interview): live WebRTC voice interview with transcript capture and audio recording`.

### Task 11: Interviewee home, hand-the-mic, recap

**Files:**
- Create: `src/app/app/InterviewееHome.tsx` — NOTE: name it `IntervieweeHome.tsx` (ASCII), `src/app/app/series/[id]/handoff/page.tsx`, `src/app/interviews/[id]/recap` → create as `src/app/app/interviews/[id]/recap/page.tsx`
- Modify: `src/app/app/page.tsx` (role-aware branch from Task 7), `src/app/app/series/[id]/page.tsx` (add "Hand the mic" button when subject has no account)

**Interfaces:**
- Consumes: interview screen route (Task 10), summaries/facts (Task 12 — recap renders "processing…" until rows exist, with `router.refresh()` poll every 4s up to 60s).

- [ ] **Step 1:** `IntervieweeHome` per `Postaudio Mobile.dc.html#1c`: personal serif prompt built from the series' lowest-coverage must-cover topic or latest suggested topic ("Sam would love to hear about …"), giant round **Start talking** → interview route, "Not today" ghost (dismisses for the day via cookie), memories count footer, "Your memories" link (Task 15 route `/app/memories`). One primary action — nothing else.
- [ ] **Step 2:** Handoff page per `Postaudio Mobile.dc.html#1b`: "Hand the phone to {subject_name}", the three explainer bullets, "She's ready" primary → interview route with `?handoff=1` (start POST sets `hand_the_mic: true`, prompt builder gets `handTheMic: true`), "Back to my view" ghost.
- [ ] **Step 3:** Recap per `Postaudio Mobile.dc.html#1e`: "What we heard today" serif, summary short, "Saved today" fact list (facts where `source_interview_id = id`), next-time teaser (first suggested topic: "Next time, Anna would love to hear about …"), Done → `/app`.
- [ ] **Step 4:** Build + verify all three render (recap shows the processing state pre-Task-12). Commit: `feat(app): interviewee home, hand-the-mic handoff, session recap`.

### Task 12: Knowledge pipeline — extraction + summaries

**Files:**
- Create: `src/server/ai/extract.ts`, `src/server/ai/__tests__/extract.test.ts`, `src/server/pipeline/process-interview.ts`
- Modify: `src/server/interviews/complete.ts` (call the real `processInterview`)

**Interfaces:**
- Consumes: `anthropicClient()` (Task 6), transcript rows (Task 10).
- Produces: `extractKnowledge(input: {seriesGoal: string; subjectName: string; topics: {name; description?}[]; transcript: {id: string; role: string; text: string; tOffsetSec: number|null}[]}): Promise<Extraction>` where

```ts
type Extraction = {
  summary: { short: string; long: string; bullets: string[] };
  facts: { statement: string; topic: string; confidence: number; sourceMessageId: string|null;
           entities: { kind: "person"|"place"|"org"|"event"|"date"; name: string }[] }[];
  suggestedTopics: { name: string; description: string }[];
  coverage: { topic: string; score: number }[];
};
```
Claude `claude-sonnet-5`, forced tool-use with that JSON schema; transcript lines are numbered by message id so the model returns `sourceMessageId` per fact; temperature 0.2. One retry on schema-parse failure.
- Produces: `processInterview(interviewId: string): Promise<void>` — service client; idempotent (skips if already `processed`); loads series+topics+messages → `extractKnowledge` → upserts `interview_summaries`, inserts facts (`audio_offset_sec` from the source message's `tOffsetSec`), upserts entities + `fact_entities`, inserts unseen `suggestedTopics` (`suggested: true`), updates `topics.coverage_score` from `coverage` → marks `processed`. On error: `process_error` + `process_attempts + 1`, rethrow-safe (never crashes the caller). Invariant guard: if extraction returns zero facts on a transcript with ≥4 subject turns, retry once with a "you must extract at least one fact" addendum; if still zero, leave status `completed` with `process_error='no_facts'` for the tick to retry.

- [ ] **Step 1:** Failing test for `extractKnowledge` with a mocked SDK returning a canned tool_use payload; assert the zod schema parses, sourceMessageId passthrough works, and a malformed first response triggers exactly one retry.
- [ ] **Step 2:** Implement; PASS. Then `processInterview` (no unit test — verified live; keep every DB write in one clearly-ordered function with upserts on natural keys).
- [ ] **Step 3:** Wire into `complete.ts` (fire-and-forget with `.catch()` logging). Run a real interview end-to-end: facts/summary/topics appear, recap fills in.
- [ ] **Step 4:** Commit: `feat(pipeline): transcript → facts/entities/summary/coverage extraction`.

### Task 13: Fact merge + tick cron + reprocess

**Files:**
- Create: `src/server/pipeline/merge.ts`, `src/server/pipeline/__tests__/merge.test.ts`, `src/app/api/interviews/[id]/reprocess/route.ts`
- Modify: `src/server/pipeline/process-interview.ts` (merge step between extraction and insert), `src/app/api/jobs/tick/route.ts`

**Interfaces:**
- Produces: `decideMerges(existing: {id: string; topic: string; statement: string; status: string}[], incoming: {statement: string; topic: string}[]): Promise<MergeDecision[]>` — Claude call per batch; `type MergeDecision = {index: number; action: "insert"|"skip_duplicate"|"supersede"; supersedesFactId?: string}`.
- Produces (pure, TDD): `applyMergeDecisions<T>(incoming: T[], decisions: MergeDecision[]): {toInsert: (T & {supersedesFactId?: string})[]; skipped: number}` — unknown indices insert by default (fail-open: knowledge must not be silently dropped).
- Produces: GET `/api/jobs/tick` — auth: `Authorization: Bearer ${env().CRON_SECRET}` (Vercel Cron sends it automatically when CRON_SECRET is set; 401 otherwise); sweeps `interviews` where `status='completed' and process_attempts < 5`, runs `processInterview` for each (max 5 per tick), returns `{ok: true, swept: n}`. Keep POST doing the same for manual runs.
- Produces: POST `/api/interviews/[id]/reprocess` (admin or can_interview) → resets `process_error`, runs `processInterview`.

- [ ] **Step 1:** TDD `applyMergeDecisions` (cases: all-insert default, skip_duplicate drops, supersede carries the id, out-of-range decision index ignored safely).
- [ ] **Step 2:** Implement `decideMerges` (compare only same-topic facts to keep the prompt small; instruct: "duplicate = same event/claim reworded → skip; new detail contradicting/refining an old fact → supersede"). In `processInterview`: inserted superseding facts set the old fact `status='superseded', superseded_by=<new id>`.
- [ ] **Step 3:** Rewrite tick route per contract; add `CRON_SECRET` to env schema use (already in schema from Task 1). Implement reprocess route + a small "Reprocess" button on the series detail session rows (admin-only, shown when `process_error` is set).
- [ ] **Step 4:** Verify: run the same interview through `processInterview` twice — no duplicate facts (merge skips them); tick with a stuck `completed` row processes it. Commit: `feat(pipeline): fact merging with supersession, cron sweep, manual reprocess`.

### Task 14: Knowledge dashboard + session results

**Files:**
- Create: `src/app/app/series/[id]/knowledge/page.tsx`, `src/app/app/interviews/[id]/page.tsx` (results)

**Interfaces:**
- Consumes: `getSeriesKnowledge` (topics, facts w/ entities, timeline = `entities kind='date'` joined facts sorted by name), summaries (Task 12).

- [ ] **Step 1:** Knowledge page per `Postaudio Mockups.dc.html#1f`: serif hero "N memories saved for the family", coverage rows for every topic (amber < 0.25, "still blank" callout at 0), People grid (person entities as chips with `detail` kicker), Places, Timeline (date entities + fact statements), "Where to go next" rail (suggested topics), needs-review card when any fact has `status='needs_review'`.
- [ ] **Step 2:** Results page per `#1e`: header (session date, duration, "audio saved" when `audio_path`), summary card (short + bullets), "N new memories" fact list (topic + ▶ `audio_offset_sec` formatted mm:ss), transcript (all turns, subject italic serif, collapsed past 8 with "Show all N turns" `<details>`), suggested-topic chips with + (POST promoting to queue — reuse Task 7's promote handler), back link to the series.
- [ ] **Step 3:** Build + verify against a processed interview. Commit: `feat(knowledge): series knowledge dashboard and session results`.

### Task 15: Review & correct flow (memories)

**Files:**
- Create: `src/app/app/memories/page.tsx` (list), `src/app/app/memories/[factId]/page.tsx` + `ReviewActions.tsx` (client), `src/app/api/facts/[id]/route.ts` (PATCH), `src/app/api/facts/[id]/audio-url/route.ts` (GET signed URL)

**Interfaces:**
- Produces: PATCH `/api/facts/[id]` body `{action: "confirm"} | {action: "correct", statement: string} | {action: "retell"}` — guards: caller is the series subject, an admin, or has can_interview. `confirm` → `status:'active'`; `correct` → update `statement`, `updated_at`, `status:'active'`, audit_logs `fact.corrected` (original transcript untouched — invariant); `retell` → `status:'retell_queued'` (Task 9's prompt builder already consumes `retellQueue` = statements of retell_queued facts, and `processInterview` flips them back to `active` after the next interview in the series is processed — add that line in this task).
- Produces: GET `/api/facts/[id]/audio-url` → 60-min signed URL for the source interview's `audio_path` + `startSec` = `audio_offset_sec`.

- [ ] **Step 1:** Memories list per `Postaudio Mobile.dc.html#1f`: "Your memories — in your own words", filter pills (Newest / People / Places / Needs review), italic serif rows with topic+date meta, amber badge on needs_review. Scope: facts from series where caller is subject; admins see a series switcher.
- [ ] **Step 2:** Review detail per `#1g`: the fact in large italic serif, audio player (`<audio>` with signed URL, seeked to `startSec` via `#t=` media fragment), source line ("Session N · Series title"), stacked actions: **That's right** (primary) / **Fix a detail** (textarea reveal → save) / **Retell next time** (ghost), immutability footer line.
- [ ] **Step 3:** Implement PATCH + signed-URL routes; verify each action, and that a retell-queued fact's statement shows up in the next interview's instructions.
- [ ] **Step 4:** Commit: `feat(review): confirm / fix-a-detail / retell-next-time memory flow`.

### Task 16: Markdown/text export

**Files:**
- Create: `src/server/export/markdown.ts`, `src/server/export/__tests__/markdown.test.ts`, `src/app/api/series/[id]/export/route.ts`

**Interfaces:**
- Produces (pure, TDD): `renderSeriesMarkdown(input: {series: {title; subjectName; goal}, summaries: {short: string; date: string}[], factsByTopic: {topic: string; facts: {statement: string; sessionLabel: string; timestamp: string|null}[]}[], people: {name: string; detail?: string}[], places: string[], timeline: {label: string; statement: string}[], scope: {summaries: boolean; facts: boolean; entities: boolean; timeline: boolean; transcripts: boolean}, transcripts?: {sessionLabel: string; turns: {role: string; text: string}[]}[]}): string` — layout: `# {title}` → summaries → `## {topic}` fact bullets with `— {sessionLabel}, {timestamp}` source lines → People & Places → Timeline → optional transcripts.
- Produces: GET `/api/series/[id]/export?format=md|txt&scope=summaries,facts,entities,timeline[,transcripts]` → `Content-Disposition: attachment` download (txt = markdown stripped of `#`/`**`).

- [ ] **Step 1:** Failing test: canonical fixture in → snapshot-ish assertions (`toContain("# Dad's Story")`, `toContain("— Session 3, 04:12")`, scope flags omit sections). Implement → PASS.
- [ ] **Step 2:** Route + wire the series-detail export card per `Postaudio Mockups.dc.html#1g` (format radio-cards, scope checkboxes, Download button = plain `<a>` to the route; keep the audio-privacy note line). Commit: `feat(export): markdown/text series export`.

### Task 17: Super-admin operator console

**Files:**
- Modify: `src/app/admin/AdminShell.tsx` (dark `.op-head` styling per mockup), `src/app/admin/page.tsx` (→ users list), `src/app/admin/accounts/[id]/page.tsx`
- Create: `src/app/admin/series/page.tsx`
- Keep: existing `PLATFORM_ADMIN_EMAILS` gate + credits top-up pages.

**Interfaces:**
- Consumes: service client (`src/db/service.ts`) — all reads metadata-only: counts, names, statuses; never `facts.statement`, `interview_messages.text`, or summary text.

- [ ] **Step 1:** Users list per `Postaudio Superadmin.dc.html#1a`: growth StatTiles (users, active series, interviews this week, total facts — counts only), accounts table (org, owner, plan, status active/dormant>42d/invited, series count, member count, invite-network summary "invited N · M subjects w/o account"), filter pills + search (querystring-driven).
- [ ] **Step 2:** Account detail per `#1b`: plan & usage (storage bytes from the storage API, interview count, fact count), series metadata rows, network panel (members with roles + statuses, no-account subjects from `series.subject_user_id is null`), recent activity from `audit_logs`, and the locked-content card verbatim: "Transcripts and knowledge are hidden. Start an audited impersonation session to view." — impersonation button writes an `audit_logs` row `action:'admin.impersonation_requested'` and is otherwise disabled with tooltip "V1: audit trail only" (real impersonation is not in V1 scope; the audit invariant is what ships).
- [ ] **Step 3:** Series registry per `#1c`: cross-account table with subject-type filter pills. `npm run build` + verify gate blocks non-platform-admins. Commit: `feat(admin): operator console — metadata-only users/accounts/series`.

### Task 18: Polish, invariant sweep, deploy readiness

**Files:**
- Modify: `src/app/page.tsx` (marketing → simple warm-paper landing: headline "An AI interviewer that builds knowledge through conversation", sign-in CTA), `vercel.ts` (tick cron stays `* * * * *`), `README.md` (replace create-next-app boilerplate: what it is, env vars table, local dev, migration command)

- [ ] **Step 1:** Invariant sweep against spec §7 — grep-level checks: no update/delete policy on `interview_messages`; no admin-console query selects fact/message/summary text; interviewee home has exactly one `<Button variant="primary">`; prompt builder tests cover don't-bring-up. Fix anything found.
- [ ] **Step 2:** Env: `vercel env ls` — confirm `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` exist in production; add via `vercel env add` if missing (values from Nick's local `.env.local`; if absent, STOP and report which keys are needed rather than inventing).
- [ ] **Step 3:** `rm -rf .next && npm run build && npm test` clean; delete `plan/` folder files 01–06? NO — leave them (historical), but add a superseded banner line at top of `plan/01-product-plan.md`.
- [ ] **Step 4:** Full manual pass of the loop: create series (wizard) → interview (voice) → recap → knowledge dashboard → correct a fact → export. Commit: `chore: V1 polish, docs, deploy readiness` and push.

---

## Self-review notes

- **Spec coverage:** §1 data model → T2; §2 owner flow → T4–T8, interviewee → T10–T11+T15, hand-the-mic → T11, super admin → T17; §3 engine → T9–T10, pipeline §3 outputs → T12–T13; §4 screens: Login 1a/1c are the existing auth pages restyled by T3's tokens (sign-in pages inherit globals; acceptable V1 delta), 1b → T4; Admin 6a–d/1d → T5–T6, 2a → T7, 2b → T7, 3a → T4, 3b → T8; Mockups 1a-c → T10 (Stage direction chosen), 1e → T14, 1f → T14, 1g → T16; Mobile 1a → T7 (responsive), 1b → T11, 1c → T11, 1d → T10, 1e → T11, 1f/1g → T15; Superadmin → T17. §5 visual → T3. §6 V1 in-list fully mapped; out-list untouched. §7 invariants → T2 (immutability via RLS), T12 (must-add-facts guard), T11/T18 (one primary action), T9 (don't-bring-up), T17 (metadata-only).
- **Known deliberate deltas:** billing/Stripe stays parked (credits + admin top-up only); impersonation ships as audited stub; Google OAuth = existing Supabase provider config (enable in dashboard, no code); marketing page is a placeholder.
- **Type consistency check:** `MergeDecision`, `Extraction`, `buildInterviewerInstructions` signatures are each defined once and consumed by name in T12/T13/T9↔T15 — verified consistent.
