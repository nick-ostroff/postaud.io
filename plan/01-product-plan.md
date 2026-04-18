# PostAud.io — Product Plan (v2)

> Status: planning. No code yet. Updates from session 2026-04-18 folded in (DTMF routing, content/self-interview use case, dedicated-number policy).

## 1. Product overview

PostAud.io lets anyone send a text message that turns into a short AI-guided phone interview. The recipient taps a link, places a call, and an AI voice agent walks them through a pre-configured list of questions. When the call ends, PostAud.io delivers a recording, transcript, a clean summary, structured answers, and whatever downstream output the sender configured (blog draft, CRM note, webhook payload, email digest).

**Primary MVP use cases:**
1. Pre-appointment intake
2. Content interviews (external guests **or self-interview**)
3. Voice-of-customer / research
4. Family memory capture

**Target users:** solo founders, small-agency owners, coaches/consultants, content marketers, researchers.

**MVP vs later:**
- **MVP:** single template per request, SMS invite, inbound AI call, transcript + summary + one webhook output, Stripe billing, single-user workspace.
- **Later:** teams, multi-template libraries, scheduled follow-ups, Zapier/Make/HubSpot/Notion/Airtable/Slack integrations, branded/dedicated numbers, multi-language, outbound dialing, SIP, white-label.

## 2. Core use cases

**A. Pre-appointment intake**
Business owner → template → send to lead → 3-min AI call → owner gets CRM note + summary within 60s of hang-up. Replaces low-response typed intake forms with a voice interaction.

**B. Content interview → blog draft (external guest or self)**
Example: Rally Leagues sends a "Coach Spotlight" template to five pro pickleball coaches. Each gets a text, taps the link, runs through 5 questions, and PostAud returns one blog draft per coach. **Self-interview variant:** sender lists themselves as the recipient — dumps a voice memo through the same pipeline and gets a blog draft back. Ship "Interview yourself" as a featured onboarding template.

**C. Customer / expert insight**
Founder sends the same 3 questions to 20 users, gets per-call summaries. Cross-session aggregation is Phase 6.

**D. Family memory capture**
Keepsake-format story output, gentle AI tone, high-fidelity recording retention.

## 3. User roles

| Role | Scope | Can do |
|---|---|---|
| Account Owner | Workspace owner, billing | Everything |
| Team Member | Invited user | Templates, sends, results. No billing |
| Sender | Team Member in send mode | Same as Team Member; audit-tracked |
| Recipient | No account | Single tokenized landing page → call |
| System Admin | PostAud staff | Back-office ops, audited impersonation |

**MVP simplification:** collapse Account Owner + Team Member into single owner role. Real roles ship Phase 6.

## 4. UX design

### Sender
1. Sign up (Supabase Auth, email + Google)
2. Template builder — title, intro, questions (reorder), per-question hints, output type, webhook URL
3. Send invite — paste contact or CSV (≤25), preview SMS, send
4. Results — status timeline, recording, transcript, Q&A, summary, output, webhook delivery log

### Recipient
1. **SMS** — short, named, one tap: `postaud.io/c/abc123`
2. **Landing page** — first name, what to expect, consent checkbox, giant **Tap to Call** button
3. **Call** — AI greets by name, confirms recording, runs questions, wraps up
4. **End** — "copy of your responses" SMS (optional)

**Frictionless principles:** no recipient account, no app, no mic permission, single tap → first question < 15s.

## 5. Call flow design

### Updated routing (DTMF code embedded in `tel:` link)

The landing page's Tap-to-Call button uses a `tel:` URI with auto-dialed DTMF:

```
tel:+18885551234,,,483926
```

Commas are pauses, digits are auto-dialed as DTMF after pickup. Recipient sees no code, hears no code. Twilio `<Gather>` on pickup captures the 6 digits and resolves to the right `interview_request`.

### Flow steps

1. **Inbound call** → Twilio voice webhook → TwiML `<Gather numDigits=6 timeout=4>` prompting nothing (silent, DTMF auto-fires).
2. **Match by DTMF code** against active `interview_requests.dial_code`. If no DTMF received, try caller-ID match. If ambiguous or both fail, AI asks verbally: "Please say or enter your 6-digit code."
3. **Greeting + consent** — "Hi Sarah, thanks for calling. This call will be recorded so Nick can review your answers. Ready to start?" Explicit verbal yes captured.
4. **Per-question loop** — TTS question → listen → done-detection:
   - 2.0s silence → soft prompt "Anything else?" → 1.5s more silence → advance
   - Keywords: "next", "that's it", "I'm done", "move on"
   - Hard cap: 90s unless question flagged long-form
