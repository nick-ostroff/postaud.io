# Password Auth + Super Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace magic-link-only sign-in with email + password (magic link remains as a fallback), add self-serve sign-up with email verification, and introduce a platform-level super admin panel at `/admin` gated by an env-var allowlist.

**Architecture:** Auth is Supabase Auth (existing). Password, magic link, reset, and verification flows all route through the existing `/auth/callback` handler, which already bootstraps `users` / `organizations` / `memberships` via the `ensureViewerBootstrapped()` helper. Platform admin status is derived from a comma-separated `PLATFORM_ADMIN_EMAILS` env var — no DB column — and enforced in three layers: middleware 404, server-component re-check, and service-role queries only from under `/admin`. The admin UI is server-rendered CRUD with server actions; no client state library.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Supabase (@supabase/ssr + service-role) · Postgres + RLS · Tailwind v4 · Zod · TypeScript strict.

**Spec:** [docs/superpowers/specs/2026-04-19-password-auth-admin-panel-design.md](../specs/2026-04-19-password-auth-admin-panel-design.md)

**Conventions for this plan:**
- Manual verification replaces unit tests (no Vitest/Jest installed — not introducing one for this feature).
- Every task ends with a commit.
- Use `npm run build` for type-check validation.
- Use `npm run dev` for browser smoke tests.
- Database migrations apply via Supabase CLI (`supabase db push`) or Supabase MCP.

---

## File Map

New files:
- `src/lib/auth/is-platform-admin.ts` — single source of truth for admin check
- `src/app/sign-up/page.tsx` + `SignUpForm.tsx`
- `src/app/auth/verify/page.tsx` — post-confirmation landing
- `src/app/auth/reset/page.tsx` + `ResetForm.tsx`
- `src/app/auth/update-password/page.tsx` + `UpdatePasswordForm.tsx`
- `src/db/queries/admin.ts` — service-role queries for admin
- `src/app/admin/layout.tsx` + `AdminShell.tsx`
- `src/app/admin/page.tsx` — redirect
- `src/app/admin/accounts/page.tsx` — list
- `src/app/admin/accounts/[id]/page.tsx` — detail
- `src/app/admin/accounts/[id]/credits/page.tsx` + `CreditForm.tsx`
- `src/app/admin/accounts/[id]/actions.ts` — server actions: `adjustCredits`, `setStatus`
- `supabase/migrations/0004_admin_panel.sql` — enum, column, RLS, audit_logs.actor_email

Modified files:
- `src/lib/env.ts` — add `PLATFORM_ADMIN_EMAILS` to schema
- `src/proxy.ts` — gate `/admin/**`
- `src/app/sign-in/SignInForm.tsx` — password-first UX, magic-link fallback
- `src/db/types.ts` — regenerate (adds `status` column + enum)

---

## Task 1: Add `PLATFORM_ADMIN_EMAILS` to env schema

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.local` (local only, not committed)

- [ ] **Step 1: Add env var to Zod schema**

Edit [src/lib/env.ts](../../../src/lib/env.ts). Add this line inside the `z.object({...})` block, grouped with other auth-related vars:

```ts
  PLATFORM_ADMIN_EMAILS: z.string().optional().default(""),
