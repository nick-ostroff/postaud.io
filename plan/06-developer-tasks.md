# PostAud.io — Developer Task List (MVP)

Grouped by area. Ordered within each group. Check off as shipped. Acceptance criteria inline.

## A. Infrastructure & setup

- [ ] **A1.** Create Vercel project `postaud-io` linked to the git repo. Link production + preview branches.
- [ ] **A2.** Create Supabase project (US region). Save URL + anon + service-role keys to Vercel env (all envs).
- [ ] **A3.** Create Twilio account + subaccount for prod vs staging. Save creds.
- [ ] **A4.** Register a 10DLC brand + campaign for SMS. Submit "PostAud Appointment & Content Interviews" campaign.
- [ ] **A5.** Provision Twilio Messaging Service + initial pool of 2 voice numbers. Wire inbound/status webhooks via idempotent script `scripts/twilio-provision.ts`.
- [ ] **A6.** Set up Stripe (test mode first). Create 3 products/prices: Starter $29/20, Growth $99/100, Scale $299/400.
- [ ] **A7.** Set up Resend domain + `EMAIL_FROM=hello@postaud.io`.
- [ ] **A8.** Configure Sentry + Axiom. Wire into Next.js server + client.
- [ ] **A9.** Write `vercel.ts` with build config + cron entry `/api/jobs/tick` every minute.
- [ ] **A10.** Write `env.ts` typed env parser; throw on missing required vars.

Acceptance: `vercel env pull` on a fresh clone produces a working local dev environment.

## B. Database & schema