5. **Light follow-up** — if answer coverage scores low AND question allows follow-ups AND none asked yet → one AI-generated clarifier, max 18 words. Hard cap 1 per question.
6. **Wrap-up** — "That's everything. I'll send these to Nick now."
7. **Failure handling** — 15s no-speech on a question → skip with flag. Mid-call hang-up → mark `partial`, still process. Connection loss → one reconnect attempt to caller-ID.
8. **Retry** — 24h no completed call → one reminder SMS. One only.

### Design decision: rigid vs dynamic

**MVP = rigid question order + max 1 AI-generated follow-up per question.** Predictable, debuggable, still feels human. Fully dynamic is Phase 6.

### Voice infrastructure

**Twilio ConversationRelay** over Media Streams. Twilio handles TTS/STT/barge-in. Fallback plan: Media Streams + OpenAI Realtime if we hit ceilings.

## 6. Technical architecture

```
┌────────────────────────── Next.js on Vercel ──────────────────────────┐
│ /           marketing   /app      sender dashboard                    │
│ /c/[token]  recipient   /api/*    API routes (Fluid Compute)          │
└─────────────┬───────────────────────────────────────────┬─────────────┘
              │                                           │
              ▼                                           ▼
     ┌────────────────┐                        ┌─────────────────────┐
     │   Supabase     │                        │       Twilio        │
     │ Postgres + RLS │                        │ Number pool + SMS   │
     │ Auth           │                        │ Voice + Conversa-   │
     │ Storage        │                        │ tionRelay + Record  │
     │ pg_cron        │                        └─────────┬───────────┘
     └────────────────┘                                  │ websocket
              ▲                                          ▼
              │                               ┌─────────────────────┐
              │                               │ /api/voice/relay    │
              │                               │ Interview state FSM │
              │                               │ + LLM follow-ups    │
              │                               └─────────┬───────────┘
              │                                         │
              │          post-call jobs (queue)         ▼
              └────────── clean → extract → summarize → render → webhook
                                                        │
                                                        ▼
                                              OpenAI / Anthropic APIs
```

## 7. Database schema (updated)

Postgres + RLS. All tenant tables carry `organization_id`.

| Table | Key fields (changes **bold**) |
|---|---|
| `organizations` | id, name, plan, stripe_customer_id, created_at |
| `users` | id, email, display_name |
| `memberships` | user_id, organization_id, role |
| `contacts` | id, organization_id, phone_e164, first_name, last_name, email, consent_status |
| `interview_templates` | id, organization_id, name, intro_message, output_type, webhook_url, version, is_active |
| `template_questions` | id, template_id, position, prompt, hint, allow_followup, max_seconds, required |
| `interview_requests` | id, organization_id, template_id, template_snapshot(jsonb), contact_id, sender_user_id, token, **dial_code (6-digit, unique among active)**, **phone_assigned (nullable, for future dedicated-number upgrade)**, status, sent_at, completed_at, expires_at |
| `interview_sessions` | id, request_id, twilio_call_sid, started_at, ended_at, duration_sec, status, caller_phone, recording_sid, recording_url, consent_captured |
| `call_events` | id, session_id, at, event_type, question_id, payload(jsonb) |
| `transcripts` | id, session_id, raw(jsonb), cleaned_text, model, completed_at |
| `extracted_answers` | id, session_id, question_id, answer_text, confidence, followup_text |
| `summaries` | id, session_id, short, long, bullets(jsonb), model, prompt_version |
| `output_jobs` | id, session_id, output_type, status, payload(jsonb), rendered_text, error, attempts |
| `webhook_deliveries` | id, session_id, output_job_id, url, request_body, response_status, response_body, attempted_at |
| `audit_logs` | id, organization_id, actor_user_id, action, target_type, target_id, ip, at, meta |

**Non-negotiable:** `interview_requests.template_snapshot` is frozen at send time — never dereference live template after sending.

## 8. AI design

Deterministic: session state, silence detection, retries, webhook dispatch, schema validation. Never let LLM decide "call is over."

AI earns its keep at:
1. Transcript cleanup — fast/cheap model
2. Per-question extraction — JSON schema, retry once on parse fail
3. In-call follow-up generation — latency-critical, max 18 words
4. Whole-interview summary — short + long + bullets
5. Output rendering (blog, CRM note) — higher temperature
6. Webhook `ai_insights` optional field

Prompt rules: version every prompt, one job per prompt, JSON mode w/ schema, explicit question intent, temp 0.2 for extraction, 0.7 for content.

## 9. Output types

MVP: `transcript.plain`, `summary.concise`, `qa.structured`, `blog.draft`, `crm.note`, `webhook.json`. One output type per template in V1. Multi-output is Phase 6.

