# Super-admin console at `/super` — design

Date: 2026-07-12
Status: approved, ready for plan

## Problem

The operator console shipped in V1 is incomplete against what a super admin
actually needs:

1. **No entry point.** `/admin` is reachable only by typing the URL. Nothing in
   the app links to it.
2. **No user list.** The console lists *organizations*, one row per account.
   There is no way to see every person on the platform, or to reach a member who
   isn't an org owner.
3. **Impersonation is a stub.** `POST /api/admin/impersonation-request` writes an
   `audit_logs` row and returns `{ note: "audit trail only in V1" }`. It does not
   log the operator in as anyone. The account-detail UI nonetheless renders an
   "⚿ Impersonate (audited)" button and the caption *"every impersonation is
   logged & visible to the account owner"* — promising two things the product
   does not do.

## Goals

- A super admin can see every user on the platform and drill into any one of them.
- A super admin can genuinely log in as any user, and get back out.
- The console is one click from the app, for admins only, and invisible to
  everyone else.

## Non-goals

- Owner-facing visibility of impersonation sessions (audit rows only; the
  misleading UI copy gets corrected rather than made true).
- Guardrails on what an operator may do while impersonating. Explicitly declined:
  the operator has full user powers.
- Suspend/unsuspend (still a disabled button — out of scope, unchanged).
- Any change to how super-admin status is granted. `PLATFORM_ADMIN_EMAILS`
  remains the single source of truth; there is no DB column and no admin UI for
  granting admin.

## Access model

Unchanged: a user is a super admin iff their email appears in the
`PLATFORM_ADMIN_EMAILS` env list. Enforced in three places, all of which move
from the `/admin` prefix to `/super`:

| Layer | File | Behavior |
| --- | --- | --- |
| Middleware | `src/proxy.ts` | `startsWith("/super")` → 404 (not 403, not a redirect) for non-admins, so the console's existence is never disclosed. |
| Layout | `src/app/super/layout.tsx` | Defense-in-depth `isPlatformAdmin()` → `notFound()`. |
| API routes | `src/app/api/super/**` | Each route re-checks `platformAdminEmail()` and 404s. |

`/admin` ceases to exist — no redirect. A redirect would leak the new path to
anyone probing the old one, and the prefix already 404s for non-admins today, so
removing it is a strict improvement.

**Important interaction with impersonation:** while impersonating, the operator's
session *is* the target user's session, so `isPlatformAdmin()` returns false. All
`/super` routes 404 and the sidebar link disappears — automatically, with no
special-casing. Exiting impersonation restores admin status. The exit route is
therefore the one API endpoint that must NOT require admin (see below).

## Information architecture

Operator chrome (`AdminShell`, dark `#211E1A` header) is retained as-is, renamed
`SuperShell`. Nav becomes: **Users · Accounts · Series**.

| Route | Content |
| --- | --- |
| `/super` | **Users** — every person on the platform. Platform stat tiles on top. |
| `/super/users/[id]` | User detail + Impersonate. |
| `/super/accounts` | The existing accounts/org table, moved verbatim from `/admin`. |
| `/super/accounts/[id]` | The existing org detail, moved verbatim. Credits sub-page moves with it. |
| `/super/series` | The existing series registry, moved verbatim. |

`/super` owns every operator capability. `/app` remains purely the customer
product, with exactly one admin-only link out to `/super`. No operator
affordances are sprinkled into `/app` screens.

### Users list (`/super`)

New query `listPlatformUsers({ search, limit, offset })` in
`src/db/queries/admin.ts`, service-role, metadata only — consistent with the
existing "never select `facts.statement`, `interview_messages.text`,
`interview_summaries.*`" invariant that file already documents and upholds.

Columns, per user:

- Display name + email (`users.display_name`, `users.email`)
- Organizations they belong to, with role, and whether the membership is accepted
- Count of series they are the *subject* of
- Last activity (most recent `interviews.started_at` in any org they belong to)
- Signed-up date (`users.created_at`)
- **Impersonate** action

Search matches display name or email. Reuses the existing in-memory
filter/sort/paginate approach in `listAccountsConsole` — this is a
platform-admin page, not a hot path, and consistency with the neighboring query
matters more than a SQL-side optimization.

### User detail (`/super/users/[id]`)

New query `getPlatformUserDetail(userId)`:

- Profile: display name, email, user id, created_at
- Memberships: org name (linking to `/super/accounts/[orgId]`), role, accepted state
- Series they own, and series they are the subject of (titles + counts only)
- Interview count, fact count
- Audit entries where they are actor or target
- Impersonate button