- [ ] **B1.** Apply `plan/03-schema.sql` as migration `/supabase/migrations/0001_init.sql`.
- [ ] **B2.** Verify RLS blocks cross-org reads (write a test user in two orgs).
- [ ] **B3.** Add `consent_status` transition enforcement trigger (can't go `revoked → implied`).
- [ ] **B4.** Add `dial_code` generator function `gen_dial_code()` → 6-digit, unique among active.
- [ ] **B5.** Generate TS types via `supabase gen types typescript` → `src/db/types.ts`. Commit.
- [ ] **B6.** Seed script: one demo org, one template, two contacts, for local dev.

Acceptance: app boots, typed Supabase client reads/writes pass RLS.

## C. Frontend

### C1. Auth + shell
- [ ] Sign-in/up page (Supabase Auth UI, email + Google)
- [ ] App shell `/app/layout.tsx` with sidebar: Dashboard, Templates, Contacts, Sends, Settings, Billing
- [ ] Onboarding: first-run empty state with "Create your first interview" CTA

### C2. Templates
- [ ] Templates list (`/app/templates`) — name, output type, active status
- [ ] Template builder (`/app/templates/[id]`):
  - Title, intro, SMS body
  - Question rows with drag-reorder, hint, required, allow_followup, max_seconds
  - Output type picker with previews
  - Webhook URL field with "Send test" button
  - Save / Discard / Duplicate / Archive actions
- [ ] SMS preview panel (uses contact placeholder)

### C3. Contacts
- [ ] Contacts list with search, bulk import (CSV ≤25)
- [ ] Add/Edit contact drawer

### C4. Sends
- [ ] "New Send" wizard: pick template → pick/create contact(s) → preview SMS → confirm
- [ ] Sends list with status timeline
- [ ] Send detail page: status, recording player, transcript viewer, Q&A cards, summary, rendered output, webhook delivery log
- [ ] Delete session action (with confirmation)

### C5. Public recipient flow
- [ ] `/c/[token]` page: friendly hero, consent checkbox, "Tap to Call" button with correct `tel:` URI
- [ ] `/c/[token]/done` post-call thank-you page (optional)
- [ ] Expired/invalid token state

### C6. Billing
- [ ] Plan selector → Stripe Checkout redirect
- [ ] Usage dashboard: credits left, rolling usage chart
- [ ] Billing portal link

### C7. Settings
- [ ] Workspace name
- [ ] Retention toggle (7/30/90 days)
- [ ] API keys (for later) — placeholder
- [ ] Danger zone: delete workspace

Acceptance: demo user can sign up, build a template, send themselves an invite, and view the results.

## D. Backend (API routes)

Implement routes from `plan/04-api-routes.md` in this order:

- [ ] **D1.** `POST /api/me/bootstrap` (creates user + org + membership)
- [ ] **D2.** Template CRUD (5 routes)
- [ ] **D3.** Contact CRUD (4 routes)
- [ ] **D4.** Interview request send (single + bulk + resend + cancel)
- [ ] **D5.** Public recipient routes (`GET /api/public/request/:token`, consent)
- [ ] **D6.** Sessions read routes + signed-URL redirect
- [ ] **D7.** Admin routes (last, behind role gate)

Acceptance: all routes have Zod input validation, per-route tests, and RLS + ownership checks.

## E. Twilio integration

- [ ] **E1.** `POST /api/webhooks/twilio/voice/incoming` — returns `<Gather>` TwiML
- [ ] **E2.** `POST /api/webhooks/twilio/voice/match` — resolves code/caller-ID, opens `<ConversationRelay>`
- [ ] **E3.** `POST /api/webhooks/twilio/voice/status` — lifecycle updates
- [ ] **E4.** `POST /api/webhooks/twilio/voice/recording` — downloads recording, uploads to Storage, enqueues pipeline
- [ ] **E5.** `POST /api/webhooks/twilio/messaging/status` — delivery updates
- [ ] **E6.** `POST /api/webhooks/twilio/messaging/inbound` — handle STOP/HELP
- [ ] **E7.** Signature verification middleware (reject 403 on fail; log IP)
- [ ] **E8.** SMS send helper `sendInviteSMS(request)` (with branded body + opt-out)

Acceptance: a real Twilio test call places through the whole flow without manual intervention.

## F. Voice relay (ConversationRelay)

- [ ] **F1.** Websocket endpoint `/api/voice/relay` (Node runtime, sticky)
- [ ] **F2.** Session FSM: GREETING → CONSENT → ASK → LISTEN → FOLLOWUP? → NEXT → WRAPUP → DONE
- [ ] **F3.** Done-detector: silence (2.0s) + keyword list + 90s cap
- [ ] **F4.** Event writer: append to `call_events` on every transition/delta
- [ ] **F5.** Call session finalization on close (mark completed/partial/failed)

Acceptance: completes a 5-question interview end-to-end on a real call, including exactly one follow-up on a low-coverage answer.

## G. AI pipeline

- [ ] **G1.** `src/ai/provider.ts` abstraction with `OpenAIProvider` + `AnthropicProvider`
- [ ] **G2.** `src/ai/models.ts` logical-model-name → provider/model map
- [ ] **G3.** Prompts (versioned files):
  - [ ] `followup-scorer`
  - [ ] `followup-generator`
  - [ ] `transcript-cleaner`
  - [ ] `answer-extractor`
  - [ ] `summarizer`
  - [ ] Output renderers: `blog.draft`, `crm.note`, `summary.concise`, `qa.structured`, `webhook.json`
- [ ] **G4.** JSON-schema validator per prompt with one-retry on parse fail
- [ ] **G5.** Token + cost logger (per call → Axiom)
- [ ] **G6.** Org-level daily cost cap enforcement (default $5/day)

Acceptance: every LLM response is schema-valid or falls back to a deterministic safe default.

## H. Job pipeline

- [ ] **H1.** `POST /api/jobs/tick` — reads `jobs` where `run_after <= now()`, dispatches
- [ ] **H2.** `POST /api/jobs/run` — internal HMAC-protected; executes a single job
- [ ] **H3.** Stage implementations: `cleanup_transcript`, `extract_answers`, `summarize`, `render_output`, `deliver_webhook`, `notify_email`
- [ ] **H4.** Idempotency keys per stage
- [ ] **H5.** Retry policy + `last_error` persistence
- [ ] **H6.** Cron entry in `vercel.ts` `* * * * *`

Acceptance: a recorded call goes from upload to webhook-delivered output within 60s p95.

## I. Integrations (outbound)

- [ ] **I1.** Webhook delivery signer (HMAC-SHA256, `X-PostAudio-Signature: t=..,v1=..`)
- [ ] **I2.** SSRF guard (reject localhost/private IPs)
- [ ] **I3.** Delivery retry scheduler (1m, 5m, 30m, 2h, 24h)
- [ ] **I4.** "Send test" button for webhook URL (fires a synthetic payload)
- [ ] **I5.** Resend integration for email notifications
- [ ] **I6.** Public docs page describing signature verification + payload schema (link from dashboard)

Acceptance: a sender can paste a webhook.site URL, run a test, and see a signed payload arrive.

## J. Billing (Stripe)

- [ ] **J1.** `POST /api/billing/checkout` → Stripe Checkout session
- [ ] **J2.** `POST /api/billing/portal` → billing portal link
- [ ] **J3.** `POST /api/webhooks/stripe` — handle subscription lifecycle + credit top-up
- [ ] **J4.** Credit ledger: decrement on send, restore on cancel/expire
- [ ] **J5.** Hard block sends when `credits_remaining <= 0`

Acceptance: test-mode checkout creates a subscription, credits land in org row, a send succeeds.

## K. Security & compliance

- [ ] **K1.** RLS audit (run cross-org tests in CI)
- [ ] **K2.** Consent enforcement (server refuses to process if `consent_captured=false`)
- [ ] **K3.** Signed URLs only for recordings (15-min TTL)
- [ ] **K4.** STOP handling + `contacts.consent_status='revoked'` blocks sends
- [ ] **K5.** Rate limits: 25 SMS/day/org, 10 sends/min/user (Upstash Redis)
- [ ] **K6.** Audit log writes on sends, deletes, logins, impersonations
- [ ] **K7.** GDPR/CCPA: `/app/settings/data` export + delete actions

Acceptance: security checklist from `plan/02-technical-spec.md` §10 is green.

## L. Observability

- [ ] **L1.** Sentry wired for server + client
- [ ] **L2.** Structured logs to Axiom (IDs only, no PII in bodies)
- [ ] **L3.** Dashboards: Interview funnel, Cost per interview, Job failure rate
- [ ] **L4.** Alerts: job failure rate > 5% / 5m, daily LLM cost > $50, Twilio webhook signature failures spike

## M. QA before launch

- [ ] **M1.** Noisy-audio test call
- [ ] **M2.** Early-hangup mid-interview
- [ ] **M3.** Consent refusal mid-call
- [ ] **M4.** Wrong DTMF → verbal code fallback
- [ ] **M5.** Caller-ID blocked → verbal code fallback
- [ ] **M6.** Accent + speed variation
- [ ] **M7.** iOS Safari + Android Chrome link rendering (SMS tap → dialer behavior)
- [ ] **M8.** CSV import of 25 rows
- [ ] **M9.** Webhook failing receiver → retries visible in UI
- [ ] **M10.** Stripe test-card full subscription + credit depletion cycle

## N. Launch

- [ ] **N1.** Marketing site `/` with hero, how-it-works, pricing, FAQ
- [ ] **N2.** Terms, Privacy, SMS disclosure page (10DLC compliance)
- [ ] **N3.** 10DLC brand approval confirmed
- [ ] **N4.** Alpha list of 10 users (pre-pick before code is done)
- [ ] **N5.** Stripe live mode switch
- [ ] **N6.** Production Twilio numbers + pool size = 2 → monitor usage, scale up

---

## Rough ordering (what to build in what week)

| Week | Focus |
|---|---|
| 1 | A (infra), B (schema), D1–D3 (auth/templates/contacts), C1–C3 (UI shells) |
| 2 | D4–D6 (sends, public), C4–C5 (sends UI, recipient page) |
| 3 | E1–E8 (Twilio wiring), F1–F5 (voice relay FSM) |
| 4 | G1–G6 (AI pipeline), H1–H6 (jobs) |
| 5 | I1–I6 (integrations), J1–J5 (billing), L (observability) |
| 6 | K (security), M (QA), N (launch) |
