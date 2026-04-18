# PostAud.io — Technical Spec (MVP)

Implementation-level spec. Pairs with `03-schema.sql`, `04-api-routes.md`, `05-twilio-flow.md`.

## 1. System boundaries

- **Vercel** hosts the Next.js app + Functions. Fluid Compute, Node.js 24.
- **Supabase** is the only stateful store: Postgres (+ RLS), Auth (email + Google), Storage (recordings), `pg_cron` (job poller).
- **Twilio** owns SMS and voice. Numbers in a shared pool.
- **LLMs** accessed via a thin `aiProvider` interface so we can switch providers freely.
- **Stripe** for billing. Webhook-driven credit accounting.
- **Resend** for transactional email.

## 2. Core flows

### 2.1 Send invite

1. Sender submits `POST /api/interview-requests` with `{ templateId, contactId }`.
2. Server validates org ownership, credit balance, template active.
3. Server inserts `interview_requests` row with:
   - `token` — 16-char base32 (unique, URL-safe)
   - `dial_code` — 6-digit numeric, unique among active rows
   - `template_snapshot` — frozen JSON of template + its questions
   - `status = 'sent'`, `expires_at = now() + '7 days'`
4. Server sends SMS via Twilio Messaging Service. Body includes `https://postaud.io/c/{token}`.
5. Server decrements credit (soft-hold; releases on expire/cancel).
6. Audit log row written.

### 2.2 Recipient taps link → call starts

1. `GET /c/[token]` renders landing page. Server resolves token → request (only if `status in ('sent','reminded')` and not expired), returns `{ firstName, senderName, templateTitle, estMinutes, pooledNumber, dialCode }`.
2. Page shows consent checkbox. When checked, the Tap-to-Call button href becomes:
   ```
   tel:{pooledNumber},,,{dialCode}
   ```
3. Page `POST /api/sessions/consent-accepted` when checkbox ticked (written consent captured; persisted on new `interview_sessions` row with `consent_captured=true` and `consent_source='written'`).
4. Recipient taps. OS dialer places call and auto-sends DTMF after 6s of pauses.

### 2.3 Inbound call

1. Twilio hits `POST /api/webhooks/twilio/voice/incoming` with signed form data.
2. Server verifies X-Twilio-Signature. Returns TwiML:
   ```xml
   <Response>
     <Gather numDigits="6" timeout="5" action="/api/webhooks/twilio/voice/match" method="POST" />
     <Say>Please say or enter your six digit code.</Say>
     <Gather input="speech dtmf" numDigits="6" timeout="8" action="/api/webhooks/twilio/voice/match" />
   </Response>
   ```
3. `/voice/match` resolves DTMF (or speech digits) → `interview_request`.
   - Fallback: if DTMF empty, try `contacts.phone_e164 = from`.
   - If zero or multiple matches, TwiML asks verbally again (one retry).
   - On match: create or resume `interview_sessions` row, respond with TwiML that opens ConversationRelay:
     ```xml
     <Response>
       <Connect>
         <ConversationRelay url="wss://postaud.io/api/voice/relay?sid={sessionId}" ... />
       </Connect>
     </Response>
     ```

### 2.4 ConversationRelay session

Websocket handler at `/api/voice/relay` runs the interview FSM:

```
States:  GREETING → CONSENT → ASK → LISTEN → FOLLOWUP? → NEXT → ... → WRAPUP → DONE
                                          │
                                          └── done-detector (silence 2.0s, keyword, 90s cap)
```

Per-state responsibilities:
- **GREETING**: send welcome prompt referencing `firstName + senderName + templateTitle`.
- **CONSENT**: capture verbal yes. If explicit no → "Understood, ending call" → DONE with `status='declined'`.
- **ASK**: emit question from `template_snapshot.questions[cursor]`.
- **LISTEN**: stream transcription into `call_events` with `event_type='answer_delta'`. Run done-detector against silence + keyword list.
- **FOLLOWUP?**: single LLM call scores answer coverage (0–1) vs question intent. If score < 0.5 AND question allows AND none asked → generate one clarifier ≤18 words.
- **NEXT**: cursor++. Write `answer_ended` event with preliminary text.
- **WRAPUP**: closing line. Close websocket cleanly; Twilio ends call.

