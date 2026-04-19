# Password Auth + Super Admin Panel — Design

**Date:** 2026-04-19
**Status:** Approved for planning
**Scope:** Replace magic-link-only sign-in with email/password (magic link remains as fallback), add self-serve sign-up with email verification, and introduce a platform-level super admin panel at `/admin`.

---

## 1. Goals and non-goals

### Goals

- Let returning operators sign in with a password so they don't retrieve an email every time.
- Allow anyone to create a PostAud.io account via self-signup, gated behind email verification.
- Give Nick (and later Shawn) a hidden `/admin` panel to see all accounts, drill into one, adjust credits, and suspend accounts.
- Keep the super admin role tamper-proof and out of the database.

### Non-goals (deferred)

- Google / OAuth sign-in (deferred — may add later)
- Impersonation / "view as" (deferred — security weight not justified yet)
- Global stats dashboard (deferred — SQL views or external BI can cover this)
- Cross-account user search (deferred — redundant with account-detail view)
- Tenant-level admin UI for account owners managing team members (deferred — schema supports it, UI not needed until a customer has a team)
- Sub-users within an account (deferred — future)

---

## 2. Auth changes

### 2.1 Methods supported

| Method | Available at | Purpose |
|---|---|---|
| Email + password | `/sign-in`, `/sign-up` | Primary flow for returning users |
| Magic link | `/sign-in` (secondary action) | Fallback + account recovery |
| Password reset via email | `/auth/reset` | Standard recovery |

Both methods populate the same `auth.users` row. Supabase `signInWithPassword`, `signUp`, `signInWithOtp`, and `resetPasswordForEmail` are the underlying calls.

### 2.2 New routes

- `/sign-up` — client form (email + password), calls `supabase.auth.signUp({ email, password })`. Shows "check your inbox" state after submission.
- `/sign-in` — existing route, updated: password fields first, "Email me a link instead" link toggles to the magic-link form (existing behavior).
- `/auth/reset` — form that calls `resetPasswordForEmail`.
- `/auth/update-password` — form the user lands on after clicking the reset email; calls `supabase.auth.updateUser({ password })`.
- `/auth/verify` — landing page after a user clicks the email confirmation link; confirms success and routes to the app.
- `/auth/callback` — existing; unchanged.

### 2.3 Supabase configuration

- Enable "Confirm email" in Supabase Auth settings so unverified accounts can't sign in.
- JWT expiry: 30 days.
- Refresh token rotation: enabled.
- Email templates: keep defaults for now; customize copy in a later pass.

### 2.4 Self-signup behavior

- Open self-signup (anyone with an email can create an account).
- On signup: a new `auth.users` row is created by Supabase. A new DB trigger (added in this migration) on `auth.users` INSERT provisions a corresponding `accounts` row on the free tier (3 interviews/month) and an `account_members` row linking the new user as `owner`.
- User cannot sign in until they click the verification link. Supabase enforces this.

---

## 3. Super admin gate

### 3.1 How admin status is granted

- New env var `PLATFORM_ADMIN_EMAILS`, comma-separated list (e.g. `nick@pixelocity.com,shawn@example.com`).
- Set in Vercel for `production`, `preview`, and `development` environments.
- No database column, no `profiles` table. Admin status lives entirely in env.

### 3.2 Enforcement

Layer 1 — middleware (`src/proxy.ts`):

- Any request to `/admin/**` where the authenticated user's email is not in `PLATFORM_ADMIN_EMAILS` returns **404** (not 403 — do not reveal the panel exists).

Layer 2 — server components and server actions:

- Every file under `src/app/admin/` re-checks admin status server-side at the top of `page.tsx` or `actions.ts`. Middleware alone is not sufficient (middleware can be bypassed by subtle routing edge cases or skipped during local dev overrides).

Layer 3 — Supabase service-role client:

- Admin queries use the service-role Supabase client (which bypasses RLS — required for cross-account visibility). This client is never exposed to admin routes without the admin check passing.

### 3.3 The `is_platform_admin` helper

- `src/lib/auth/is-platform-admin.ts` exports a single async function.
- Reads the current session via server-side Supabase client, extracts email, parses `PLATFORM_ADMIN_EMAILS` (trim + lowercase each entry), returns boolean.
- This is the ONLY place the env var is read.

### 3.4 Audit logging

Every mutating admin action writes an `audit_logs` row with:

- `actor_email` — the admin's email
- `action` — e.g. `credit_adjustment`, `account_suspended`, `account_unsuspended`
- `target_account_id` — the account being affected
- `reason` — free-text input from the admin (required for credit changes)
- `metadata` — JSON blob with before/after values

Audit log rows written by platform admins are not tied to an `account_id`, only to `target_account_id`, because the admin is not a member of the target account.

---

## 4. Admin panel scope + routes

Mounted at `/admin`. Hidden from customer-facing navigation. Admin layout renders a separate shell with its own sidebar.

### 4.1 Routes in v1

| Route | Purpose |
|---|---|
| `/admin` | Redirects to `/admin/accounts` |
| `/admin/accounts` | Accounts list — search, sort, paginate |
| `/admin/accounts/[id]` | Account detail — members, interviews, calls, audit log tail, action buttons |
| `/admin/accounts/[id]/credits` | Credit adjustment form |
| `/admin/accounts/[id]/status` | Suspend / unsuspend toggle |

### 4.2 Accounts list

- Server-rendered table.
- Search: by account name or owner email.
- Sort: by created date, last-active timestamp, credits remaining.
- Columns: account name, owner email, plan, credits remaining, interviews this month, status (active/suspended), created date.
- Pagination: 50 per page.

### 4.3 Account detail

- Header: account name, owner email, plan, status, created.
- Sections:
  - Members (owner + any `account_members` rows)
  - Recent interview requests (last 25, newest first)
  - Recent calls (last 25)
  - Credit balance + recent `credit_ledger` entries
  - Audit log tail (last 25 rows with `target_account_id = this`)
- Action buttons: "Adjust credits" → `/credits`, "Suspend" / "Unsuspend" → `/status`.

### 4.4 Credit adjustment

- Form fields: delta (signed integer), reason (required, free text).
- On submit (server action):
  1. Re-check `is_platform_admin`.
  2. Insert `credit_ledger` row with `source = 'admin_adjustment'`, `memo = reason`, `delta = <input>`.
  3. Insert `audit_logs` row.
  4. Redirect back to account detail with flash message.

### 4.5 Status toggle

- Single button that flips `accounts.status` between `active` and `suspended`.
- Server action re-checks admin, updates the row, writes audit log.
- Suspended accounts: can still sign in and view their own data, but RLS policies block creation of new `interview_requests` (see §5).

---

## 5. Data model changes

### 5.1 New enum + column on `accounts`

```sql
create type account_status as enum ('active', 'suspended');

alter table accounts
  add column status account_status not null default 'active';
```

### 5.2 RLS policy updates

Any existing policy that permits INSERT on `interview_requests` gains:

```sql
and exists (
  select 1 from accounts
  where accounts.id = interview_requests.account_id
    and accounts.status = 'active'
)
```

READ policies are unchanged — suspended accounts can still see their own historical data.

### 5.3 `audit_logs.actor_email`

If not already present in the schema in `plan/03-schema.sql`, add:

```sql
alter table audit_logs
  add column actor_email text;
```

This column is populated for platform-admin actions (where no `account_id` membership exists for the actor).

### 5.4 Signup trigger

New trigger on `auth.users` AFTER INSERT that:

1. Creates an `accounts` row on the free tier.
2. Creates an `account_members` row with `role = 'owner'` linking the new user to the new account.

This replaces whatever manual account-provisioning assumption existed before (the plan predates actual signup flow).