## Look & feel

Source of truth is `Postaudio Superadmin.dc.html` in the repo root (also shared at
`claude.ai/design/p/f5fdf024-…`). It specifies three screens — accounts list,
account detail, series registry — and the current `/admin` code already implements
all three faithfully: `.op-head` → the dark `#211E1A` operator header, `.pills` →
the status filter row, `.badge-amber` → the dormant/stale badges, `.locked-card` →
the "transcripts are hidden" panel, `.btn-impersonate` → the green-bordered
impersonate button. Moving these to `/super` is a file move; the visuals do not
change.

The two new screens — **users list** and **user detail** — are not in the mockup.
They extend the same vocabulary rather than introducing a new one:

- Users list reuses the exact table + stat-tile + pills + search composition of
  the accounts list, so the two tabs read as siblings.
- User detail reuses the account-detail two-column grid (`.detail-grid`), the
  avatar + `.meta-row` chip header, and the `.card` panels.
- Impersonate uses `.btn-impersonate` verbatim — green border, card background,
  `⚿` glyph — on both the user row and the user detail header.
- The impersonation banner uses the mockup's amber (`.badge-amber`) family, the
  one warning color already in the system.

## Impersonation

Deletes `src/app/api/admin/impersonation-request/route.ts` and the stub
`ImpersonateButton`. Replaced by a real session swap.

### Start — `POST /api/super/impersonate` (admin-gated)

1. Verify caller via `platformAdminEmail()`; 404 if not an admin.
2. Look up the target user's email from `users` by id.
3. Service-role `auth.admin.generateLink({ type: 'magiclink', email })`. This
   mints a token and **does not send an email**. Take `properties.hashed_token`.
4. **Stash the admin's current session cookies verbatim** into `pa_op_prev`
   before overwriting them (see "Cookie stash" below).
5. Write `pa_op_imp` — a small JSON cookie recording
   `{ adminEmail, targetUserId, targetEmail, startedAt }`.
6. `verifyOtp({ type: 'magiclink', token_hash })` on a cookie-writing server
   client. This overwrites the browser's Supabase auth cookies with a real
   session for the target user.
7. Insert `audit_logs` row: `action: 'admin.impersonation_started'`,
   `actor_email` = admin, `target_type: 'user'`, `target_id` = target user id,
   `organization_id` = the target's primary org (nullable),
   `meta: { targetEmail }`.
8. Redirect to `/app`.

Generating a magic-link token does not invalidate the target user's existing
sessions — they stay logged in and are not emailed.

### During

The operator *is* the user: full powers, no guardrails, no write blocking. This
was an explicit decision — the banner and the audit log are the safety net.

An **amber top bar** renders above the app chrome on every `/app` page:

> ⚠ Operator session — you are viewing as **jane@example.com**. [Exit →]

It is a full-width strip that pushes the page down, not a floating overlay, so it
can never obscure content and is impossible to overlook. Rendered server-side in
`src/app/app/layout.tsx` by reading `pa_op_imp`. A forged `pa_op_imp` cookie can
only make the banner appear — it grants nothing — so it needs no signature.

Impersonation sessions are capped at **60 minutes** (`startedAt` + 60min). Past
that, the banner renders in an expired state and the exit route is the only
meaningful action; this keeps the stashed refresh token from going stale (see
failure mode below).

### Exit — `POST /api/super/impersonate/exit`

**Not admin-gated** — at the moment of exit the caller's session belongs to the
target user, not an admin. Authorization comes from possession of the `pa_op_prev`
cookie, which is safe precisely because that cookie *is* an admin session the
caller already had.

1. Read and unchunk `pa_op_prev`.
2. Restore those cookie name/value pairs verbatim onto the response, overwriting
   the target user's auth cookies.
3. Clear `pa_op_prev` and `pa_op_imp`.
4. Insert `audit_logs` row: `action: 'admin.impersonation_ended'`, same actor and
   target, `meta: { durationSeconds }`.
5. Redirect to `/super/users/[targetUserId]`.

Nothing is re-minted on exit. The route restores a session, it cannot manufacture
one — so there is no path by which a forged cookie yields admin access, and no
new attack surface beyond "possess an admin's session cookie," which is already
game-over regardless.

### Cookie stash

Supabase auth cookies routinely exceed the 4KB per-cookie browser limit and are
chunked by `@supabase/ssr` into `sb-<ref>-auth-token.0`, `.1`, … The stash must
handle this in both directions.

