# PostAud.io — Twilio Webhook Flow

## Twilio account setup (one-time per environment)

1. **Messaging Service** — create in Twilio console. Assign pool number(s). Set:
   - Inbound webhook: `POST https://postaud.io/api/webhooks/twilio/messaging/inbound`
   - Status callback: `POST https://postaud.io/api/webhooks/twilio/messaging/status`
2. **Voice number(s)** — add to shared pool `TWILIO_VOICE_POOL_NUMBERS`. Each number:
   - Voice webhook: `POST https://postaud.io/api/webhooks/twilio/voice/incoming`
   - Status callback: `POST https://postaud.io/api/webhooks/twilio/voice/status` (events: initiated, answered, completed)
3. **10DLC registration** — required for US SMS. Register brand + campaign (MVP: "PostAud Appointment & Content Interviews" campaign).
4. **ConversationRelay** — enable in Twilio console; grant LLM provider credentials per Twilio's flow (or use external LLM via our relay websocket).

## Full happy-path trace

```
Time  Actor                  Action
────  ─────────────────────  ─────────────────────────────────────────────────
T+0   Sender (browser)       POST /api/interview-requests
T+0   PostAud server         Insert interview_requests (token, dial_code=483926)
T+0   PostAud → Twilio       Messages.create({ to: +15555551212,
                                                from: messaging_service,
                                                body: "Hi Sarah... postaud.io/c/abc123" })
T+3   Twilio → Recipient     SMS delivered
T+3   Twilio → PostAud       POST /api/webhooks/twilio/messaging/status (delivered)
T+60  Recipient              Taps link → landing page loads
T+62  Recipient              Checks consent → POST /api/public/request/abc123/consent
T+63  Recipient              Taps "Call" → OS dials tel:+18885551234,,,483926
T+70  Twilio                 Inbound call to +18885551234 rings PostAud
T+70  Twilio → PostAud       POST /api/webhooks/twilio/voice/incoming
T+70  PostAud → Twilio       TwiML: <Gather numDigits=6 timeout=5 action=.../voice/match>
T+72  Phone dialer           Auto-sends DTMF "483926" after pauses
T+72  Twilio → PostAud       POST /api/webhooks/twilio/voice/match  (Digits=483926)
T+72  PostAud                Resolve dial_code → interview_requests row
                             Create interview_sessions row (status=active, caller_phone, call_sid)
T+72  PostAud → Twilio       TwiML: <Connect><ConversationRelay url=.../voice/relay?sid=...></>
T+73  Twilio                 Opens websocket to /api/voice/relay
T+73  PostAud WS             Sends greeting: "Hi Sarah, thanks for calling..."
T+75  PostAud WS             Captures verbal consent → sets consent_captured=true, source='both'
T+78  PostAud WS             Asks question 1; streams ASR; done-detects; emits call_events
...   (loop over questions, max 1 AI follow-up each)
T+320 PostAud WS             Says wrap-up line, closes WS
T+321 Twilio                 Ends call; writes recording
T+321 Twilio → PostAud       POST /api/webhooks/twilio/voice/status (completed)
T+322 Twilio → PostAud       POST /api/webhooks/twilio/voice/recording (RecordingSid, RecordingUrl)
T+322 PostAud                Downloads recording → uploads to Supabase Storage
                             Enqueues jobs: cleanup_transcript, extract_answers,
                             summarize, render_output, deliver_webhook, notify_email
T+325 Worker                 Runs each job sequentially (each idempotent)
T+350 Worker                 deliver_webhook → POST sender's URL w/ signed payload
T+350 Worker                 notify_email → Resend
T+351 UI                     Realtime channel updates dashboard (via Supabase Realtime)
```

## TwiML responses in detail

### `/voice/incoming` response (DTMF attempt, silent)

```xml
<Response>
  <Pause length="1"/>
  <Gather numDigits="6" timeout="5" action="/api/webhooks/twilio/voice/match" method="POST"/>
  <Say voice="Polly.Joanna-Neural">Welcome. I didn't catch your code. Please say or enter the six digit code from your text.</Say>
  <Gather input="speech dtmf" numDigits="6" speechTimeout="4" action="/api/webhooks/twilio/voice/match" method="POST"/>
  <Say>I'm sorry, I couldn't match you to an interview. Please tap the link in your text again.</Say>
  <Hangup/>
</Response>
```

### `/voice/match` logic

```
Input: Digits (or SpeechResult), From, CallSid
1. If Digits present AND matches active request.dial_code → matched=request
2. Else if From matches exactly one active request.contact.phone_e164 → matched=request (caller-ID fallback)
3. Else if SpeechResult parses to 6 digits AND matches → matched=request
4. Else → TwiML: <Say>I'm sorry...</Say><Hangup/>
5. On match:
   - UPSERT interview_sessions (request_id, twilio_call_sid=CallSid, caller_phone=From, status=active)
   - Record Start: Twilio Recording enabled via ConversationRelay config
   - Respond:
```

```xml
<Response>
  <Connect>
    <ConversationRelay
      url="wss://postaud.io/api/voice/relay?sid={sessionId}"
      voice="en-US-Neural2-F"
      welcomeGreeting="Hi {firstName}, thanks for calling. This call will be recorded so {senderName} can review your answers. Ready to start?"
      transcriptionProvider="google"
      recordingEnabled="true"
      recordingStatusCallback="/api/webhooks/twilio/voice/recording"
    />
  </Connect>
</Response>
```

### `/voice/status` handling

Updates `interview_sessions`:
- `CallStatus=completed` → set `ended_at`, `duration_sec=CallDuration`, flip status to `completed`/`partial` based on whether wrap-up was reached
- `CallStatus=no-answer|busy|failed|canceled` → mark session `failed`

### `/voice/recording` handling

```
1. Verify Twilio signature
2. Download RecordingUrl + ".mp3" using Twilio creds
3. Upload to Supabase Storage: recordings/{org}/{session}.mp3 (private bucket)
4. Update interview_sessions.recording_sid, recording_path
5. Insert jobs for the pipeline (all 6 stages)
```

## Security hardening

- **Signature verification:** every Twilio route verifies `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN` against the full signed URL + sorted form params. Reject 403 on fail and log IP.
- **Replay protection:** track `MessageSid`/`CallSid` with short-TTL Redis key; reject duplicates.
- **Idempotency:** match-route writes use `INSERT ... ON CONFLICT (twilio_call_sid) DO NOTHING` on sessions table.
- **SMS abuse:** enforce 25/day/org cap; Stripe card required before any send.
- **STOP handling:** inbound SMS body matching `STOP|UNSUBSCRIBE|CANCEL` sets `contacts.consent_status='revoked'` and blocks future sends to that number.

## Failure modes + recovery

| Scenario | Recovery |
|---|---|
| Recipient dials but DTMF missing (old phone, carrier strips it) | Fallback to caller-ID match → verbal code prompt |
| Recipient calls from different phone than we texted | Verbal code prompt resolves it |
| Call drops mid-interview | Session status=`partial`; still run pipeline against captured answers |
| ConversationRelay WS disconnects | Attempt 1 reconnect; if fails, close call cleanly, process what exists |
| Twilio recording webhook never arrives | 10-min watchdog job polls Twilio API for the recording |
| LLM call fails | Job retries ×3 with exp backoff; on exhaustion, `output_jobs.status=failed` with visible UI error |
| Sender webhook endpoint returns 5xx | Retries at 1m/5m/30m/2h/24h then `abandoned` |
