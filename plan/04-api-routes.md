# PostAud.io — API Routes (MVP)

All routes are Next.js App Router Route Handlers on Vercel Fluid Compute unless noted. Auth = Supabase session unless marked otherwise.

## Conventions

- JSON in, JSON out except TwiML/webhook endpoints.
- Server re-checks `organization_id` ownership on every mutation (belt + suspenders beyond RLS).
- Mutations are idempotent where keys make sense (use `Idempotency-Key` header on `POST`s that trigger side effects).
- Errors: `{ error: { code, message, details? } }` with proper HTTP status.

## 1. Auth

Handled by Supabase Auth UI. No custom routes. After sign-in, client calls:

- `POST /api/me/bootstrap` — idempotent. Creates `users` row + default `organizations` row + `memberships` row if missing. Returns `{ user, organization }`.

## 2. Templates

- `GET  /api/templates` — list for current org
- `POST /api/templates` — create. Body: `{ name, intro_message, sms_body, output_type, webhook_url?, questions: [{prompt, hint?, allow_followup?, max_seconds?, required?}] }`. Server assigns positions.
- `GET  /api/templates/:id` — fetch with questions
- `PATCH /api/templates/:id` — partial update. Bumps `version` on any question change.
- `DELETE /api/templates/:id` — soft-delete (`is_active=false`). 409 if any `interview_requests` are still active.
- `POST /api/templates/:id/duplicate` — clone into same org

## 3. Contacts

- `GET  /api/contacts?search=` — list
- `POST /api/contacts` — create. Body: `{ phone_e164, first_name?, last_name?, email? }`. Dedupe on `(org, phone_e164)`.
- `PATCH /api/contacts/:id`
- `DELETE /api/contacts/:id` — 409 if referenced by active requests

## 4. Interview requests (sends)

- `GET  /api/interview-requests?status=` — list
- `POST /api/interview-requests` — send one. Body: `{ template_id, contact_id }`.
  Server:
  1. Verifies credits remaining
  2. Creates `interview_requests` row with fresh `token` + `dial_code` + `template_snapshot`
  3. Decrements `organizations.credits_remaining` (soft-hold)
  4. Dispatches SMS via Twilio Messaging Service
  5. Returns `{ id, token, dial_code (masked), sms_status }`
- `POST /api/interview-requests/bulk` — up to 25 rows. Body: `{ template_id, contacts: [{phone_e164, first_name?}] }`.
- `GET  /api/interview-requests/:id` — detail incl. sessions list
- `POST /api/interview-requests/:id/resend` — re-sends SMS (rate-limited to once per 24h)
- `DELETE /api/interview-requests/:id` — cancels (if not yet called); restores credit

## 5. Sessions / results

- `GET  /api/sessions/:id` — full session detail (transcript, answers, summary, output)
- `GET  /api/sessions/:id/recording` — 302 to short-lived signed URL (15-min TTL)
- `DELETE /api/sessions/:id` — deletes recording + transcript + derived artifacts; retains the row with `status='deleted'` for audit
- `GET  /api/sessions/:id/output` — fetches rendered output text for current output_type

## 6. Public recipient routes (no auth)

- `GET  /c/[token]` — Next.js page (not API). Server component resolves token.
- `GET  /api/public/request/:token` — server data for landing page: `{ firstName, senderName, templateTitle, estMinutes, pooledNumber, dialCode, already_completed: boolean }`. Rate-limited per IP.
- `POST /api/public/request/:token/consent` — body `{ accepted: true }`. Creates/updates `interview_sessions` with `consent_source='written'` (actual session starts when call connects; this is the written-consent receipt).

## 7. Twilio webhooks (public, signature-verified)

All require `X-Twilio-Signature` verification. Return 403 on failure. Body is form-urlencoded per Twilio spec.