## 10. Automation strategy

**MVP:** outbound webhook (HMAC, retry 1m/5m/30m/2h, 24h TTL), email notification (Resend), internal results page.
**Phase 6+ (in priority order):** Zapier → Make → HubSpot → Slack → Notion → Google Docs → Airtable. Don't build natives until Zapier tells you which ones matter.

## 11. Security / privacy / compliance

- Explicit verbal + written consent captured; refuse to process without it
- E.164 phone storage, hashed for analytics, last-4 only in sender UI
- RLS on every tenant table; private Storage bucket, 15-min signed URLs
- Audit log for sends, deletes, logins, admin impersonation
- Default 90-day recording retention; one-click session delete; org-level export/delete (DSR)
- HMAC webhooks; SSRF guard (no localhost/private IPs)
- Rate limits: 25 SMS/day/org MVP; Stripe card required to send
- 10DLC / TCPA: brand name + opt-out in every SMS; only text numbers with implied consent

## 12. Pricing & cost model

**Per-interview variable cost (5-min call): ~$0.35–0.75.** Fixed: ~$1/mo per Twilio number + ~$40/mo base infra.

**MVP pricing:** monthly plan with credits (e.g. $29/20, $99/100, $299/400) + free tier of 3 interviews/mo. Per-interview buckets Phase 2. Business/team tier at 20+ paying customers.

## 13. MVP definition

**Must-have:** email+Google auth, single-user workspace, template builder (≤10 questions), single-recipient send, landing page + tap-to-call, inbound AI interview (rigid + 1 follow-up), recording + transcript + extraction + summary, 1 output type per template, 1 outbound webhook per template, results dashboard, Stripe billing, consent + retention.

**Nice-to-have:** CSV bulk (≤25), 24h reminder SMS, email output copy.

**Deferred:** teams, multi-output, native integrations, scheduling, recurring, multi-language, outbound dialing, cross-session analytics, dedicated numbers, mobile app.

## 14. Build roadmap

- **Phase 1 — Planning + schema** (3–5 days)
- **Phase 2 — Sender dashboard + template builder** (1–1.5 wk)
- **Phase 3 — Twilio call flow + session capture** (1.5–2 wk)
- **Phase 4 — Transcript processing + summaries** (1 wk)
- **Phase 5 — Output generation + webhooks** (4–5 days)
- **Phase 6 — Polish, billing, launch** (1 wk)

**Target: 6 weeks with AI-assisted coding, one committed builder.**

## 15. Engineering decisions (updated)

1. Direct-dial `tel:` (not browser mic) — ✅ decided
2. AI follow-ups capped at 1/question — ✅ decided
3. Async output generation — ✅ decided
4. Fixed template snapshot per request — ✅ decided, non-negotiable
5. Landing page always shown — ✅ decided
6. **Recipient→interview matching: layered.** Primary = **DTMF code auto-dialed from `tel:,,,NNNNNN` link**. Secondary = caller-ID match against active requests. Tertiary = AI asks for code verbally. ✅ decided
7. **Phone number strategy: shared pool in MVP, one pooled number for everyone.** Dedicated per-business number is a Phase 6 paid upgrade (branded caller-ID). Routing works regardless because the DTMF code is per-request, not per-number. ✅ decided
8. Twilio ConversationRelay over Media Streams — ✅ decided
9. 90-day recording retention default — ✅ decided
10. Single output type per template in MVP — ✅ decided

## 16. Brand positioning

- **Positioning:** PostAud.io turns a text message into an AI-guided phone interview, so you get voice-quality answers without scheduling anything.
- **Headline:** *Interviews, without the interview.*
- **Sub:** Send a text, get a transcript, a summary, and the exact output you need — from a 3-minute AI-guided phone call your recipient takes whenever they want.
- **Bullets:** Text to transcript in minutes · AI that listens and follows up · Goes where your work already lives.

---

## Recommended stack

Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui · Vercel (Fluid Compute) · Supabase (Auth + Postgres + Storage + RLS) · Twilio (Numbers + Messaging + Voice + ConversationRelay) · OpenAI `gpt-4o-mini` + Anthropic Claude Sonnet (provider-abstracted) · Vercel Queues or `pg_cron` + Edge Functions · Stripe · Resend · Sentry + Axiom · `vercel.ts` for config.

## Top risks

Twilio ConversationRelay latency / quotas · awkward AI follow-ups · mid-call hang-up data handling · noisy-audio ASR · LLM cost creep · 10DLC SMS delays · TCPA slip-ups · webhook shape churn · template-edit leakage · abuse (cold-texting strangers).