### 5.5 Migration

All changes land in one Supabase migration file: `supabase/migrations/<timestamp>_admin_panel.sql`.

### 5.6 What is NOT added

- No `profiles` table
- No `is_platform_admin` column anywhere
- No `platform_admins` table

Platform admin status is env-only.

---

## 6. File structure

```
src/
├── app/
│   ├── sign-up/                        # NEW
│   │   ├── page.tsx
│   │   └── SignUpForm.tsx
│   ├── sign-in/
│   │   ├── page.tsx                    # updated
│   │   └── SignInForm.tsx              # updated: password-first, magic-link fallback
│   ├── auth/
│   │   ├── callback/route.ts           # existing
│   │   ├── verify/page.tsx             # NEW
│   │   ├── reset/page.tsx              # NEW
│   │   └── update-password/page.tsx    # NEW
│   └── admin/                          # NEW — all server components
│       ├── layout.tsx                  # checks is_platform_admin, renders admin shell
│       ├── page.tsx                    # redirect to /admin/accounts
│       └── accounts/
│           ├── page.tsx                # list
│           └── [id]/
│               ├── page.tsx            # detail
│               ├── credits/page.tsx
│               ├── status/page.tsx
│               └── actions.ts          # server actions: adjustCredits, setStatus
├── lib/
│   └── auth/
│       └── is-platform-admin.ts        # NEW — single source of truth
├── db/
│   └── queries/
│       └── admin.ts                    # NEW — uses service-role client
└── proxy.ts                            # updated: /admin/** gate returns 404 if not admin
```

### Component boundaries

- `is-platform-admin.ts` — the only place `PLATFORM_ADMIN_EMAILS` is read. Imported by middleware, admin layout, and every admin server action.
- `db/queries/admin.ts` — the only file that uses the Supabase service-role client for cross-account reads. Exports functions like `getAccountsList`, `getAccountDetail`, `getAccountAuditLog`.
- Admin server actions (`actions.ts` files) — thin wrappers that re-check admin status, call the query layer, write audit logs, revalidate paths.
- No client-side state library. Admin is read-heavy CRUD; server rendering is sufficient.

---

## 7. Testing approach

- Unit: `is-platform-admin.ts` — parses env list correctly (trim, lowercase, empty values, missing var).
- Integration: middleware returns 404 for non-admin email on `/admin/*`.
- Integration: server action rejects non-admin session.
- Integration: credit adjustment writes both `credit_ledger` and `audit_logs` rows.
- Integration: suspending an account blocks new `interview_requests` inserts via RLS.
- Integration: signup flow — unverified user cannot sign in; after verification they can.
- Manual smoke: sign up → verify email → sign in with password → forgot password → reset.

---

## 8. Open questions (none blocking)

None — all major decisions locked in during brainstorming.

---

## 9. Decision log

| # | Decision | Alternative | Why this was chosen |
|---|---|---|---|
| 1 | Password + magic link coexist | Password only | Magic link stays useful for account recovery and users who hate passwords |
| 2 | Self-signup with email verification | Invite-only | Friction blocks paid conversion; abuse can be addressed later if needed |
| 3 | Env-var allowlist for admin | `is_platform_admin` DB column | Tamper-proof (DB compromise can't grant admin), zero schema changes, trivial to implement |
| 4 | Admin v1 scope = list + detail + credits + suspend | Include impersonation, stats dashboard, user search | Keeps MVP small; other features can be added incrementally |
| 5 | No `profiles` table | Add one for admin flag + future user metadata | YAGNI; add when there's a real need beyond admin status |
| 6 | `/admin/**` returns 404 for non-admins | 403 | Don't reveal the panel exists |
| 7 | Defer Google OAuth | Add now | Nick explicitly said "might want to eventually add" |
| 8 | Defer team/sub-users UI | Include tenant-admin UI | No customer has a team yet; schema already supports it |