Hard limits per session: 20 min wall, 10 questions, 1 follow-up per question.

### 2.5 Post-call pipeline

Twilio `recordingStatusCallback=completed` fires `POST /api/webhooks/twilio/voice/recording`:
1. Server uploads recording to Supabase Storage (`recordings/{org}/{session}.mp3`).
2. Inserts `output_jobs` row with `status='pending'`. Also enqueues pipeline by inserting into `jobs` table (or Vercel Queue).

Worker (invoked via `pg_cron` → `/api/jobs/tick` or Queue consumer) runs stages **in order**, each idempotent:

| Stage | Input | Output | Failure behavior |
|---|---|---|---|
| `cleanup_transcript` | raw call_events answer deltas | `transcripts.cleaned_text` | retry ×3 (exp backoff) |
| `extract_answers` | cleaned_text + template_snapshot | `extracted_answers` rows | retry ×3, mark `partial` on persistent fail |
| `summarize` | cleaned_text + extracted_answers | `summaries` row | retry ×3 |
| `render_output` | summary + extracted + output_type | `output_jobs.rendered_text` | retry ×3 |
| `deliver_webhook` | output_job | `webhook_deliveries` row | retry 1m/5m/30m/2h/24h |
| `notify_email` | output_job | Resend call | retry ×2 |

Idempotency key per stage = `(session_id, stage_name)`. Each worker checks before acting.

## 3. Session state machine (formal)

```
initial → greeting → consent_yes ──► asking(q0)
consent_no → declined
asking(qN) → listening(qN) → [followup_needed? → followup(qN) → listening(qN)] → asking(qN+1)
asking(last) → wrapup → completed
any state + hangup → partial
any state + websocket_error + reconnect_failed → failed
```

Persisted as `interview_sessions.status` enum: `active`, `completed`, `partial`, `failed`, `declined`, `expired`.

## 4. LLM integration contracts

All prompts live in `src/ai/prompts/` as versioned `.ts` files. Every LLM call records `prompt_version` on the resulting row.

### 4.1 `followup-scorer` (in-call, latency-critical)
- **Input:** `{ question: string, question_intent: string, answer_so_far: string }`
- **Output JSON:** `{ coverage: number, missing: string[] }`
- **Model:** `gpt-4o-mini` or similar, temp 0.1, max tokens 80
- **Budget:** 500ms p95

### 4.2 `followup-generator`
- **Input:** `{ question, answer_so_far, missing }`
- **Output JSON:** `{ clarifier: string }` (≤18 words, no multi-part)
- **Model:** same, temp 0.4
- **Validation:** reject if >18 words or contains "and" + "?"

### 4.3 `transcript-cleaner`
- **Input:** raw answer deltas per question
- **Output:** cleaned_text string
- **Model:** `gpt-4o-mini`, temp 0.1

### 4.4 `answer-extractor`
- **Input:** `{ cleaned_text, question, question_hint }` per question
- **Output JSON:** `{ answer_text, confidence: 0-1, followup_text?: string }`
- **Model:** `gpt-4o-mini`, temp 0.2
- **On parse fail:** one retry with stricter schema instruction; then mark `confidence=0`

### 4.5 `summarizer`
- **Input:** `{ cleaned_text, extracted_answers }`
- **Output JSON:** `{ short: string (≤2 sentences), long: string (≤120 words), bullets: string[5] }`
- **Model:** Claude Sonnet, temp 0.3

### 4.6 `output-renderer` (per output type)
- One prompt per output type (`blog.draft`, `crm.note`, etc.)
- **Input:** `{ summary, extracted_answers, brand_voice_hint?, output_options? }`
- **Output:** Markdown/JSON depending on type
- **Model:** Claude Sonnet, temp 0.7 for blog, 0.3 for CRM note

## 5. Provider abstraction

```ts
// src/ai/provider.ts
export interface AIProvider {
  complete<T>(opts: { prompt: string, schema?: JSONSchema, model: string, temp: number, maxTokens: number, signal?: AbortSignal }): Promise<T>;
  stream(opts: ...): AsyncIterable<string>;
}
```