- `POST /api/webhooks/twilio/messaging/status` — SMS delivery status updates → updates `interview_requests.status` if terminal
- `POST /api/webhooks/twilio/messaging/inbound` — handles replies (STOP, HELP). MVP: log + respect STOP.
- `POST /api/webhooks/twilio/voice/incoming` — returns initial TwiML `<Gather>` for DTMF code
- `POST /api/webhooks/twilio/voice/match` — receives digits (or speech), resolves to request, responds with `<Connect><ConversationRelay>`
- `POST /api/webhooks/twilio/voice/status` — call lifecycle events; finalize `interview_sessions.ended_at/status`
- `POST /api/webhooks/twilio/voice/recording` — recording completed; uploads to Supabase Storage, enqueues pipeline jobs

## 8. Voice relay (WebSocket)

- `WS /api/voice/relay?sid=:sessionId` — ConversationRelay connection. Runs the interview FSM. Not a standard Route Handler — uses `export const runtime = 'nodejs'` with websocket upgrade via Vercel's support, or a dedicated WS endpoint hosted at a stable path. See Twilio ConversationRelay docs for handshake format.

## 9. Jobs

- `POST /api/jobs/tick` — invoked by Vercel Cron every minute. Pulls up to N ready jobs from `jobs` table and dispatches to `/api/jobs/run`.
- `POST /api/jobs/run` — internal (HMAC-protected with `WEBHOOK_SIGNING_SECRET`); executes a single job. Stages: `cleanup_transcript`, `extract_answers`, `summarize`, `render_output`, `deliver_webhook`, `notify_email`.
- Both routes are service-role only.

## 10. Integrations

- `POST /api/integrations/webhook/test` — sender tool: fires a test payload at their webhook_url to verify signature + reachability
- `GET  /api/integrations/webhook/deliveries?session_id=` — delivery log

## 11. Billing (Stripe)

- `POST /api/billing/checkout` — creates a Stripe Checkout session for a chosen plan
- `POST /api/billing/portal` — returns Stripe billing portal URL
- `POST /api/webhooks/stripe` — verifies signature; handles `checkout.session.completed`, `customer.subscription.*`, `invoice.*`. Updates `organizations.plan` + tops up `credits_remaining` per plan.
- `GET  /api/billing/usage` — returns current credit balance, plan, rolling 30d usage

## 12. Admin (role: system_admin)

- `GET  /api/admin/orgs` — list all orgs, paginated
- `GET  /api/admin/orgs/:id/usage` — aggregated usage
- `POST /api/admin/impersonate` — generates scoped session; **audit-logged**
- `POST /api/admin/abuse/review` — mark org as suspended, disables sends

## 13. Health

- `GET  /api/health` — liveness
- `GET  /api/health/deps` — checks Supabase, Twilio API, OpenAI, Anthropic, Stripe, Resend reachability

## Response shapes (selected)

**`GET /api/sessions/:id`**
```json
{
  "id": "uuid",
  "request": { "id": "...", "template_title": "...", "contact": { "first_name": "Sarah" } },
  "status": "completed",
  "recording_available": true,
  "duration_sec": 287,
  "transcript": { "cleaned_text": "..." },
  "answers": [
    { "question_id": "...", "prompt": "...", "answer_text": "...", "confidence": 0.92 }
  ],
  "summary": { "short": "...", "long": "...", "bullets": [ "..." ] },
  "output": { "type": "blog.draft", "rendered_text": "...", "status": "succeeded" },
  "webhook_deliveries": [
    { "url": "...", "status": "succeeded", "response_status": 200, "attempted_at": "..." }
  ]
}
```

**Outbound webhook payload** (`webhook.json` output, delivered to sender's URL):
```json
{
  "event": "interview.completed",
  "session_id": "uuid",
  "request_id": "uuid",
  "template": { "id": "uuid", "name": "Coach Spotlight", "version": 1 },
  "contact": { "first_name": "Sarah", "phone_last4": "1234" },
  "started_at": "...", "ended_at": "...", "duration_sec": 287,
  "summary": { "short": "...", "long": "...", "bullets": ["..."] },
  "answers": [ { "prompt": "...", "answer": "...", "followup": null } ],
  "recording_url": "https://...signed...",
  "transcript_text": "...",
  "ai_insights": null
}
```
Signed via `X-PostAudio-Signature: t=<ts>,v1=<hex>` where `v1 = HMAC_SHA256(secret, ts + "." + raw_body)`.
