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
- On signup: a new `auth.users` row is created by Supabase. After email verification, the user is redirected to `/auth/callback`, which calls the existing `ensureViewerBootstrapped()` helper — this creates the `users` mirror row, an `organizations` row on the free tier, and a `memberships` row with `role = 'owner'`. Password signup piggybacks on the same callback path as magic link, so no new bootstrap logic is needed.
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

- `src/lib/auth/is-platform-admin.ts` exports two async helpers: `isPlatformAdmin(): Promise<boolean>` and `platformAdminEmail(): Promise<string | null>` (the latter returns the lowercased email for audit logging).
- Reads the current session via server-side Supabase client, extracts email, compares against the parsed list from `platformAdminEmails()` in `src/lib/env.ts`.
- This is the canonical place the env var is consumed. One exception: `src/proxy.ts` (middleware) parses `process.env.PLATFORM_ADMIN_EMAILS` inline because middleware can't carry the Zod runtime; an inline comment in `proxy.ts` flags the duplication so the two are kept in sync.

### 3.4 Audit logging

Every mutating admin action writes an `audit_logs` row with:

- `actor_email` — the admin's email
- `action` — e.g. `credit_adjustment`, `account_suspended`, `account_unsuspended`
- `target_organization_id` — the account being affected
- `reason` — free-text input from the admin (required for credit changes)
- `metadata` — JSON blob with before/after values

Audit log rows written by platform admins are not tied to an `account_id`, only to `target_organization_id`, because the admin is not a member of the target account.

---

## 4. Admin panel scope + routes

Mounted at `/admin`. Hidden from customer-facing navigation. Admin layout renders a separate shell with its own sidebar.

### 4.1 Routes in v1

| Route | Purpose |
|---|---|
| `/admin` | Redirects to `/admin/accounts` |
| `/admin/accounts` | Accounts list — search, sort, paginate |
| `/admin/accounts/[id]` | Account detail — members, interviews, audit log tail, suspend/unsuspend button (inline form), "Adjust credits" link |
| `/admin/accounts/[id]/credits` | Credit adjustment form |

### 4.2 Accounts list

- Server-rendered table.
- Search: by account name or owner email.
- Sort: by created date, last-active timestamp, credits remaining.
- Columns: account name, owner email, plan, credits remaining, interviews this month, status (active/suspended), created date.
- Pagination: 50 per page.

### 4.3 Account detail

- Header: account name, owner email, plan, status, created.
- Sections:
  - Members (owner + any `memberships` rows)
  - Recent interview requests (last 25, newest first)
  - Recent calls (last 25)
  - Credit balance (current `credits_remaining` on `organizations`)
  - Audit log tail (last 25 rows where `organization_id = this` OR `target_id = this`)
- Action buttons: "Adjust credits" → navigates to `/credits`; "Suspend" / "Unsuspend" → inline server-action form on the detail page itself (no separate route).

### 4.4 Credit adjustment

- Form fields: delta (signed integer — `Number.isInteger` enforced server-side), reason (required, trimmed, `length >= 3`).
- On submit (server action):
  1. Re-check `platformAdminEmail()`.
  2. Fetch current `credits_remaining`.
  3. Update `organizations.credits_remaining = before + delta`.
  4. Insert `audit_logs` row with `action = 'credit_adjustment'`, `actor_email`, `meta = { delta, reason, before, after }`.
  5. `revalidatePath` + `redirect` back to account detail.

Note: there is no `credit_ledger` table — the `audit_logs.meta` JSON is the ledger for MVP. Add a dedicated ledger if credit accounting needs richer queries.

### 4.5 Status toggle

- Single button on the account-detail page (inline server-action form) that flips `organizations.status` between `active` and `suspended`.
- Server action re-checks admin, updates the row, writes audit log.
- Suspended accounts: can still sign in and view their own data, but RLS policies block creation of new `interview_requests` (see §5).

---

## 5. Data model changes

### 5.1 New enum + column on `organizations`

```sql
create type org_status as enum ('active', 'suspended');

alter table organizations
  add column status org_status not null default 'active';
```

### 5.2 RLS policy updates

The existing `"org rw"` policy on `interview_requests` permits all operations where `organization_id = current_org_id()`. That policy is dropped and replaced with separate SELECT and INSERT/UPDATE/DELETE policies — the write policies additionally require the org to be active:

```sql
drop policy "org rw" on interview_requests;

create policy "org read" on interview_requests
  for select using (organization_id = current_org_id());

create policy "org write" on interview_requests
  for insert with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org update" on interview_requests
  for update using (organization_id = current_org_id())
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org delete" on interview_requests
  for delete using (organization_id = current_org_id());
```

Read and delete paths are unchanged in effect — suspended orgs can still view and clean up their own data. Only create/update of interview_requests is blocked.

### 5.3 `audit_logs.actor_email`

The existing `audit_logs` table (from `0001_init.sql`) has `actor_user_id uuid` but no email column. Add:

```sql
alter table audit_logs
  add column actor_email text;
```

This column is populated for platform-admin actions (where no membership links the admin to the target organization).

### 5.4 Signup bootstrap

No DB trigger needed — the existing `ensureViewerBootstrapped()` helper (in `src/db/queries.ts`) is already called from `/auth/callback` after code exchange. It creates `users`, `organizations`, and `memberships` rows via the service-role client. Password signup flows through the same callback after email verification, so this works unchanged.

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
- Integration: credit adjustment updates `organizations.credits_remaining` and writes an `audit_logs` row capturing `{ delta, reason, before, after }` in meta.
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