`src/lib/auth/impersonation.ts`:

- `collectAuthCookies(cookies)` — all cookies whose name matches
  `sb-*-auth-token` or `sb-*-auth-token.<n>`
- `packStash(pairs) → string[]` — JSON, base64, split into ≤3.5KB chunks
- `unpackStash(chunks) → pairs` — inverse
- Written as `pa_op_prev.0 … pa_op_prev.N`, all `httpOnly`, `secure` in prod,
  `sameSite=lax`
- `readImpersonation(cookies)` — decode `pa_op_imp`, return null if absent/invalid.
  Expired sessions are still returned, paired with `isExpired(session, now)` —
  hiding an expired session would take the Exit button away from the one
  operator who most needs it.

Round-tripping `pack`/`unpack` is the highest-value unit test in this change —
if chunking is wrong, exit strands the operator inside a customer's account.

### Failure mode

If the stashed refresh token has expired or been rotated by the time the operator
exits, restoring the cookies yields a dead session. In that case the exit route
clears both temp cookies and redirects to `/sign-in`. The 60-minute cap makes this
rare; the operator's remedy is simply to sign in again.

## Entry point

`src/app/app/layout.tsx` already runs `getViewer()` server-side. It additionally
calls `isPlatformAdmin()` and passes the boolean to `Sidebar`, which renders a new
group when true:

```
PLATFORM
  ⚿ Operator console  → /super
```

Hidden for everyone else. Hidden automatically while impersonating, since the
impersonated session is not an admin.

## Copy correction

`/super/accounts/[id]` currently reads *"every impersonation is logged & visible
to the account owner."* No owner-facing view exists and none is being built. The
caption becomes *"every impersonation is logged."*

## Files

**New**
- `src/lib/auth/impersonation.ts` — cookie names, chunk/unchunk, read helpers
- `src/server/super/impersonate.ts` — start/end session logic + audit writes
- `src/app/api/super/impersonate/route.ts` — start
- `src/app/api/super/impersonate/exit/route.ts` — exit
- `src/components/ImpersonationBanner.tsx`
- `src/app/super/users/[id]/page.tsx`
- `src/components/super/ImpersonateButton.tsx` — takes `userId`, posts to start

**Moved** (`src/app/admin/**` → `src/app/super/**`)
- `layout.tsx`, `AdminShell.tsx` → `SuperShell.tsx`, `OpNav.tsx`
- current `admin/page.tsx` (accounts table) → `super/accounts/page.tsx`
- `accounts/[id]/**` including `credits/**`
- `series/page.tsx`

**Changed**
- `src/app/super/page.tsx` — now the Users list (new)
- `src/proxy.ts` — gate `/super` instead of `/admin`
- `src/db/queries/admin.ts` — add `listPlatformUsers`, `getPlatformUserDetail`
- `src/app/app/layout.tsx` — banner + admin flag to sidebar
- `src/components/nav/Sidebar.tsx` — optional Platform group
- `src/app/super/OpNav.tsx` — Users · Accounts · Series

**Deleted**
- `src/app/api/admin/impersonation-request/route.ts`
- `src/app/admin/accounts/[id]/ImpersonateButton.tsx` (the stub)
- `src/app/admin/accounts/page.tsx` (the redirect placeholder)

No migration. `users`, `memberships`, and `audit_logs` (with `actor_email`, added
in `0004_admin_panel.sql`) already carry everything needed.

## Testing

Unit (vitest, mirroring `src/lib/__tests__/` and the mocked-service-client style
in `src/server/**/__tests__/`):

- `packStash`/`unpackStash` round-trip, including a payload large enough to force
  multiple chunks, and a single-chunk payload
- `collectAuthCookies` picks up both chunked and unchunked Supabase cookie names
  and ignores unrelated cookies
- `readImpersonation` returns null on absent and malformed cookies, but still
  returns an expired session; `isExpired` flags it
- `listPlatformUsers` row shaping: multi-org membership, unaccepted membership,
  a user who is the subject of series, a user with no activity
- `getPlatformUserDetail` returns null for an unknown id

Manual (requires real Supabase, so not automatable here) — run via `/verify`:

1. Sign in as an admin → Operator console link appears in the sidebar
2. `/super` lists users → drill into one → Impersonate
3. Land on `/app` as that user; banner shows their email; `/super` now 404s
4. Exit → back at `/super/users/[id]` as the admin; sidebar link back
5. `audit_logs` contains a matched started/ended pair
6. Sign in as a non-admin → `/super` 404s, no sidebar link
