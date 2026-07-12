# postaud.io

postaud.io is a voice-first AI interviewer that builds a living knowledge base through
conversation. Every session — conducted by an AI voice agent ("Anna") over a browser call —
adds facts, people, places, and dates to a knowledge base owners can review, correct, and
export as Markdown at any time.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Supabase](https://supabase.com) — Postgres, Auth, Row Level Security, Storage
- OpenAI Realtime API — the voice interview engine
- Anthropic (Claude) — extraction/merge pipeline after each session
- [Resend](https://resend.com) — transactional email (invites)
- Deployed on [Vercel](https://vercel.com)

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values for local dev. In Vercel, set these
per-environment under Project Settings → Environment Variables.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | Base URL of the app (e.g. `http://localhost:3000` locally). |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role key — server-only, never exposed to the client. |
| `OPENAI_API_KEY` | yes | Powers the Realtime voice interview session. |
| `ANTHROPIC_API_KEY` | yes | Powers the post-interview extraction/merge pipeline. |
| `CRON_SECRET` | yes | Shared secret Vercel Cron sends to authorize the interview-processing tick route. |
| `RESEND_API_KEY` | optional | Sends invite emails; invites degrade gracefully without it. |
| `EMAIL_FROM` | yes | From-address used for all outbound email. |
| `PLATFORM_ADMIN_EMAILS` | yes | Comma-separated emails granted super-admin (platform operator) access. |

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test
```

Runs the Vitest suite (unit tests for the prompt builder, extraction/merge pipeline, and
supporting server logic).

## Database migrations

The Supabase CLI is not linked in this repo. Apply migrations via the Supabase MCP
(`apply_migration`) or directly through the Supabase dashboard's SQL editor — do not expect
`supabase migration up` or similar CLI commands to work locally.