```

- [ ] **Step 2: Add helper to parse the list**

At the bottom of `src/lib/env.ts`, add:

```ts
export function platformAdminEmails(): string[] {
  return env()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
```

- [ ] **Step 3: Add the var to local env**

Add this line to `.env.local` (replace with actual email):

```
PLATFORM_ADMIN_EMAILS=nick@pixelocity.com
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: Build completes without type errors. If the build was already broken for unrelated reasons, confirm no NEW type errors were introduced.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(env): add PLATFORM_ADMIN_EMAILS for super admin gate"
git push
```

---

## Task 2: Create `is-platform-admin` helper

**Files:**
- Create: `src/lib/auth/is-platform-admin.ts`

- [ ] **Step 1: Create the helper**

Create [src/lib/auth/is-platform-admin.ts](../../../src/lib/auth/is-platform-admin.ts):

```ts
import { createClient } from "@/db/server";
import { platformAdminEmails } from "@/lib/env";

/**
 * Returns true iff the current authenticated user's email is in
 * PLATFORM_ADMIN_EMAILS. The env list is the single source of truth for
 * super-admin status — there is no DB column.
 *
 * Safe to call from middleware, server components, route handlers, and
 * server actions.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  return platformAdminEmails().includes(user.email.toLowerCase());
}

/**
 * Returns the caller's email if they are a platform admin, or null.
 * Convenience for audit logging where the email is the actor identifier.
 */
export async function platformAdminEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  return platformAdminEmails().includes(email) ? email : null;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/is-platform-admin.ts
git commit -m "feat(auth): add isPlatformAdmin helper"
git push
```

---

## Task 3: Gate `/admin/**` in middleware

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add admin gate to middleware**

Edit [src/proxy.ts](../../../src/proxy.ts). Replace the current `proxy()` function body with:

```ts
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Gate dashboard routes — unauth users get bounced to sign-in.
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Gate /admin — non-admins get 404, never 403. We return 404 rather than
  // redirecting so the panel's existence is not disclosed.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = user?.email?.toLowerCase() ?? "";
    if (!email || !adminEmails.includes(email)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return response;
}
```

Why `process.env` directly instead of the env() helper: middleware runs in a constrained runtime; we avoid pulling in Zod parsing at this layer.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In a browser:
1. Visit `http://localhost:3000/admin` while signed out → expect 404 page.
2. Sign in with a non-admin email → visit `/admin` → expect 404.
3. Sign in with an email listed in `PLATFORM_ADMIN_EMAILS` → visit `/admin` → expect a Next.js error about missing route (route doesn't exist yet — that's fine). You should NOT get 404.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(middleware): gate /admin behind PLATFORM_ADMIN_EMAILS"
git push
```

---

## Task 4: Database migration — status, audit_logs.actor_email, RLS

**Files:**
- Create: `supabase/migrations/0004_admin_panel.sql`

- [ ] **Step 1: Write the migration**

Create [supabase/migrations/0004_admin_panel.sql](../../../supabase/migrations/0004_admin_panel.sql):

```sql
-- 0004_admin_panel.sql
-- Adds: org_status enum, organizations.status, audit_logs.actor_email,
-- and tightens interview_requests write RLS to block suspended orgs.

-- =========================================================
-- 1. org_status enum + organizations.status
-- =========================================================
create type org_status as enum ('active', 'suspended');

alter table organizations
  add column status org_status not null default 'active';

-- =========================================================
-- 2. audit_logs.actor_email (for platform-admin actions where the actor
--    is not a member of target_organization_id)
-- =========================================================
alter table audit_logs
  add column actor_email text;

-- =========================================================
-- 3. Tighten RLS on interview_requests to block suspended orgs from
--    CREATING or UPDATING requests. READ/DELETE remain available so
--    suspended orgs can still view/cleanup their own data.
--
-- The existing "org rw" policy (from 0001_init.sql) covers ALL operations;
-- we drop it and replace with per-verb policies.
-- =========================================================
drop policy if exists "org rw" on interview_requests;

create policy "org read" on interview_requests
  for select
  using (organization_id = current_org_id());

create policy "org insert" on interview_requests
  for insert
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org update" on interview_requests
  for update
  using (organization_id = current_org_id())
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from organizations
      where id = interview_requests.organization_id
        and status = 'active'
    )
  );

create policy "org delete" on interview_requests
  for delete
  using (organization_id = current_org_id());
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: Migration applies successfully; no errors.

If using the Supabase MCP instead, apply via the `mcp__claude_ai_Supabase__apply_migration` tool with name `0004_admin_panel` and the SQL above.

- [ ] **Step 3: Verify the schema changes**

Run this in the Supabase SQL editor or via MCP `execute_sql`:

```sql
select column_name, data_type, udt_name
from information_schema.columns
where table_name = 'organizations' and column_name = 'status';

select column_name, data_type
from information_schema.columns
where table_name = 'audit_logs' and column_name = 'actor_email';

select policyname, cmd
from pg_policies
where tablename = 'interview_requests'
order by policyname;
```

Expected:
- `organizations.status` exists, udt_name = `org_status`.
- `audit_logs.actor_email` exists as `text`.
- Four policies on `interview_requests`: `org read` (SELECT), `org insert` (INSERT), `org update` (UPDATE), `org delete` (DELETE). The old `org rw` must be gone.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_admin_panel.sql
git commit -m "feat(db): add org status, audit_logs.actor_email, tighten interview_requests RLS"
git push
```

---

## Task 5: Regenerate TypeScript types from database

**Files:**
- Modify: `src/db/types.ts`

- [ ] **Step 1: Regenerate types**

Run from the project root:

```bash
supabase gen types typescript --linked > src/db/types.ts
```

Or via Supabase MCP: `mcp__claude_ai_Supabase__generate_typescript_types`, then write output to `src/db/types.ts`.

- [ ] **Step 2: Verify the new types appear**

Run: `grep -n "status" src/db/types.ts | head -20`
Expected: `organizations` row/insert/update types now include `status` field typed as `Database["public"]["Enums"]["org_status"]` (or similar). `audit_logs` rows include `actor_email: string | null`.

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: Build succeeds. If any query files fail because existing code accesses `organizations.status` loosely, fix those touch-points — but none should, since status is new.

- [ ] **Step 4: Commit**

```bash
git add src/db/types.ts
git commit -m "chore(db): regenerate types after admin_panel migration"
git push
```

---

## Task 6: Sign-up page with email verification

**Files:**
- Create: `src/app/sign-up/page.tsx`
- Create: `src/app/sign-up/SignUpForm.tsx`

- [ ] **Step 1: Create the page wrapper**

Create [src/app/sign-up/page.tsx](../../../src/app/sign-up/page.tsx):

```tsx
import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your PostAud.io account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Create your account
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Three free interviews per month. No credit card required.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
      <p className="mt-6 text-center text-[14px] text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the signup form**

Create [src/app/sign-up/SignUpForm.tsx](../../../src/app/sign-up/SignUpForm.tsx):

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/db/client";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/verify`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          We sent a confirmation link to <strong>{email}</strong>. Click it to finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Email Address
        </label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Password
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
        />
        <p className="mt-1.5 text-[13px] text-neutral-500">At least 8 characters.</p>
      </div>
      <button
        type="submit"
        disabled={state === "submitting" || !email || password.length < 8}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting" ? "Creating account…" : "Create account"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. In a fresh browser session:
1. Visit `/sign-up`, enter a NEW email + password ≥ 8 chars, submit.
2. Expect "check your inbox" state. Confirm email arrives.
3. Click the confirmation link → lands on `/auth/verify` (page doesn't exist yet — will 404, that's expected; Task 8 creates it). The `auth.users` row should now be confirmed and `organizations` / `memberships` rows created via bootstrap.

Verify in Supabase SQL editor:
```sql
select id, email, email_confirmed_at from auth.users where email = '<your-test-email>';
select * from public.users where email = '<your-test-email>';
select * from memberships where user_id = (select id from public.users where email = '<your-test-email>');
```

- [ ] **Step 5: Commit**

```bash
git add src/app/sign-up/
git commit -m "feat(auth): add /sign-up with password + email verification"
git push
```

---

## Task 7: Sign-in form — password-first with magic-link fallback

**Files:**
- Modify: `src/app/sign-in/SignInForm.tsx`

- [ ] **Step 1: Rewrite the form**

Replace the entire contents of [src/app/sign-in/SignInForm.tsx](../../../src/app/sign-in/SignInForm.tsx) with:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";

type Mode = "password" | "magic";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    router.push(next ?? "/app");
    router.refresh();
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    setState("sent");
  }

  if (mode === "magic" && state === "sent") {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          We sent a secure link to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={mode === "password" ? submitPassword : submitMagic}
      className="space-y-5"
    >
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Email Address
        </label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>

      {mode === "password" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300">
              Password
            </label>
            <Link
              href="/auth/reset"
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={state === "submitting" || !email || (mode === "password" && !password)}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting"
          ? mode === "password" ? "Signing in…" : "Sending link…"
          : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setState("idle");
          setErrorMsg(null);
        }}
        className="w-full text-center text-[14px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
      >
        {mode === "password" ? "Email me a link instead" : "Use password instead"}
      </button>

      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`.
1. Visit `/sign-in`. Verify the password form shows by default with a "Forgot?" link and a "Email me a link instead" toggle.
2. Using the account created in Task 6, submit email + password → expect redirect to `/app`.
3. Sign out, return to `/sign-in`, click "Email me a link instead" → form shows only email → submit → expect "check your inbox" state.
4. Verify wrong password shows a clear error message.

- [ ] **Step 4: Commit**

```bash
git add src/app/sign-in/SignInForm.tsx
git commit -m "feat(auth): password-first sign-in with magic-link fallback"
git push
```

---

## Task 8: Password reset flow + auth/verify landing

**Files:**
- Create: `src/app/auth/reset/page.tsx`
- Create: `src/app/auth/reset/ResetForm.tsx`
- Create: `src/app/auth/update-password/page.tsx`
- Create: `src/app/auth/update-password/UpdatePasswordForm.tsx`
- Create: `src/app/auth/verify/page.tsx`

- [ ] **Step 1: Create the reset-request page**

Create [src/app/auth/reset/page.tsx](../../../src/app/auth/reset/page.tsx):

```tsx
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Reset your password" };

export default function ResetPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Reset your password
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>
      <div className="mt-8">
        <ResetForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the reset form**

Create [src/app/auth/reset/ResetForm.tsx](../../../src/app/auth/reset/ResetForm.tsx):

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/db/client";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center shadow-sm">
        <p className="text-xl font-medium text-emerald-800 dark:text-emerald-400 mb-2">Check your inbox</p>
        <p className="text-[15px] font-medium text-emerald-700 dark:text-emerald-500">
          If an account exists for <strong>{email}</strong>, we just sent you a reset link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Email Address
        </label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-600 shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={state === "submitting" || !email}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting" ? "Sending link…" : "Send reset link"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Create the update-password page**

Create [src/app/auth/update-password/page.tsx](../../../src/app/auth/update-password/page.tsx):

```tsx
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Choose a new password
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        At least 8 characters.
      </p>
      <div className="mt-8">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the update-password form**

Create [src/app/auth/update-password/UpdatePasswordForm.tsx](../../../src/app/auth/update-password/UpdatePasswordForm.tsx):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-[15px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          New Password
        </label>
        <input
          type="password"
          required
          minLength={8}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3.5 text-[15px] font-medium text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={state === "submitting" || password.length < 8}
        className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
      >
        {state === "submitting" ? "Saving…" : "Save new password"}
      </button>
      {errorMsg && (
        <div className="mt-2 text-[15px] font-medium text-rose-700 dark:text-rose-400 text-center">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Create the verify landing page**

Create [src/app/auth/verify/page.tsx](../../../src/app/auth/verify/page.tsx):

```tsx
import Link from "next/link";

export const metadata = { title: "Email verified" };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        You&apos;re in.
      </h1>
      <p className="mt-3 text-[15px] text-neutral-600 dark:text-neutral-400">
        Your email is verified and your account is ready.
      </p>
      <Link
        href="/app"
        className="mt-8 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
      >
        Go to your dashboard
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`. Using the account created in Task 6:
1. Sign out. Visit `/auth/reset`. Submit the email.
2. Check inbox. Click the reset link. Land on `/auth/update-password`.
3. Enter a new password ≥ 8 chars. Submit → redirects to `/app`.
4. Sign out, sign back in with the new password → success.
5. Visit `/auth/verify` directly → confirm the landing page renders.
6. Re-run the signup flow from Task 6: click the email confirmation link → lands on `/auth/verify` (via `/auth/callback?next=/auth/verify`).

- [ ] **Step 8: Commit**

```bash
git add src/app/auth/reset/ src/app/auth/update-password/ src/app/auth/verify/
git commit -m "feat(auth): add password reset + email verify landing"
git push
```

---

## Task 9: Admin queries module (service-role)

**Files:**
- Create: `src/db/queries/admin.ts`

- [ ] **Step 1: Create the admin query module**

Create [src/db/queries/admin.ts](../../../src/db/queries/admin.ts):

```ts
import "server-only";
import { serviceClient } from "@/db/service";

export type OrgListRow = {
  id: string;
  name: string;
  plan: string;
  status: "active" | "suspended";
  credits_remaining: number;
  created_at: string;
  owner_email: string | null;
  interviews_this_month: number;
};

export async function listOrganizations(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<OrgListRow[]> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // Pull orgs + owner email + this-month interview count in one round trip.
  // We fetch a bit wide and filter in memory on search — the scale here is
  // "platform admin looking at the customer list," not a hot path.
  let query = svc
    .from("organizations")
    .select(`
      id,
      name,
      plan,
      status,
      credits_remaining,
      created_at,
      memberships!inner ( role, users ( email ) ),
      interview_requests ( id, sent_at )
    `)
    .eq("memberships.role", "owner")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.search) {
    // Supabase doesn't easily OR across joined-table columns; apply name
    // search server-side and email search in memory.
    query = query.ilike("name", `%${opts.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const rows: OrgListRow[] = (data ?? []).map((row) => {
    const owner = Array.isArray(row.memberships) ? row.memberships[0] : row.memberships;
    const ownerEmail = owner?.users?.email ?? null;
    const interviewsThisMonth = (row.interview_requests ?? []).filter(
      (r) => r.sent_at && new Date(r.sent_at) >= monthStart,
    ).length;
    return {
      id: row.id,
      name: row.name,
      plan: row.plan,
      status: row.status,
      credits_remaining: row.credits_remaining,
      created_at: row.created_at,
      owner_email: ownerEmail,
      interviews_this_month: interviewsThisMonth,
    };
  });

  if (opts.search) {
    const q = opts.search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.owner_email?.toLowerCase().includes(q) ?? false),
    );
  }
  return rows;
}

export type OrgDetail = {
  organization: {
    id: string;
    name: string;
    plan: string;
    status: "active" | "suspended";
    credits_remaining: number;
    stripe_customer_id: string | null;
    created_at: string;
  };
  members: Array<{ user_id: string; email: string; role: string; created_at: string }>;
  recentRequests: Array<{
    id: string;
    status: string;
    sent_at: string | null;
    completed_at: string | null;
    contact_phone: string;
  }>;
  auditLog: Array<{
    id: number;
    at: string;
    action: string;
    actor_email: string | null;
    actor_user_id: string | null;
    meta: unknown;
  }>;
};

export async function getOrganizationDetail(orgId: string): Promise<OrgDetail | null> {
  const svc = serviceClient();

  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, plan, status, credits_remaining, stripe_customer_id, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  if (!org) return null;

  const { data: members } = await svc
    .from("memberships")
    .select("user_id, role, created_at, users ( email )")
    .eq("organization_id", orgId);

  const { data: requests } = await svc
    .from("interview_requests")
    .select("id, status, sent_at, completed_at, contacts ( phone_e164 )")
    .eq("organization_id", orgId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(25);

  // audit_logs for this org: either action targeted it, or actor was a member
  const { data: audit } = await svc
    .from("audit_logs")
    .select("id, at, action, actor_email, actor_user_id, meta, target_id, organization_id")
    .or(`organization_id.eq.${orgId},target_id.eq.${orgId}`)
    .order("at", { ascending: false })
    .limit(25);

  return {
    organization: org,
    members: (members ?? []).map((m) => ({
      user_id: m.user_id,
      email: (m.users as { email?: string } | null)?.email ?? "",
      role: m.role,
      created_at: m.created_at,
    })),
    recentRequests: (requests ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      sent_at: r.sent_at,
      completed_at: r.completed_at,
      contact_phone: (r.contacts as { phone_e164?: string } | null)?.phone_e164 ?? "",
    })),
    auditLog: (audit ?? []).map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actor_email: a.actor_email,
      actor_user_id: a.actor_user_id,
      meta: a.meta,
    })),
  };
}

export async function adjustOrgCredits(args: {
  orgId: string;
  delta: number;
  reason: string;
  actorEmail: string;
}): Promise<void> {
  const svc = serviceClient();

  const { data: org, error: fetchErr } = await svc
    .from("organizations")
    .select("credits_remaining")
    .eq("id", args.orgId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!org) throw new Error("Organization not found");

  const before = org.credits_remaining;
  const after = before + args.delta;

  const { error: updErr } = await svc
    .from("organizations")
    .update({ credits_remaining: after })
    .eq("id", args.orgId);
  if (updErr) throw new Error(updErr.message);

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: args.orgId,
    target_type: "organization",
    target_id: args.orgId,
    action: "credit_adjustment",
    actor_email: args.actorEmail,
    meta: { delta: args.delta, reason: args.reason, before, after },
  });
  if (auditErr) throw new Error(auditErr.message);
}

export async function setOrgStatus(args: {
  orgId: string;
  status: "active" | "suspended";
  actorEmail: string;
}): Promise<void> {
  const svc = serviceClient();

  const { data: org, error: fetchErr } = await svc
    .from("organizations")
    .select("status")
    .eq("id", args.orgId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!org) throw new Error("Organization not found");

  const before = org.status;

  const { error: updErr } = await svc
    .from("organizations")
    .update({ status: args.status })
    .eq("id", args.orgId);
  if (updErr) throw new Error(updErr.message);

  const { error: auditErr } = await svc.from("audit_logs").insert({
    organization_id: args.orgId,
    target_type: "organization",
    target_id: args.orgId,
    action: args.status === "suspended" ? "account_suspended" : "account_unsuspended",
    actor_email: args.actorEmail,
    meta: { before, after: args.status },
  });
  if (auditErr) throw new Error(auditErr.message);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: No errors. If the Supabase joined-select typing complains about the `memberships!inner` shape, cast the specific fields we pull (`row.memberships`, `row.interview_requests`) with a local type — the runtime shape is correct.

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/admin.ts
git commit -m "feat(admin): add service-role queries for admin panel"
git push
```

---

## Task 10: Admin shell — layout + redirect + accounts list

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/AdminShell.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/accounts/page.tsx`

- [ ] **Step 1: Create the admin layout**

Create [src/app/admin/layout.tsx](../../../src/app/admin/layout.tsx):

```tsx
import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { AdminShell } from "./AdminShell";

export const metadata = { title: "Admin — PostAud.io" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: middleware already 404s non-admins, but don't trust it.
  if (!(await isPlatformAdmin())) {
    notFound();
  }
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 2: Create the admin shell UI**

Create [src/app/admin/AdminShell.tsx](../../../src/app/admin/AdminShell.tsx):

```tsx
import Link from "next/link";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0b0b0c]">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold text-neutral-900 dark:text-white">
              PostAud.io Admin
            </Link>
            <nav className="flex items-center gap-4 text-[14px] font-medium text-neutral-600 dark:text-neutral-400">
              <Link href="/admin/accounts" className="hover:text-neutral-900 dark:hover:text-white">
                Accounts
              </Link>
            </nav>
          </div>
          <Link
            href="/app"
            className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            ← Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create the /admin redirect**

Create [src/app/admin/page.tsx](../../../src/app/admin/page.tsx):

```tsx
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/accounts");
}
```

- [ ] **Step 4: Create the accounts list page**

Create [src/app/admin/accounts/page.tsx](../../../src/app/admin/accounts/page.tsx):

```tsx
import Link from "next/link";
import { listOrganizations } from "@/db/queries/admin";

type SearchParams = Promise<{ q?: string; offset?: string }>;

export default async function AccountsListPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, offset: offsetStr } = await searchParams;
  const offset = Number.isFinite(Number(offsetStr)) ? Number(offsetStr) : 0;
  const pageSize = 50;
  const rows = await listOrganizations({ search: q, limit: pageSize, offset });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Accounts</h1>
        <form className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by org name or owner email"
            className="w-80 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-[14px] font-medium text-white dark:text-neutral-900 hover:opacity-90"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111]">
        <table className="w-full text-[14px]">
          <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Credits</th>
              <th className="px-4 py-3 font-medium text-right">Interviews (mo)</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-neutral-500">
                  No accounts match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-[#161616]">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/accounts/${r.id}`}
                    className="font-medium text-neutral-900 dark:text-white hover:text-blue-600"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {r.owner_email ?? "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{r.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      r.status === "active"
                        ? "inline-flex rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[12px] font-medium text-emerald-800 dark:text-emerald-300"
                        : "inline-flex rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[12px] font-medium text-rose-800 dark:text-rose-300"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                  {r.credits_remaining}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {r.interviews_this_month}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px] text-neutral-500">
        <div>
          Showing {offset + 1}–{offset + rows.length}
        </div>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={`/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), offset: String(Math.max(0, offset - pageSize)) })}`}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:hover:bg-[#161616]"
            >
              Previous
            </Link>
          )}
          {rows.length === pageSize && (
            <Link
              href={`/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), offset: String(offset + pageSize) })}`}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:hover:bg-[#161616]"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`. Signed in as an email in `PLATFORM_ADMIN_EMAILS`:
1. Visit `/admin` → redirects to `/admin/accounts`.
2. Accounts table renders all existing organizations, including the test account from Task 6.
3. Search for a partial org name or owner email → filter works.
4. Sign out → `/admin/accounts` returns 404.
5. Sign in as a non-admin account (create a second test account if needed) → `/admin/accounts` returns 404.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/layout.tsx src/app/admin/AdminShell.tsx src/app/admin/page.tsx src/app/admin/accounts/page.tsx
git commit -m "feat(admin): add layout, /admin redirect, and accounts list"
git push
```

---

## Task 11: Admin account detail page

**Files:**
- Create: `src/app/admin/accounts/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create [src/app/admin/accounts/\[id\]/page.tsx](../../../src/app/admin/accounts/[id]/page.tsx):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/db/queries/admin";
import { setStatusAction } from "./actions";

type Params = Promise<{ id: string }>;

export default async function AccountDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();
  const { organization, members, recentRequests, auditLog } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/accounts" className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          ← Accounts
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{organization.name}</h1>
            <p className="mt-1 text-[14px] text-neutral-500">
              {organization.plan} · {organization.credits_remaining} credits ·{" "}
              <span className={organization.status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                {organization.status}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/accounts/${organization.id}/credits`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-blue-700"
            >
              Adjust credits
            </Link>
            <form action={setStatusAction}>
              <input type="hidden" name="orgId" value={organization.id} />
              <input
                type="hidden"
                name="nextStatus"
                value={organization.status === "active" ? "suspended" : "active"}
              />
              <button
                type="submit"
                className={
                  organization.status === "active"
                    ? "rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-[#111] px-4 py-2 text-[14px] font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    : "rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#111] px-4 py-2 text-[14px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                }
              >
                {organization.status === "active" ? "Suspend" : "Unsuspend"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">Members</h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{m.email}</td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{m.role}</td>
                  <td className="px-4 py-2 text-neutral-500">{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">
          Recent interview requests
        </h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No interview requests yet.
                  </td>
                </tr>
              )}
              {recentRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{r.contact_phone || "—"}</td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{r.status}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-medium text-neutral-900 dark:text-white mb-3">Audit log</h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-neutral-50 dark:bg-[#161616] text-left text-neutral-600 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No audit entries.
                  </td>
                </tr>
              )}
              {auditLog.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                    {new Date(a.at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">
                    {a.actor_email ?? a.actor_user_id ?? "system"}
                  </td>
                  <td className="px-4 py-2 text-neutral-900 dark:text-white">{a.action}</td>
                  <td className="px-4 py-2 font-mono text-[12px] text-neutral-500">
                    {a.meta ? JSON.stringify(a.meta) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: Build fails with "Cannot find module './actions'" — that's expected; Task 12 creates it. Proceed to Task 12 without committing.

---

## Task 12: Admin actions (credits + status) + credit form

**Files:**
- Create: `src/app/admin/accounts/[id]/actions.ts`
- Create: `src/app/admin/accounts/[id]/credits/page.tsx`
- Create: `src/app/admin/accounts/[id]/credits/CreditForm.tsx`

- [ ] **Step 1: Create the server actions file**

Create [src/app/admin/accounts/\[id\]/actions.ts](../../../src/app/admin/accounts/[id]/actions.ts):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import { adjustOrgCredits, setOrgStatus } from "@/db/queries/admin";

export async function adjustCreditsAction(formData: FormData) {
  const email = await platformAdminEmail();
  if (!email) throw new Error("Not authorized");

  const orgId = String(formData.get("orgId") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orgId) throw new Error("Missing orgId");
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Delta must be a non-zero number");
  if (reason.length < 3) throw new Error("Reason is required");

  await adjustOrgCredits({ orgId, delta, reason, actorEmail: email });

  revalidatePath(`/admin/accounts/${orgId}`);
  redirect(`/admin/accounts/${orgId}`);
}

export async function setStatusAction(formData: FormData) {
  const email = await platformAdminEmail();
  if (!email) throw new Error("Not authorized");

  const orgId = String(formData.get("orgId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "");
  if (!orgId) throw new Error("Missing orgId");
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    throw new Error("Invalid status");
  }

  await setOrgStatus({ orgId, status: nextStatus, actorEmail: email });

  revalidatePath(`/admin/accounts/${orgId}`);
  redirect(`/admin/accounts/${orgId}`);
}
```

- [ ] **Step 2: Create the credits page wrapper**

Create [src/app/admin/accounts/\[id\]/credits/page.tsx](../../../src/app/admin/accounts/[id]/credits/page.tsx):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationDetail } from "@/db/queries/admin";
import { CreditForm } from "./CreditForm";

type Params = Promise<{ id: string }>;

export default async function CreditAdjustPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();

  return (
    <div className="max-w-lg">
      <Link
        href={`/admin/accounts/${id}`}
        className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
      >
        ← {detail.organization.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
        Adjust credits
      </h1>
      <p className="mt-1 text-[14px] text-neutral-500">
        Current balance: {detail.organization.credits_remaining}
      </p>
      <div className="mt-6">
        <CreditForm orgId={id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the credit form (client)**

Create [src/app/admin/accounts/\[id\]/credits/CreditForm.tsx](../../../src/app/admin/accounts/[id]/credits/CreditForm.tsx):

```tsx
"use client";

import { useState } from "react";
import { adjustCreditsAction } from "../actions";

export function CreditForm({ orgId }: { orgId: string }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        await adjustCreditsAction(formData);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="orgId" value={orgId} />
      <div>
        <label className="block text-[14px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Delta (signed integer — positive to add, negative to deduct)
        </label>
        <input
          name="delta"
          type="number"
          required
          step={1}
          placeholder="e.g. 10 or -3"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-[14px] font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Reason (required — shown in the audit log)
        </label>
        <textarea
          name="reason"
          required
          minLength={3}
          rows={3}
          placeholder="e.g. Comp for outage on 2026-04-15"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[14px] text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Apply adjustment"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: Build succeeds end-to-end (Task 11's page now resolves its `./actions` import).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. Signed in as a platform admin:

1. `/admin/accounts` → click any account → lands on `/admin/accounts/<id>`. Header, members, requests, and audit log all render.
2. Click "Adjust credits" → enter `+5`, reason `testing`, submit → redirects back to detail. Credits increased by 5. Audit log has a new `credit_adjustment` row with `delta: 5, reason: "testing", before, after`.
3. Click "Suspend" → page reloads, status badge turns red, audit log shows `account_suspended`.
4. On a separate session signed in as that account's owner, try to create a new interview request — RLS should block the insert (confirm via the existing app UI returning an error or via Supabase logs).
5. Back in admin, click "Unsuspend" → audit log shows `account_unsuspended`, owner can create requests again.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/accounts/
git commit -m "feat(admin): add account detail + credit/status actions"
git push
```

---

## Task 13: Deploy env var to Vercel

**Files:** No code changes — deployment configuration only.

- [ ] **Step 1: Add env var to Vercel**

From the project root, add the admin email list to all three environments:

```bash
echo "nick@pixelocity.com" | vercel env add PLATFORM_ADMIN_EMAILS production
echo "nick@pixelocity.com" | vercel env add PLATFORM_ADMIN_EMAILS preview
echo "nick@pixelocity.com" | vercel env add PLATFORM_ADMIN_EMAILS development
```

Confirm:

```bash
vercel env ls | grep PLATFORM_ADMIN_EMAILS
```

- [ ] **Step 2: Trigger a redeploy**

The most recent commit from Task 12 should have already deployed. Check:

```bash
vercel ls --prod --limit 1
```

If the latest prod deploy predates the env var add, redeploy with:

```bash
vercel --prod
```

- [ ] **Step 3: Verify in production**

Visit `https://postaud.io/admin` (or whatever the prod domain is). Signed out → expect 404. Signed in as `nick@pixelocity.com` → expect the admin accounts list.

- [ ] **Step 4: Update Supabase auth config**

In the Supabase dashboard → Authentication → Settings:

1. Confirm "Enable email confirmations" is ON.
2. Set "JWT expiry" to `2592000` (30 days).
3. Confirm "Refresh token rotation" is enabled.

No commit needed — these are dashboard settings. If you want them captured in code, update `supabase/config.toml` and commit that, but Supabase does not apply `config.toml` auth settings to hosted projects automatically.

---

## Self-Review

Spec coverage check:
- §2 Auth changes → Tasks 6 (signup), 7 (signin), 8 (reset/update/verify), 13 (Supabase dashboard settings). ✓
- §3 Super admin gate → Tasks 1 (env), 2 (helper), 3 (middleware), 10 (layout re-check), 12 (action re-check), 13 (deploy). ✓
- §4 Admin panel routes → Tasks 10 (list), 11 (detail), 12 (credits + status). ✓
- §5 Data model → Tasks 4 (migration), 5 (type regen). ✓
- §6 File structure → matches File Map at top. ✓

Placeholder scan: no TODO/TBD/`appropriate`/"fill in" remaining.

Type consistency: all admin query function names (`listOrganizations`, `getOrganizationDetail`, `adjustOrgCredits`, `setOrgStatus`) are used identically where imported; server action names (`adjustCreditsAction`, `setStatusAction`) match across `actions.ts` and the pages that import them.
