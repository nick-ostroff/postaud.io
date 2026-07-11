# PostAud.io V1 Pivot — Voice-First AI Knowledge Interviewer

**Date:** 2026-07-11
**Status:** Approved design
**Supersedes:** the SMS/phone-interview V1 described in `plan/01-product-plan.md` through `plan/06-developer-tasks.md`

## Vision

An AI interviewer that builds knowledge through conversation, rather than passive note-taking. The transcript isn't the product — the growing knowledge base is. North star: **every conversation permanently improves what the AI knows about the subject.**

## What changed from the old V1

The SMS → phone-call flow (Twilio SMS invites, tap-to-call, DTMF matching, Record-chained TwiML) is removed entirely. Interviews now happen in the browser: voice-first, real-time, conversational. Everything that was working and product-agnostic carries over: Supabase auth + multi-tenant RLS schema, admin panel, the AI processing pattern, Vercel deployment.

**Out of scope for V1:** SMS invites, phone-call recording, multiple simultaneous participants, scheduling, automatic topic chasing, integrations/webhooks, Stripe checkout (billing stays parked/stubbed).

## Core flow

1. **Create an interview series** — title, goal, initial prompt (e.g. "My Life" / "Teach my AI about me"), assigned to a subject (an org member; invite by email if they don't have an account).
2. **Interview screen** — voice-first, one question at a time. The AI asks smart follow-ups in real time. Conversational, not form-filling.
3. **End of interview** — full transcript, summary, extracted key facts, and suggested future topics to explore.
4. **Over time** — the series accumulates a knowledge base (facts, people, places, timeline) and a dashboard of "known about you" vs "still blank."
5. **Export** — plain Markdown per series.

## Architecture

### Voice layer: OpenAI Realtime API over WebRTC

- The browser connects **directly to OpenAI** via WebRTC. Audio never touches our server, so Vercel's no-WebSocket constraint (which killed ConversationRelay) doesn't apply.
- Server mints a short-lived Realtime session token: `POST /api/interviews/[id]/realtime-token`. The token request embeds the interviewer system prompt, built from: series goal + initial prompt, a digest of already-known facts, uncovered/low-coverage topics, and interviewing rules (one question at a time, natural follow-ups, don't re-ask known facts).
- Route verifies the caller is the series subject (or org owner) and checks org credit balance before minting.

### Transcript capture

- Realtime API emits transcript events (user speech transcription + assistant text) on the WebRTC data channel.
- The interview page batches turns to `POST /api/interviews/[id]/messages` every few seconds so the transcript survives a dropped tab or crash.
- "End Interview" → `POST /api/interviews/[id]/complete` → status `completed`, fire-and-forget processing kick.

### Knowledge pipeline (adapts existing `processSession` pattern)

`processInterview(interviewId)` runs inline, idempotent (upserts), same as today's pipeline:

1. **Extract** — full transcript → Claude → facts (statement, confidence, topic, entities), interview summary (short/long/bullets), suggested future topics.
2. **Merge** — compare new facts against existing series facts per topic: dedupe, mark superseded facts (`superseded_by`). Knowledge compounds; it doesn't duplicate.
3. **Score coverage** — update per-topic coverage (0–1, LLM judgment). Heuristic by design; motivating, not precise.
4. Mark interview `processed`.

**Reliability:** manual Reprocess button (existing pattern) **plus** `/api/jobs/tick` finally does real work: the every-minute Vercel cron sweeps for `completed`-but-unprocessed interviews and retries them. Tick gets a GET handler (Vercel Cron calls GET; the current POST-only stub 405s).

### Assignees / membership

- Series subjects are real users. Owner invites by email via Supabase `auth.admin.inviteUserByEmail` (service role); invitee sets a password and lands with a `member` membership.
- Members see series where they are the subject. Owners see all org series. Enforced by RLS.
- The existing `memberships` table already supports this; V1 adds the invite flow + UI.

## Data model (migration 0005)

New tables, all org-scoped, RLS per existing patterns (`current_org_id()`, child tables delegate via EXISTS joins):

| Table | Key columns |
|---|---|
| `interview_series` | org_id, subject_user_id, title, goal, initial_prompt, status, created_by |
| `interviews` | series_id, org_id, status (`in_progress`→`completed`→`processed`), started_at, ended_at, duration_sec |
| `interview_messages` | interview_id, role (`interviewer`/`subject`), text, ts |
| `topics` | series_id, name, description, coverage_score (0–1), suggested (bool) — seeded by LLM from series goal at creation; doubles as the "future topics" list |
| `facts` | series_id, topic_id, source_interview_id, statement, confidence, superseded_by (self-FK), created_at |
| `entities` | series_id, kind (`person`/`place`/`org`/`event`/`date`), name |
| `fact_entities` | fact_id, entity_id |
| `interview_summaries` | interview_id, short, long, bullets |

**Dropped in the same migration:** `contacts`, `interview_requests`, `interview_sessions`, `call_events`, `transcripts`, `extracted_answers`, `summaries`, `output_jobs`, `webhook_deliveries`, `jobs`, `interview_templates`, `template_questions`.

**Kept:** `organizations` (credits_remaining still gates usage), `users`, `memberships`, `audit_logs`.

**Credits:** checked at interview start (token mint), decremented one per completed interview. Admin top-up unchanged. Stripe remains stubbed.

## Screens

1. **Dashboard** (`/app`) — series cards with coverage %, recent interviews, primary "continue interviewing" CTA.
2. **Series create/edit** (`/app/series/new`, `/app/series/[id]/edit`) — title, goal, initial prompt, subject picker (org members + invite-by-email inline).
3. **Interview screen** (`/app/series/[id]/interview`) — the centerpiece. Large voice-state UI (listening / speaking / thinking), live transcript, mute, End Interview.
4. **Series knowledge view** (`/app/series/[id]`) — topic coverage bars ("known vs blank"), facts grouped by topic, entity chips, timeline, suggested next topics, interview history with transcript + summary per interview.
5. **Members** (`/app/members`) — invite by email, list, role.
6. **Export** — Markdown download route per series: summary → facts by topic → entities → timeline.

**Visual language:** the in-progress dark "premium" redesign (currently uncommitted on layout/dashboard/sidebar) becomes the standard for all screens. The hardcoded fake trend badges ("+100%", "+12%") and the external noise-texture URL are removed.

## Code removal

Delete: `src/app/api/webhooks/twilio/**`, `src/lib/{twilio,twilio-messaging,sms,dial-code}.ts`, `src/server/telephony/`, `src/server/fsm/`, `src/app/c/[token]/`, contacts/sends/templates pages + API routes, `src/ai/` (dead scaffold — provider, models, prompt stubs), `src/lib/mocks.ts`, `src/app/api/public/**`, `src/app/api/integrations/**`, `src/app/api/sessions/**`, `src/app/api/interview-requests/**`, `src/app/api/contacts/**`, `src/app/api/templates/**`. Twilio/Resend-for-SMS env vars removed from `src/lib/env.ts` (Resend key stays for the invite emails Supabase doesn't cover, if needed later).

## Risks

- **Follow-up quality** lives or dies on the Realtime system prompt; expect iteration.
- **Cost:** ~$0.30–0.60 per 10-minute Realtime interview — hence the credit gate.
- **Fact merging** is the hard AI problem; V1 bar is "no obvious duplicates, supersessions work," not perfection.
- **Coverage scores** are LLM heuristics; treated as motivation, not metrics.