Two implementations: `OpenAIProvider`, `AnthropicProvider`. Routed by a `models.ts` map keyed by logical model name (`fast-extract`, `summary`, `creative-long`). Switching provider is a one-line config change.

## 6. Environment variables

```
# App
NEXT_PUBLIC_APP_URL=
APP_ENV=development|preview|production

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_VOICE_POOL_NUMBERS=+18885551234,+18885559876
TWILIO_WEBHOOK_SECRET=            # for additional HMAC on our end
TWILIO_CONVERSATION_RELAY_WS_URL= # derived

# LLM
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AI_GATEWAY_URL=                   # optional Vercel AI Gateway

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_SCALE=

# Email
RESEND_API_KEY=
EMAIL_FROM=hello@postaud.io

# Misc
WEBHOOK_SIGNING_SECRET=           # for outbound webhook HMAC
SENTRY_DSN=
```

Managed via `vercel env pull`. Never read env vars at module top level inside route handlers — use a typed `env.ts` that throws on missing required vars.

## 7. Non-functional requirements

- **Latency budgets:** DTMF→first-question ≤ 6s. Follow-up decision ≤ 800ms p95. Post-call output-ready ≤ 60s p95 for 5-min interview.
- **Availability target (MVP):** 99.5%. Twilio + Supabase + Vercel SLAs dominate.
- **Cost cap:** per-org per-day LLM spend cap (config, default $5). Hard block on exceed, email to ops.
- **Retention:** recordings 90d (org-configurable 7/30/90), transcripts indefinite (org-delete-able).
- **Data residency:** Supabase US region MVP. Document for future EU expansion.

## 8. Observability

- **Tracing:** OpenTelemetry via Sentry. Trace every session end-to-end (ingest webhook → relay → each job stage → webhook delivery).
- **Metrics:** per-stage success rate, p50/p95 latency, LLM tokens + cost per session, recipient drop-off point.
- **Logs:** structured JSON to Axiom/Logtail. No PII bodies — only IDs + redacted previews.
- **Dashboards:** "Interview funnel" (sent → opened → called → consented → completed → output-delivered) and "Cost per interview" (rolling 7d).

## 9. Error handling posture

- Never throw raw 500 to Twilio. Every webhook handler returns valid TwiML with a polite fallback message.
- Job pipeline: isolate each stage, retry with exponential backoff, surface last error into `output_jobs.error` + dashboard.
- Frontend: optimistic UI on sends, explicit error states on results page (never silent).

## 10. Security posture

- All write APIs require Supabase session + RLS re-check server-side.
- Twilio webhook signature verification on every Twilio route (reject on fail, log IP).
- Outbound webhook HMAC-SHA256 signature in `X-PostAudio-Signature` header using `WEBHOOK_SIGNING_SECRET`.
- SSRF guard: outbound webhook URLs validated against deny-list (localhost, 10.0.0.0/8, 127.0.0.0/8, 169.254.169.254, etc.).
- Rate limits via Upstash Redis (or Supabase edge): 25 SMS/day/org, 10 sends/min/user.
- Recording URLs are never returned directly — always via short-lived (15m) signed URL endpoint.

## 11. Testing strategy

- **Unit:** FSM transitions, done-detector, prompt schema validation, HMAC signing.
- **Integration:** full send-to-output run with Twilio test numbers + LLM mocked. At least one E2E run daily in CI against staging.
- **Manual QA checklist (pre-launch):** noisy-audio call, early hang-up, refusing consent, wrong DTMF code, caller-ID blocked, accent/speech variation, SMS rendering on iOS+Android.

## 12. Deployment

- Single Vercel project linked to main branch (production) and preview branches.
- Supabase migrations in `/supabase/migrations`. Apply via `supabase db push` from CI on merge.
- Twilio config managed by a one-shot script (`scripts/twilio-provision.ts`) that idempotently creates Messaging Service, number pool, voice webhooks.
- `vercel.ts` holds build config, cron entries (`/api/jobs/tick` every minute), and env-aware rewrites.
