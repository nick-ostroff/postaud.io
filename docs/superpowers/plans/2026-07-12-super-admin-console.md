# Super-Admin Console at `/super` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the operator console from `/admin` to `/super`, add a platform-wide users list and user detail view, and replace the impersonation stub with a real session swap that a super admin can enter and exit.

**Architecture:** Super-admin status stays env-driven (`PLATFORM_ADMIN_EMAILS`), gated at three layers (middleware 404, layout `notFound()`, per-route check). Impersonation works by minting a magic-link token for the target user with the service-role key, stashing the operator's own Supabase auth cookies verbatim into a chunked `pa_op_prev` cookie, then calling `verifyOtp` to overwrite the browser's session with the target's. Exit restores the stashed cookies — it never mints a session, so a forged cookie cannot manufacture admin access.

**Tech Stack:** Next.js 16.2.4 (App Router, `src/proxy.ts` middleware), Supabase (`@supabase/ssr` 0.10, `@supabase/supabase-js` 2.103), TypeScript, Tailwind, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-12-super-admin-console-design.md`

## Global Constraints

- **No DB migration.** `users`, `memberships`, `series`, `interviews`, `facts`, and `audit_logs` (incl. `actor_email`, added in `0004_admin_panel.sql`) already carry everything. Do not write a migration.
- **Metadata only** in every `/super` query. Never select `facts.statement`, `interview_messages.text`, `interview_summaries.short/long/bullets`, or topic content. Counts, titles, names, emails, dates, and statuses only. `src/db/queries/admin.ts` documents and upholds this invariant — keep it.
- **Non-admins get 404, never 403 and never a redirect**, on every `/super` and `/api/super` surface. The console's existence must not be disclosed.
- **Membership roles are `admin | interviewer | viewer`** (`member_role` enum, `0005_knowledge_interviewer.sql`). The org owner is the earliest-created membership with role `admin`.
- **No guardrails during impersonation.** The operator has full user powers. Do not add write-blocking. The banner and audit log are the only safety net.
- **Impersonation session cap: 60 minutes** (`MAX_IMPERSONATION_MS = 60 * 60 * 1000`).
- **Audit actions** are exactly `admin.impersonation_started` and `admin.impersonation_ended`.
- **Cookie names** are exactly `pa_op_prev` (chunked: `pa_op_prev.0`, `.1`, …) and `pa_op_imp`.
- Run `npm test` (vitest) and `npm run lint` before every commit. Clear `.next` (`rm -rf .next`) before diagnosing any build error.
- SSR-safe: no bare `window`/`document`/`localStorage` outside `"use client"` components.

---

### Task 1: Impersonation cookie library

Pure functions, no I/O. This is the highest-risk piece — if chunking is wrong, exiting strands the operator inside a customer's account — so it gets tested first and hardest.

**Files:**
- Create: `src/lib/auth/impersonation.ts`
- Test: `src/lib/__tests__/impersonation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `IMP_COOKIE = "pa_op_imp"`, `PREV_COOKIE = "pa_op_prev"`, `MAX_IMPERSONATION_MS = 3_600_000`
  - `type CookiePair = { name: string; value: string }`
  - `type ImpersonationSession = { adminEmail: string; targetUserId: string; targetEmail: string; startedAt: number }`
  - `collectAuthCookies(all: CookiePair[]): CookiePair[]`
  - `packStash(pairs: CookiePair[]): CookiePair[]` — returns cookies named `pa_op_prev.0…N`
  - `unpackStash(all: CookiePair[]): CookiePair[] | null`
  - `prevChunkNames(all: CookiePair[]): string[]`
  - `encodeSession(s: ImpersonationSession): string`
  - `readImpersonation(all: CookiePair[]): ImpersonationSession | null`
  - `isExpired(s: ImpersonationSession, now: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/impersonation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  collectAuthCookies,
  encodeSession,
  isExpired,
  MAX_IMPERSONATION_MS,
  packStash,
  prevChunkNames,
  readImpersonation,
  unpackStash,
  type CookiePair,
  type ImpersonationSession,
} from "../auth/impersonation";

describe("collectAuthCookies", () => {
  it("picks up unchunked and chunked supabase auth cookies, ignoring others", () => {
    const all: CookiePair[] = [
      { name: "sb-abcdef-auth-token", value: "a" },
      { name: "sb-abcdef-auth-token.0", value: "b" },
      { name: "sb-abcdef-auth-token.1", value: "c" },
      { name: "sb-abcdef-auth-token-code-verifier", value: "nope" },
      { name: "pa_op_imp", value: "nope" },
      { name: "theme", value: "dark" },
    ];
    expect(collectAuthCookies(all).map((c) => c.name)).toEqual([
      "sb-abcdef-auth-token",
      "sb-abcdef-auth-token.0",
      "sb-abcdef-auth-token.1",
    ]);
  });

  it("returns empty when there is no supabase session", () => {
    expect(collectAuthCookies([{ name: "theme", value: "dark" }])).toEqual([]);
  });
});

describe("packStash / unpackStash", () => {
  it("round-trips a small payload in a single chunk", () => {
    const pairs: CookiePair[] = [{ name: "sb-x-auth-token", value: "short" }];
    const packed = packStash(pairs);
    expect(packed).toHaveLength(1);
    expect(packed[0].name).toBe("pa_op_prev.0");
    expect(unpackStash(packed)).toEqual(pairs);
  });

  it("round-trips a large payload across multiple chunks", () => {
    // A realistic Supabase session easily exceeds one 4KB cookie.
    const pairs: CookiePair[] = [
      { name: "sb-x-auth-token.0", value: "A".repeat(4000) },
      { name: "sb-x-auth-token.1", value: "B".repeat(4000) },
    ];
    const packed = packStash(pairs);
    expect(packed.length).toBeGreaterThan(1);
    for (const c of packed) expect(c.value.length).toBeLessThanOrEqual(3500);
    expect(unpackStash(packed)).toEqual(pairs);
  });

  it("reassembles chunks in index order even when cookies arrive shuffled", () => {
    const pairs: CookiePair[] = [{ name: "sb-x-auth-token", value: "C".repeat(9000) }];
    const packed = packStash(pairs);
    expect(unpackStash([...packed].reverse())).toEqual(pairs);
  });

  it("returns null when no stash cookies are present", () => {
    expect(unpackStash([{ name: "theme", value: "dark" }])).toBeNull();
  });

  it("returns null when the stash is malformed", () => {
    expect(unpackStash([{ name: "pa_op_prev.0", value: "!!!not-base64!!!" }])).toBeNull();
  });
});

describe("prevChunkNames", () => {
  it("lists every stash cookie name so the caller can clear them all", () => {
    const all: CookiePair[] = [
      { name: "pa_op_prev.0", value: "x" },
      { name: "pa_op_prev.1", value: "y" },
      { name: "theme", value: "dark" },
    ];
    expect(prevChunkNames(all)).toEqual(["pa_op_prev.0", "pa_op_prev.1"]);
  });
});

describe("readImpersonation", () => {
  const session: ImpersonationSession = {
    adminEmail: "nick@pixelocity.com",
    targetUserId: "11111111-1111-1111-1111-111111111111",
    targetEmail: "jane@example.com",
    startedAt: 1_700_000_000_000,
  };

  it("round-trips an encoded session", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }];
    expect(readImpersonation(all)).toEqual(session);
  });

  it("returns null when absent", () => {
    expect(readImpersonation([{ name: "theme", value: "dark" }])).toBeNull();
  });

  it("returns null when malformed", () => {
    expect(readImpersonation([{ name: "pa_op_imp", value: "garbage" }])).toBeNull();
  });

  it("returns null when fields are missing", () => {
    const value = Buffer.from(JSON.stringify({ adminEmail: "a@b.c" })).toString("base64url");
    expect(readImpersonation([{ name: "pa_op_imp", value }])).toBeNull();
  });

  it("still returns an expired session so the operator can exit", () => {
    const all: CookiePair[] = [{ name: "pa_op_imp", value: encodeSession(session) }];
    const read = readImpersonation(all);
    expect(read).not.toBeNull();
    expect(isExpired(read!, session.startedAt + MAX_IMPERSONATION_MS + 1)).toBe(true);
    expect(isExpired(read!, session.startedAt + 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/impersonation.test.ts`
Expected: FAIL — `Failed to resolve import "../auth/impersonation"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/impersonation.ts`:

```ts
/**
 * Cookie plumbing for operator impersonation.
 *
 * Impersonation swaps the browser onto the target user's real Supabase
 * session. Before that happens we copy the operator's own auth cookies
 * verbatim into `pa_op_prev` so Exit can put them back. Exit *restores* a
 * session, it never mints one — so possession of a forged `pa_op_prev` grants
 * nothing an attacker didn't already have.
 *
 * Supabase auth cookies routinely exceed the 4KB per-cookie browser limit and
 * are chunked by @supabase/ssr into `.0`, `.1`, … The stash has to survive
 * that in both directions, which is what packStash/unpackStash are for.
 */

export const IMP_COOKIE = "pa_op_imp";
export const PREV_COOKIE = "pa_op_prev";

/** Operator sessions expire after an hour so the stashed refresh token can't go stale. */
export const MAX_IMPERSONATION_MS = 60 * 60 * 1000;

/** Stay under the ~4096-byte per-cookie limit with room for name + attributes. */
const CHUNK_SIZE = 3500;

export type CookiePair = { name: string; value: string };

export type ImpersonationSession = {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  startedAt: number;
};

// `sb-<project-ref>-auth-token`, optionally chunked with a numeric suffix.
// Deliberately excludes `-auth-token-code-verifier`, which is PKCE scratch
// state and not part of the session.
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

export function collectAuthCookies(all: CookiePair[]): CookiePair[] {
  return all.filter((c) => AUTH_COOKIE_RE.test(c.name));
}

export function packStash(pairs: CookiePair[]): CookiePair[] {
  const encoded = Buffer.from(JSON.stringify(pairs), "utf8").toString("base64url");
  const chunks: CookiePair[] = [];
  for (let i = 0; i * CHUNK_SIZE < encoded.length; i++) {
    chunks.push({
      name: `${PREV_COOKIE}.${i}`,
      value: encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  // An empty pairs array still yields one chunk, so exit can distinguish
  // "stashed nothing" from "no stash at all".
  if (chunks.length === 0) chunks.push({ name: `${PREV_COOKIE}.0`, value: encoded });
  return chunks;
}

export function unpackStash(all: CookiePair[]): CookiePair[] | null {
  const chunks = all
    .filter((c) => c.name.startsWith(`${PREV_COOKIE}.`))
    .map((c) => ({ index: Number(c.name.slice(PREV_COOKIE.length + 1)), value: c.value }))
    .filter((c) => Number.isInteger(c.index))
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) return null;

  try {
    const json = Buffer.from(chunks.map((c) => c.value).join(""), "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((p) => p && typeof p.name === "string" && typeof p.value === "string")) {
      return null;
    }
    return parsed as CookiePair[];
  } catch {
    return null;
  }
}

export function prevChunkNames(all: CookiePair[]): string[] {
  return all.filter((c) => c.name.startsWith(`${PREV_COOKIE}.`)).map((c) => c.name);
}

export function encodeSession(s: ImpersonationSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

/**
 * Decodes `pa_op_imp`. Note this cookie is unsigned on purpose: forging it can
 * only make the banner appear, it grants no access. Returns expired sessions
 * too — the operator still needs the Exit button.
 */
export function readImpersonation(all: CookiePair[]): ImpersonationSession | null {
  const raw = all.find((c) => c.name === IMP_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed as Partial<ImpersonationSession>;
    if (
      typeof s.adminEmail !== "string" ||
      typeof s.targetUserId !== "string" ||
      typeof s.targetEmail !== "string" ||
      typeof s.startedAt !== "number"
    ) {
      return null;
    }
    return s as ImpersonationSession;
  } catch {
    return null;
  }
}

export function isExpired(s: ImpersonationSession, now: number): boolean {
  return now - s.startedAt > MAX_IMPERSONATION_MS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/impersonation.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/lib/auth/impersonation.ts src/lib/__tests__/impersonation.test.ts
git commit -m "feat(super): impersonation cookie stash/restore helpers"
```

---

### Task 2: Move the console from `/admin` to `/super`

Pure relocation plus deletion of the stub. No behavior change, no new screens. Ends with a green build so the move is proven before anything is built on top of it.

**Files:**
- Move: `src/app/admin/**` → `src/app/super/**` (via `git mv`)
- Rename: `src/app/super/AdminShell.tsx` → `src/app/super/SuperShell.tsx`
- Modify: `src/app/super/layout.tsx`, `src/app/super/OpNav.tsx`, `src/app/super/SuperShell.tsx`, `src/proxy.ts`, `src/app/super/accounts/[id]/page.tsx`
- Delete: `src/app/api/admin/impersonation-request/route.ts`, `src/app/super/accounts/[id]/ImpersonateButton.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `SuperShell` (named export, same props as the old `AdminShell`: `{ children }`); routes `/super`, `/super/accounts`, `/super/accounts/[id]`, `/super/accounts/[id]/credits`, `/super/series`.

- [ ] **Step 1: Move the directory and delete the stubs**

```bash
git mv src/app/admin src/app/super
git mv src/app/super/AdminShell.tsx src/app/super/SuperShell.tsx
git rm src/app/api/admin/impersonation-request/route.ts
git rm src/app/super/accounts/[id]/ImpersonateButton.tsx
# The accounts table currently lives at /admin/page.tsx and /admin/accounts/page.tsx
# is a redirect placeholder. Flip them: the accounts console moves to
# /super/accounts, and /super/page.tsx is freed up for the users list (Task 4).
git rm src/app/super/accounts/page.tsx
git mv src/app/super/page.tsx src/app/super/accounts/page.tsx
rmdir src/app/api/admin 2>/dev/null || true
```

- [ ] **Step 2: Point `/super` at the accounts console for now**

The users list arrives in Task 4. Until then `/super` redirects, so the console is never broken mid-plan.

Create `src/app/super/page.tsx`:

```tsx
import { redirect } from "next/navigation";

// Placeholder until the users list lands (Task 4).
export default function SuperIndex() {
  redirect("/super/accounts");
}
```

- [ ] **Step 3: Fix the moved accounts page's internal links**

In `src/app/super/accounts/page.tsx` (the file just moved from `admin/page.tsx`), every self-referential link points at `/admin`. Replace the two helper functions:

```tsx
  function pillHref(key: "all" | ActivityStatus) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key !== "all") params.set("status", key);
    const qs = params.toString();
    return qs ? `/super/accounts?${qs}` : "/super/accounts";
  }

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/super/accounts?${qs}` : "/super/accounts";
  }
```

Update the row link and the page title:

```tsx
                  <Link
                    href={`/super/accounts/${r.id}`}
                    className="font-medium text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
```

```tsx
export const metadata = { title: "Accounts — Operator — PostAud.io" };
```

- [ ] **Step 4: Update `SuperShell`**

In `src/app/super/SuperShell.tsx`, rename the export and repoint the logo link:

```tsx
export function SuperShell({ children }: { children: React.ReactNode }) {
```

```tsx
          <Link href="/super" className="flex items-center text-[17px] font-serif text-[#F7F5F0]">
```

- [ ] **Step 5: Update the layout**

Replace `src/app/super/layout.tsx` in full:

```tsx
import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { SuperShell } from "./SuperShell";

export const metadata = { title: "Operator — PostAud.io" };

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: middleware already 404s non-admins, but don't trust it.
  if (!(await isPlatformAdmin())) {
    notFound();
  }
  return <SuperShell>{children}</SuperShell>;
}
```

- [ ] **Step 6: Update the nav**

Replace the `ITEMS` constant and active-state logic in `src/app/super/OpNav.tsx`. Users lands in Task 4; for now the nav has two real tabs.

```tsx
const ITEMS = [
  { href: "/super/accounts", label: "Accounts" },
  { href: "/super/series", label: "Series" },
];

export function OpNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md px-3 py-1.5 text-[13px] font-semibold text-[#F7F5F0] bg-white/10"
                : "rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/55 hover:text-[#F7F5F0]"
            }
          >
            {item.label}
          </Link>
        );
      })}
      <span
        className="cursor-default select-none rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/30"
        title="Coming soon"
      >
        Activity
      </span>
    </nav>
  );
}
```

- [ ] **Step 7: Strip the impersonate stub out of account detail**

In `src/app/super/accounts/[id]/page.tsx`:

1. Delete the import `import { ImpersonateButton } from "./ImpersonateButton";`
2. Delete the `<ImpersonateButton orgId={organization.id} />` line. (The real button returns in Task 6, on the *user*, not the org.)
3. Fix the breadcrumb — `href="/admin"` label "Users" becomes:

```tsx
        <Link href="/super/accounts" className="text-[12.5px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          Accounts
        </Link>
```

4. Fix the credits link:

```tsx
              href={`/super/accounts/${organization.id}/credits`}
```

5. **Copy correction** (spec §"Copy correction"): the caption promises something we don't build. Replace:

```tsx
          <span className="text-[11.5px] text-neutral-400 dark:text-neutral-600">
            every impersonation is logged
          </span>
```

- [ ] **Step 8: Repoint any remaining `/admin` links**

Run: `grep -rn '"/admin\|`/admin\|(/admin' src/`
Expected: hits only in `src/app/super/accounts/[id]/credits/page.tsx` and `src/app/super/accounts/[id]/actions.ts`. Change every `/admin/accounts/...` path to `/super/accounts/...` (this covers `redirect()` calls, `revalidatePath()` calls, and `<Link href>`s). Re-run until the grep is empty.

- [ ] **Step 9: Flip the middleware gate**

In `src/proxy.ts`, change the `/admin` block to `/super`:

```ts
  // Gate /super — non-admins get 404, never 403. We return 404 rather than
  // redirecting so the console's existence is not disclosed. /admin no longer
  // exists and is left to 404 naturally, which leaks nothing about the new path.
  if (request.nextUrl.pathname.startsWith("/super") || request.nextUrl.pathname.startsWith("/api/super")) {
    // Intentionally NOT using platformAdminEmails() from @/lib/env —
    // middleware runtime can't carry Zod. Keep in sync with src/lib/env.ts.
    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = user?.email?.toLowerCase() ?? "";
    if (!email || !adminEmails.includes(email)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }
```

**Careful:** the exit route added in Task 5 lives at `/api/super/impersonate/exit` and must be reachable *while impersonating*, when the caller is not an admin. Task 5 carves it out of this gate. Leave that to Task 5.

- [ ] **Step 10: Verify the build and tests**

```bash
rm -rf .next
npm run lint
npm test
npm run build
```
Expected: lint clean, all existing tests pass, build succeeds with routes `/super`, `/super/accounts`, `/super/accounts/[id]`, `/super/accounts/[id]/credits`, `/super/series` and no `/admin` routes listed.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(super): move operator console from /admin to /super, drop impersonation stub"
```

---

### Task 3: `listPlatformUsers` query

**Files:**
- Modify: `src/db/queries/admin.ts` (append)
- Test: `src/db/__tests__/platform-users.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type PlatformUserOrg = { id: string; name: string; role: MemberRole; accepted: boolean };
export type PlatformUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  orgs: PlatformUserOrg[];
  subjectOfCount: number;
  lastActivity: string | null;
  createdAt: string;
};
export async function listPlatformUsers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: PlatformUserRow[]; total: number }>;
```

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/platform-users.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { listPlatformUsers } from "../queries/admin";

/**
 * listPlatformUsers issues four independent table reads and joins them in
 * memory. Each read is `.select(...)` optionally followed by `.order()` /
 * `.limit()`, then awaited — so one thenable chain per table is enough.
 */
function makeSvc(tables: Record<string, unknown[]>) {
  const chain = (rows: unknown[]) => {
    const result = Promise.resolve({ data: rows, error: null });
    const obj: Record<string, unknown> = {
      select: () => obj,
      order: () => obj,
      limit: () => result,
      then: (...a: unknown[]) => (result.then as (...x: unknown[]) => unknown)(...a),
    };
    return obj;
  };
  return { from: (table: string) => chain(tables[table] ?? []) };
}

const USERS = [
  { id: "u1", email: "jane@example.com", display_name: "Jane", created_at: "2026-01-01T00:00:00Z" },
  { id: "u2", email: "bob@example.com", display_name: null, created_at: "2026-02-01T00:00:00Z" },
  { id: "u3", email: "zed@example.com", display_name: "Zed", created_at: "2026-03-01T00:00:00Z" },
];

const MEMBERSHIPS = [
  { user_id: "u1", organization_id: "o1", role: "admin", accepted_at: "2026-01-02T00:00:00Z", organizations: { name: "Acme" } },
  { user_id: "u1", organization_id: "o2", role: "viewer", accepted_at: "2026-01-03T00:00:00Z", organizations: { name: "Globex" } },
  { user_id: "u2", organization_id: "o1", role: "interviewer", accepted_at: null, organizations: { name: "Acme" } },
];

const SERIES = [
  { id: "s1", title: "Dad's stories", subject_user_id: "u2" },
  { id: "s2", title: "Ops handbook", subject_user_id: null },
];

const INTERVIEWS = [
  { organization_id: "o1", started_at: "2026-06-10T00:00:00Z" },
  { organization_id: "o1", started_at: "2026-05-01T00:00:00Z" },
];

beforeEach(() => {
  mocks.serviceClient.mockReturnValue(
    makeSvc({ users: USERS, memberships: MEMBERSHIPS, series: SERIES, interviews: INTERVIEWS }),
  );
});

describe("listPlatformUsers", () => {
  it("returns every user with their orgs, roles and accepted state", async () => {
    const { rows, total } = await listPlatformUsers({});
    expect(total).toBe(3);

    const jane = rows.find((r) => r.id === "u1")!;
    expect(jane.displayName).toBe("Jane");
    expect(jane.orgs).toEqual([
      { id: "o1", name: "Acme", role: "admin", accepted: true },
      { id: "o2", name: "Globex", role: "viewer", accepted: true },
    ]);

    const bob = rows.find((r) => r.id === "u2")!;
    expect(bob.displayName).toBeNull();
    expect(bob.orgs).toEqual([{ id: "o1", name: "Acme", role: "interviewer", accepted: false }]);
  });

  it("counts series the user is the subject of", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "u2")!.subjectOfCount).toBe(1);
    expect(rows.find((r) => r.id === "u1")!.subjectOfCount).toBe(0);
  });

  it("reports last activity as the newest interview in any org the user belongs to", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.find((r) => r.id === "u1")!.lastActivity).toBe("2026-06-10T00:00:00Z");
    // u3 belongs to no org at all.
    expect(rows.find((r) => r.id === "u3")!.lastActivity).toBeNull();
  });

  it("sorts by last activity, users with none last", async () => {
    const { rows } = await listPlatformUsers({});
    expect(rows.map((r) => r.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("searches on email and display name, case-insensitively", async () => {
    expect((await listPlatformUsers({ search: "JANE" })).rows.map((r) => r.id)).toEqual(["u1"]);
    expect((await listPlatformUsers({ search: "zed" })).rows.map((r) => r.id)).toEqual(["u3"]);
    expect((await listPlatformUsers({ search: "bob@example" })).rows.map((r) => r.id)).toEqual(["u2"]);
    expect((await listPlatformUsers({ search: "nobody" })).rows).toEqual([]);
  });

  it("paginates, reporting the pre-pagination total", async () => {
    const { rows, total } = await listPlatformUsers({ limit: 2, offset: 2 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.id)).toEqual(["u3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/platform-users.test.ts`
Expected: FAIL — `listPlatformUsers is not a function`.

- [ ] **Step 3: Implement the query**

Append to `src/db/queries/admin.ts`. Also extend the existing type import at the top of that file to bring in `MemberRole`:

```ts
import type { MemberRole, OrgPlan, SubjectKind } from "@/db/types";
```

Then append:

```ts
// =========================================================================
// Platform users — every person on the platform, not just account owners.
// Metadata only (see the invariant note above): emails, names, roles, counts.
// =========================================================================

export type PlatformUserOrg = { id: string; name: string; role: MemberRole; accepted: boolean };

export type PlatformUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  orgs: PlatformUserOrg[];
  subjectOfCount: number;
  lastActivity: string | null;
  createdAt: string;
};

export async function listPlatformUsers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: PlatformUserRow[]; total: number }> {
  const svc = serviceClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim().toLowerCase();

  // Four flat reads joined in memory, mirroring listAccountsConsole. This is a
  // platform-admin page, not a hot path — consistency with the neighboring
  // query beats a SQL-side optimization here.
  const [{ data: users }, { data: memberships }, { data: series }, { data: interviews }] = await Promise.all([
    svc.from("users").select("id, email, display_name, created_at").limit(2000),
    svc.from("memberships").select("user_id, organization_id, role, accepted_at, organizations ( name )"),
    svc.from("series").select("id, title, subject_user_id"),
    svc.from("interviews").select("organization_id, started_at").order("started_at", { ascending: false }),
  ]);

  const orgsByUser = new Map<string, PlatformUserOrg[]>();
  const orgIdsByUser = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const list = orgsByUser.get(m.user_id) ?? [];
    list.push({
      id: m.organization_id,
      name: (m.organizations as { name?: string } | null)?.name ?? "—",
      role: m.role as MemberRole,
      accepted: m.accepted_at !== null,
    });
    orgsByUser.set(m.user_id, list);

    const ids = orgIdsByUser.get(m.user_id) ?? [];
    ids.push(m.organization_id);
    orgIdsByUser.set(m.user_id, ids);
  }

  const subjectCountByUser = new Map<string, number>();
  for (const s of series ?? []) {
    if (!s.subject_user_id) continue;
    subjectCountByUser.set(s.subject_user_id, (subjectCountByUser.get(s.subject_user_id) ?? 0) + 1);
  }

  // Pre-sorted desc, so the first hit per org is already the max.
  const lastActivityByOrg = new Map<string, string>();
  for (const iv of interviews ?? []) {
    if (!lastActivityByOrg.has(iv.organization_id)) {
      lastActivityByOrg.set(iv.organization_id, iv.started_at);
    }
  }

  let rows: PlatformUserRow[] = (users ?? []).map((u) => {
    const orgIds = orgIdsByUser.get(u.id) ?? [];
    const lastActivity = orgIds.reduce<string | null>((latest, orgId) => {
      const at = lastActivityByOrg.get(orgId);
      if (!at) return latest;
      if (!latest || new Date(at) > new Date(latest)) return at;
      return latest;
    }, null);

    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      orgs: orgsByUser.get(u.id) ?? [],
      subjectOfCount: subjectCountByUser.get(u.id) ?? 0,
      lastActivity,
      createdAt: u.created_at,
    };
  });

  if (search) {
    rows = rows.filter(
      (r) => r.email.toLowerCase().includes(search) || (r.displayName?.toLowerCase().includes(search) ?? false),
    );
  }

  rows.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });

  const total = rows.length;
  return { rows: rows.slice(offset, offset + limit), total };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/__tests__/platform-users.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/db/queries/admin.ts src/db/__tests__/platform-users.test.ts
git commit -m "feat(super): listPlatformUsers query"
```

---

### Task 4: Users list page at `/super`

Reuses the accounts list's exact composition — stat tiles, search, table — so the two tabs read as siblings (spec §"Look & feel").

**Files:**
- Modify: `src/app/super/page.tsx` (replace the Task 2 redirect placeholder)
- Modify: `src/app/super/OpNav.tsx` (add the Users tab)

**Interfaces:**
- Consumes: `listPlatformUsers`, `PlatformUserRow` (Task 3); `getPlatformStats` (existing).
- Produces: route `/super` rendering the users table; each row links to `/super/users/[id]`.

- [ ] **Step 1: Replace the placeholder page**

Replace `src/app/super/page.tsx` in full:

```tsx
import Link from "next/link";
import { getPlatformStats, listPlatformUsers } from "@/db/queries/admin";
import { relativeTime } from "@/lib/time";

export const metadata = { title: "Users — Operator — PostAud.io" };

type SearchParams = Promise<{ q?: string; offset?: string }>;

function StatTile({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-[#111]">
      <div className="font-serif text-[28px] leading-tight text-neutral-900 dark:text-white">
        {n.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[12px] text-neutral-500">{label}</div>
    </div>
  );
}

export default async function SuperUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, offset: offsetStr } = await searchParams;
  const offset = Number.isFinite(Number(offsetStr)) && Number(offsetStr) > 0 ? Number(offsetStr) : 0;
  const pageSize = 50;

  const [stats, { rows, total }] = await Promise.all([
    getPlatformStats(),
    listPlatformUsers({ search: q, limit: pageSize, offset }),
  ]);

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return qs ? `/super?${qs}` : "/super";
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">Users</h1>
          <p className="mt-1 text-[13.5px] text-neutral-500">Everyone on the platform.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11.5px] font-medium text-neutral-600 dark:bg-white/5 dark:text-neutral-400">
          Metadata only — content requires impersonation
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatTile n={stats.totalUsers} label="users" />
        <StatTile n={stats.activeSeries} label="active series" />
        <StatTile n={stats.interviewsThisWeek} label="interviews this week" />
        <StatTile n={stats.totalFacts} label="facts extracted, all time" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <form className="ml-auto w-full max-w-xs sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] text-neutral-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-neutral-700 dark:bg-[#1c1c1e] dark:text-white"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#111]">
        <table className="w-full min-w-[880px] text-[13.5px]">
          <thead className="bg-neutral-50 text-left text-neutral-600 dark:bg-[#161616] dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Accounts</th>
              <th className="px-4 py-3 font-medium">Subject of</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-neutral-500">
                  No users match.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-neutral-50 dark:hover:bg-[#161616]">
                <td className="px-4 py-3">
                  <Link
                    href={`/super/users/${u.id}`}
                    className="font-medium text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
                    {u.displayName ?? u.email.split("@")[0]}
                  </Link>
                  <div className="text-[12px] text-neutral-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {u.orgs.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {u.orgs.map((o) => (
                        <Link
                          key={o.id}
                          href={`/super/accounts/${o.id}`}
                          className={
                            "rounded-full px-2 py-0.5 text-[11.5px] font-medium " +
                            (o.accepted
                              ? "bg-neutral-100 text-neutral-600 hover:text-emerald-700 dark:bg-white/10 dark:text-neutral-300"
                              : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300")
                          }
                          title={o.accepted ? o.role : `${o.role} · invited, not accepted`}
                        >
                          {o.name} · {o.role}
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-900 dark:text-white">
                  {u.subjectOfCount === 0 ? <span className="text-neutral-400">—</span> : u.subjectOfCount}
                </td>
                <td className="px-4 py-3 text-neutral-500">{relativeTime(u.lastActivity)}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-neutral-500">
        <div>
          Showing {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length} of {total} users · sorted by last
          activity
        </div>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={pageHref(Math.max(0, offset - pageSize))}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-[#161616]"
            >
              Previous
            </Link>
          )}
          {offset + rows.length < total && (
            <Link
              href={pageHref(offset + pageSize)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-[#161616]"
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

**Note:** `relativeTime` is typed `(iso: string | null) => string`, so passing a null `lastActivity` is safe.

- [ ] **Step 2: Add the Users tab**

In `src/app/super/OpNav.tsx`, `/super` is an exact-match route (`/super/users/x` should highlight Users, but `/super/accounts` must not highlight it), so it needs the same exact-match special case the old nav used for `/admin`:

```tsx
const ITEMS = [
  { href: "/super", label: "Users" },
  { href: "/super/accounts", label: "Accounts" },
  { href: "/super/series", label: "Series" },
];

export function OpNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active =
          item.href === "/super"
            ? pathname === "/super" || pathname?.startsWith("/super/users")
            : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md px-3 py-1.5 text-[13px] font-semibold text-[#F7F5F0] bg-white/10"
                : "rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/55 hover:text-[#F7F5F0]"
            }
          >
            {item.label}
          </Link>
        );
      })}
      <span
        className="cursor-default select-none rounded-md px-3 py-1.5 text-[13px] font-semibold text-white/30"
        title="Coming soon"
      >
        Activity
      </span>
    </nav>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run lint
npm test
npm run build
```
Expected: clean; `/super` builds as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add src/app/super/page.tsx src/app/super/OpNav.tsx
git commit -m "feat(super): platform users list at /super"
```

---

### Task 5: Real impersonation — server module and API routes

**Files:**
- Create: `src/server/super/impersonate.ts`
- Create: `src/app/api/super/impersonate/route.ts`
- Create: `src/app/api/super/impersonate/exit/route.ts`
- Modify: `src/proxy.ts` (carve the exit route out of the admin gate)
- Test: `src/server/super/__tests__/impersonate.test.ts`

**Interfaces:**
- Consumes: `collectAuthCookies`, `packStash`, `unpackStash`, `prevChunkNames`, `encodeSession`, `readImpersonation`, `IMP_COOKIE`, `PREV_COOKIE`, `type CookiePair`, `type ImpersonationSession` (Task 1); `platformAdminEmail` (existing); `serviceClient` (existing).
- Produces:
  - `mintSessionToken(targetUserId: string): Promise<{ tokenHash: string; email: string } | null>` — null when the user doesn't exist
  - `logImpersonationStart(a: { adminEmail: string; targetUserId: string; targetEmail: string; organizationId: string | null }): Promise<void>`
  - `logImpersonationEnd(a: { adminEmail: string; targetUserId: string; targetEmail: string; durationSeconds: number }): Promise<void>`
  - `primaryOrgId(targetUserId: string): Promise<string | null>`
  - `POST /api/super/impersonate` — body `{ userId }`, returns `{ ok: true, redirect: "/app" }`
  - `POST /api/super/impersonate/exit` — no body, returns `{ ok: true, redirect: string }`

- [ ] **Step 1: Write the failing test**

Create `src/server/super/__tests__/impersonate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { logImpersonationEnd, logImpersonationStart, mintSessionToken, primaryOrgId } from "../impersonate";

type Insert = Record<string, unknown>;

function makeSvc(opts: {
  user?: { id: string; email: string } | null;
  membership?: { organization_id: string } | null;
  generateLink?: { data: unknown; error: unknown };
  inserts?: Insert[];
}) {
  const inserts = opts.inserts ?? [];
  const table = (row: unknown) => {
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      order: () => obj,
      limit: () => obj,
      maybeSingle: () => Promise.resolve({ data: row, error: null }),
      insert: (r: Insert) => {
        inserts.push(r);
        return Promise.resolve({ error: null });
      },
    };
    return obj;
  };
  return {
    inserts,
    from: (t: string) => {
      if (t === "users") return table(opts.user ?? null);
      if (t === "memberships") return table(opts.membership ?? null);
      return table(null);
    },
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue(
          opts.generateLink ?? { data: { properties: { hashed_token: "tok_123" } }, error: null },
        ),
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("mintSessionToken", () => {
  it("returns the hashed token and the target's email", async () => {
    const svc = makeSvc({ user: { id: "u1", email: "jane@example.com" } });
    mocks.serviceClient.mockReturnValue(svc);

    await expect(mintSessionToken("u1")).resolves.toEqual({
      tokenHash: "tok_123",
      email: "jane@example.com",
    });
    expect(svc.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "jane@example.com",
    });
  });

  it("returns null when the user does not exist", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ user: null }));
    await expect(mintSessionToken("nope")).resolves.toBeNull();
  });

  it("returns null when Supabase refuses to generate a link", async () => {
    mocks.serviceClient.mockReturnValue(
      makeSvc({
        user: { id: "u1", email: "jane@example.com" },
        generateLink: { data: null, error: { message: "boom" } },
      }),
    );
    await expect(mintSessionToken("u1")).resolves.toBeNull();
  });
});

describe("primaryOrgId", () => {
  it("returns the user's org when they have one", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ membership: { organization_id: "o1" } }));
    await expect(primaryOrgId("u1")).resolves.toBe("o1");
  });

  it("returns null when the user belongs to no org", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ membership: null }));
    await expect(primaryOrgId("u1")).resolves.toBeNull();
  });
});

describe("audit logging", () => {
  it("writes a started row naming the admin as actor and the user as target", async () => {
    const svc = makeSvc({});
    mocks.serviceClient.mockReturnValue(svc);

    await logImpersonationStart({
      adminEmail: "nick@pixelocity.com",
      targetUserId: "u1",
      targetEmail: "jane@example.com",
      organizationId: "o1",
    });

    expect(svc.inserts).toHaveLength(1);
    expect(svc.inserts[0]).toMatchObject({
      action: "admin.impersonation_started",
      actor_email: "nick@pixelocity.com",
      target_type: "user",
      target_id: "u1",
      organization_id: "o1",
    });
  });

  it("writes an ended row carrying the session duration", async () => {
    const svc = makeSvc({});
    mocks.serviceClient.mockReturnValue(svc);

    await logImpersonationEnd({
      adminEmail: "nick@pixelocity.com",
      targetUserId: "u1",
      targetEmail: "jane@example.com",
      durationSeconds: 90,
    });

    expect(svc.inserts[0]).toMatchObject({
      action: "admin.impersonation_ended",
      actor_email: "nick@pixelocity.com",
      target_type: "user",
      target_id: "u1",
    });
    expect((svc.inserts[0].meta as { durationSeconds: number }).durationSeconds).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/super/__tests__/impersonate.test.ts`
Expected: FAIL — `Failed to resolve import "../impersonate"`.

- [ ] **Step 3: Write the server module**

Create `src/server/super/impersonate.ts`:

```ts
import "server-only";
import { serviceClient } from "@/db/service";

/**
 * Mints a one-time magic-link token for the target user. `generateLink` does
 * NOT send an email — it only returns the token — and it does not invalidate
 * the target's existing sessions. They stay logged in and are never notified
 * by Supabase; the audit log is the record of record.
 *
 * Returns null when the user doesn't exist or Supabase refuses.
 */
export async function mintSessionToken(
  targetUserId: string,
): Promise<{ tokenHash: string; email: string } | null> {
  const svc = serviceClient();

  const { data: user } = await svc.from("users").select("id, email").eq("id", targetUserId).maybeSingle();
  if (!user?.email) return null;

  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  const tokenHash = (data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
  if (error || !tokenHash) return null;

  return { tokenHash, email: user.email };
}

/** The org an impersonation is attributed to in the audit log. Null if the user has none. */
export async function primaryOrgId(targetUserId: string): Promise<string | null> {
  const svc = serviceClient();
  const { data } = await svc
    .from("memberships")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function logImpersonationStart(a: {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  organizationId: string | null;
}): Promise<void> {
  const svc = serviceClient();
  await svc.from("audit_logs").insert({
    organization_id: a.organizationId,
    target_type: "user",
    target_id: a.targetUserId,
    action: "admin.impersonation_started",
    actor_email: a.adminEmail,
    meta: { targetEmail: a.targetEmail },
  });
}

export async function logImpersonationEnd(a: {
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  durationSeconds: number;
}): Promise<void> {
  const svc = serviceClient();
  await svc.from("audit_logs").insert({
    target_type: "user",
    target_id: a.targetUserId,
    action: "admin.impersonation_ended",
    actor_email: a.adminEmail,
    meta: { targetEmail: a.targetEmail, durationSeconds: a.durationSeconds },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/super/__tests__/impersonate.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the start route**

Create `src/app/api/super/impersonate/route.ts`. The cookie adapter writes onto an explicit `NextResponse`, mirroring the pattern in `src/proxy.ts` — that's the reliable way to set auth cookies from a route handler.

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { platformAdminEmail } from "@/lib/auth/is-platform-admin";
import {
  collectAuthCookies,
  encodeSession,
  IMP_COOKIE,
  packStash,
} from "@/lib/auth/impersonation";
import { logImpersonationStart, mintSessionToken, primaryOrgId } from "@/server/super/impersonate";

/**
 * Starts an operator impersonation session: swaps the browser onto the target
 * user's real Supabase session, after stashing the operator's own auth cookies
 * so /api/super/impersonate/exit can put them back.
 *
 * The operator has FULL user powers while impersonating — no write guardrails,
 * by design. The banner and the audit log are the safety net.
 */
export async function POST(req: NextRequest) {
  // Admin surfaces 404, never 403/401, so their existence isn't disclosed.
  const adminEmail = await platformAdminEmail();
  if (!adminEmail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
  }

  const minted = await mintSessionToken(userId);
  if (!minted) {
    return NextResponse.json({ ok: false, error: "Could not start session for that user" }, { status: 400 });
  }

  // Capture the operator's cookies from the REQUEST before verifyOtp writes the
  // target's cookies to the RESPONSE. Request cookies are unaffected by
  // response writes, so ordering within this handler is safe.
  const prevAuth = collectAuthCookies(req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })));

  const response = NextResponse.json({ ok: true, redirect: "/app" });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: minted.tokenHash });
  if (error) {
    // Nothing was stashed and the operator's own cookies are untouched.
    return NextResponse.json({ ok: false, error: "Session swap failed" }, { status: 500 });
  }

  const secure = process.env.NODE_ENV === "production";
  for (const chunk of packStash(prevAuth)) {
    response.cookies.set(chunk.name, chunk.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    });
  }
  response.cookies.set(
    IMP_COOKIE,
    encodeSession({
      adminEmail,
      targetUserId: userId,
      targetEmail: minted.email,
      startedAt: Date.now(),
    }),
    { httpOnly: true, secure, sameSite: "lax", path: "/" },
  );

  await logImpersonationStart({
    adminEmail,
    targetUserId: userId,
    targetEmail: minted.email,
    organizationId: await primaryOrgId(userId),
  });

  return response;
}
```

- [ ] **Step 6: Write the exit route**

Create `src/app/api/super/impersonate/exit/route.ts`.

```ts
import { NextResponse, type NextRequest } from "next/server";
import {
  collectAuthCookies,
  IMP_COOKIE,
  prevChunkNames,
  readImpersonation,
  unpackStash,
} from "@/lib/auth/impersonation";
import { logImpersonationEnd } from "@/server/super/impersonate";

/**
 * Ends an impersonation session by restoring the operator's stashed cookies.
 *
 * Deliberately NOT admin-gated: at the moment of exit the caller's session is
 * the TARGET USER's, not an admin's. Authorization is possession of the
 * `pa_op_prev` cookie — which is safe because that cookie holds a session the
 * caller demonstrably already had. This route restores a session; it can never
 * mint one, so a forged cookie yields nothing.
 */
export async function POST(req: NextRequest) {
  const all = req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
  const session = readImpersonation(all);
  const stashed = unpackStash(all);

  if (!session || !stashed) {
    return NextResponse.json({ ok: false, error: "not_impersonating" }, { status: 400 });
  }

  const secure = process.env.NODE_ENV === "production";
  const restoreFailed = stashed.length === 0;

  const response = NextResponse.json({
    ok: true,
    redirect: restoreFailed ? "/sign-in" : `/super/users/${session.targetUserId}`,
  });

  // Overwrite the target user's auth cookies with the operator's own. Nothing
  // is minted here — these are the exact values the browser held before.
  for (const pair of stashed) {
    response.cookies.set(pair.name, pair.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    });
  }

  // If we stashed nothing, the operator has no session to go back to — clear
  // the target's cookies so they aren't left logged in as the customer.
  if (restoreFailed) {
    for (const c of collectAuthCookies(all)) {
      response.cookies.delete(c.name);
    }
  }

  for (const name of prevChunkNames(all)) {
    response.cookies.delete(name);
  }
  response.cookies.delete(IMP_COOKIE);

  await logImpersonationEnd({
    adminEmail: session.adminEmail,
    targetUserId: session.targetUserId,
    targetEmail: session.targetEmail,
    durationSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
  });

  return response;
}
```

- [ ] **Step 7: Carve the exit route out of the middleware gate**

In `src/proxy.ts`, the `/api/super` gate added in Task 2 would 404 the exit route, because the caller is the impersonated user, not an admin. Replace the gate block:

```ts
  // Gate /super and /api/super — non-admins get 404, never 403. We return 404
  // rather than redirecting so the console's existence is not disclosed.
  //
  // EXCEPTION: the impersonation exit route must stay reachable while
  // impersonating, when the caller's session belongs to the target user and is
  // NOT an admin. It authorizes on possession of the `pa_op_prev` cookie
  // instead — safe, because that cookie is a session the caller already had.
  const path = request.nextUrl.pathname;
  const isExitRoute = path === "/api/super/impersonate/exit";
  if ((path.startsWith("/super") || path.startsWith("/api/super")) && !isExitRoute) {
    // Intentionally NOT using platformAdminEmails() from @/lib/env —
    // middleware runtime can't carry Zod. Keep in sync with src/lib/env.ts.
    const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = user?.email?.toLowerCase() ?? "";
    if (!email || !adminEmails.includes(email)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }
```

- [ ] **Step 8: Verify**

```bash
npm run lint
npm test
npm run build
```
Expected: clean; routes `/api/super/impersonate` and `/api/super/impersonate/exit` appear in the build output.

- [ ] **Step 9: Commit**

```bash
git add src/server/super src/app/api/super src/proxy.ts
git commit -m "feat(super): real impersonation — session swap in, cookie restore out"
```

---

### Task 6: User detail page and the Impersonate button

**Files:**
- Modify: `src/db/queries/admin.ts` (append `getPlatformUserDetail`)
- Create: `src/app/super/users/[id]/page.tsx`
- Create: `src/components/super/ImpersonateButton.tsx`
- Modify: `src/app/super/page.tsx` (add an Impersonate action column)
- Test: `src/db/__tests__/platform-user-detail.test.ts`

**Interfaces:**
- Consumes: `PlatformUserOrg` (Task 3); `POST /api/super/impersonate` (Task 5).
- Produces:

```ts
export type PlatformUserDetail = {
  user: { id: string; email: string; displayName: string | null; createdAt: string };
  orgs: PlatformUserOrg[];
  seriesOwned: Array<{ id: string; title: string; organizationId: string }>;
  seriesSubjectOf: Array<{ id: string; title: string; organizationId: string }>;
  interviewCount: number;
  factCount: number;
  auditLog: Array<{ id: number; at: string; action: string; actorEmail: string | null }>;
};
export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null>;
```
- `<ImpersonateButton userId={string} label?: string />` — client component.

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/platform-user-detail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { getPlatformUserDetail } from "../queries/admin";

/**
 * getPlatformUserDetail reads one user (maybeSingle) plus several filtered
 * lists. Head-count queries resolve to { count }, list queries to { data }.
 */
function makeSvc(tables: Record<string, unknown>) {
  const chain = (value: unknown) => {
    const result = Promise.resolve(
      typeof value === "number" ? { count: value, error: null } : { data: value, error: null },
    );
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      in: () => obj,
      or: () => obj,
      order: () => obj,
      limit: () => result,
      maybeSingle: () => Promise.resolve({ data: value, error: null }),
      then: (...a: unknown[]) => (result.then as (...x: unknown[]) => unknown)(...a),
    };
    return obj;
  };
  // interviews and facts are asked for counts; everything else for rows.
  return {
    from: (t: string) => chain(tables[t] ?? (t === "interviews" || t === "facts" ? 0 : [])),
  };
}

const BASE = {
  users: { id: "u1", email: "jane@example.com", display_name: "Jane", created_at: "2026-01-01T00:00:00Z" },
  memberships: [
    { organization_id: "o1", role: "admin", accepted_at: "2026-01-02T00:00:00Z", organizations: { name: "Acme" } },
  ],
  series: [
    { id: "s1", title: "Dad's stories", organization_id: "o1", created_by: "u1", subject_user_id: null },
    { id: "s2", title: "Her story", organization_id: "o1", created_by: "u9", subject_user_id: "u1" },
  ],
  interviews: 4,
  facts: 17,
  audit_logs: [
    { id: 1, at: "2026-06-01T00:00:00Z", action: "admin.impersonation_started", actor_email: "nick@pixelocity.com" },
  ],
};

beforeEach(() => mocks.serviceClient.mockReturnValue(makeSvc(BASE)));

describe("getPlatformUserDetail", () => {
  it("returns the user profile", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.user).toEqual({
      id: "u1",
      email: "jane@example.com",
      displayName: "Jane",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("splits series into owned and subject-of", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.seriesOwned.map((s) => s.id)).toEqual(["s1"]);
    expect(d.seriesSubjectOf.map((s) => s.id)).toEqual(["s2"]);
  });

  it("returns org memberships with role and accepted state", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.orgs).toEqual([{ id: "o1", name: "Acme", role: "admin", accepted: true }]);
  });

  it("returns interview and fact counts", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.interviewCount).toBe(4);
    expect(d.factCount).toBe(17);
  });

  it("returns the audit trail", async () => {
    const d = (await getPlatformUserDetail("u1"))!;
    expect(d.auditLog).toHaveLength(1);
    expect(d.auditLog[0].action).toBe("admin.impersonation_started");
  });

  it("returns null for an unknown user", async () => {
    mocks.serviceClient.mockReturnValue(makeSvc({ ...BASE, users: null }));
    await expect(getPlatformUserDetail("nope")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/platform-user-detail.test.ts`
Expected: FAIL — `getPlatformUserDetail is not a function`.

- [ ] **Step 3: Implement the query**

Append to `src/db/queries/admin.ts`:

```ts
export type PlatformUserDetail = {
  user: { id: string; email: string; displayName: string | null; createdAt: string };
  orgs: PlatformUserOrg[];
  seriesOwned: Array<{ id: string; title: string; organizationId: string }>;
  seriesSubjectOf: Array<{ id: string; title: string; organizationId: string }>;
  interviewCount: number;
  factCount: number;
  auditLog: Array<{ id: number; at: string; action: string; actorEmail: string | null }>;
};

export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null> {
  const svc = serviceClient();

  const { data: user } = await svc
    .from("users")
    .select("id, email, display_name, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return null;

  const [{ data: memberships }, { data: series }, { count: interviewCount }, { data: audit }] = await Promise.all([
    svc
      .from("memberships")
      .select("organization_id, role, accepted_at, organizations ( name )")
      .eq("user_id", userId),
    // Titles only — never transcript or fact content.
    svc
      .from("series")
      .select("id, title, organization_id, created_by, subject_user_id")
      .or(`created_by.eq.${userId},subject_user_id.eq.${userId}`),
    // `conducted_by` is the interviews table's per-user column (0001_init.sql).
    svc.from("interviews").select("id", { count: "exact", head: true }).eq("conducted_by", userId),
    svc
      .from("audit_logs")
      .select("id, at, action, actor_email")
      .or(`actor_user_id.eq.${userId},target_id.eq.${userId}`)
      .order("at", { ascending: false })
      .limit(25),
  ]);

  const seriesIds = (series ?? []).map((s) => s.id);
  // Counting only — never select `statement`.
  const { count: factCount } = seriesIds.length
    ? await svc.from("facts").select("id", { count: "exact", head: true }).in("series_id", seriesIds)
    : { count: 0 };

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    orgs: (memberships ?? []).map((m) => ({
      id: m.organization_id,
      name: (m.organizations as { name?: string } | null)?.name ?? "—",
      role: m.role as MemberRole,
      accepted: m.accepted_at !== null,
    })),
    seriesOwned: (series ?? [])
      .filter((s) => s.created_by === userId)
      .map((s) => ({ id: s.id, title: s.title, organizationId: s.organization_id })),
    seriesSubjectOf: (series ?? [])
      .filter((s) => s.subject_user_id === userId)
      .map((s) => ({ id: s.id, title: s.title, organizationId: s.organization_id })),
    interviewCount: interviewCount ?? 0,
    factCount: factCount ?? 0,
    auditLog: (audit ?? []).map((a) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      actorEmail: a.actor_email,
    })),
  };
}
```

**Note:** `interviews.conducted_by` is nullable — a hand-the-mic session conducted by a no-account subject has none. So `interviewCount` means "interviews this user personally conducted," which is the intended meaning.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/__tests__/platform-user-detail.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the Impersonate button**

Create `src/components/super/ImpersonateButton.tsx`. Styling is `.btn-impersonate` from the mockup — green border, card background, `⚿` glyph.

```tsx
"use client";

import { useState } from "react";

export function ImpersonateButton({ userId, label = "⚿ Log in as user" }: { userId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch("/api/super/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "failed");
      // Full reload, not a client nav — the auth cookies just changed and every
      // cached server payload in the router belongs to the operator, not the
      // user we're now impersonating.
      window.location.href = json.redirect ?? "/app";
    } catch {
      setState("error");
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-lg border border-emerald-600/50 bg-white px-3.5 py-2 text-[13px] font-medium text-emerald-800 hover:border-emerald-700 disabled:opacity-60 dark:bg-[#111] dark:text-emerald-300"
      >
        {state === "loading" ? "Starting…" : label}
      </button>
      {state === "error" && <span className="text-[11.5px] text-rose-600">Could not start session.</span>}
    </div>
  );
}
```

- [ ] **Step 6: Write the user detail page**

Create `src/app/super/users/[id]/page.tsx`. Reuses the account-detail layout: avatar + meta-row chip header, two-column card grid.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformUserDetail } from "@/db/queries/admin";
import { ImpersonateButton } from "@/components/super/ImpersonateButton";

type Params = Promise<{ id: string }>;

export const metadata = { title: "User — Operator — PostAud.io" };

function SeriesList({ rows, empty }: { rows: Array<{ id: string; title: string }>; empty: string }) {
  if (rows.length === 0) return <p className="py-3 text-[13px] text-neutral-400">{empty}</p>;
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {rows.map((s) => (
        <div key={s.id} className="truncate py-2.5 font-serif text-[15px] text-neutral-900 dark:text-white">
          {s.title}
        </div>
      ))}
    </div>
  );
}

export default async function SuperUserDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await getPlatformUserDetail(id);
  if (!detail) notFound();
  const { user, orgs, seriesOwned, seriesSubjectOf, interviewCount, factCount, auditLog } = detail;

  const name = user.displayName ?? user.email.split("@")[0];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-7">
      <div>
        <Link href="/super" className="text-[12.5px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          Users
        </Link>
        <span className="mx-1.5 text-[12.5px] text-neutral-400">/</span>
        <span className="text-[12.5px] text-neutral-500">{user.email}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[14px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {initials}
            </span>
            <h1 className="font-serif text-[26px] text-neutral-900 dark:text-white">{name}</h1>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {user.email}
            </span>
            <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <span className="text-neutral-400 dark:text-neutral-500">Joined </span>
              {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <ImpersonateButton userId={user.id} />
            <a
              href={`mailto:${user.email}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 px-3.5 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              ✉ Email
            </a>
          </div>
          <span className="text-[11.5px] text-neutral-400 dark:text-neutral-600">
            every impersonation is logged
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.1fr_1.4fr]">
        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Accounts</h3>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {orgs.length === 0 && <p className="py-3 text-[13px] text-neutral-400">Belongs to no account.</p>}
              {orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/super/accounts/${o.id}`}
                    className="truncate text-[13.5px] font-semibold text-neutral-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400"
                  >
                    {o.name}
                  </Link>
                  <span className="flex-shrink-0 text-[12px] capitalize text-neutral-500">
                    {o.role}
                    {!o.accepted && " · invited"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Activity</h3>
            <dl className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {[
                ["Interviews", String(interviewCount)],
                ["Facts on file", String(factCount)],
                ["Series owned", String(seriesOwned.length)],
                ["Subject of", String(seriesSubjectOf.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between py-2 text-[13.5px]">
                  <span className="text-neutral-500">{k}</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{v}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Series they own</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Titles only — content requires impersonation.</p>
            <div className="mt-2">
              <SeriesList rows={seriesOwned} empty="No series created." />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Series they are the subject of</h3>
            <div className="mt-2">
              <SeriesList rows={seriesSubjectOf} empty="Not the subject of any series." />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-[#111]">
            <h3 className="font-serif text-[16px] text-neutral-900 dark:text-white">Recent activity</h3>
            <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
              {auditLog.length === 0 && <p className="py-3 text-[13px] text-neutral-400">No audit entries.</p>}
              {auditLog.map((a) => (
                <div key={a.id} className="flex gap-3 py-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <div className="text-[13px] text-neutral-800 dark:text-neutral-200">{a.action}</div>
                    <div className="text-[11.5px] text-neutral-400">
                      {new Date(a.at).toLocaleString()}
                      {a.actorEmail && ` · ${a.actorEmail}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add the Impersonate action to the users list**

In `src/app/super/page.tsx`, import the button:

```tsx
import { ImpersonateButton } from "@/components/super/ImpersonateButton";
```

Add a trailing header cell after `Joined`:

```tsx
              <th className="px-4 py-3 font-medium"></th>
```

Bump the empty-state `colSpan` from 5 to 6, and add a trailing cell to each row after the `Joined` cell:

```tsx
                <td className="px-4 py-3 text-right">
                  <ImpersonateButton userId={u.id} label="⚿ Log in as" />
                </td>
```

- [ ] **Step 8: Verify**

```bash
npm run lint
npm test
npm run build
```
Expected: clean; `/super/users/[id]` in the build output.

- [ ] **Step 9: Commit**

```bash
git add src/db/queries/admin.ts src/db/__tests__/platform-user-detail.test.ts src/app/super src/components/super
git commit -m "feat(super): user detail page and log-in-as button"
```

---

### Task 7: Impersonation banner and the sidebar entry point

Closes the loop: the operator can now reach the console from the app, and get *out* of an impersonation session.

**Files:**
- Create: `src/components/ImpersonationBanner.tsx`
- Modify: `src/app/app/layout.tsx`
- Modify: `src/components/nav/Sidebar.tsx`

**Interfaces:**
- Consumes: `readImpersonation`, `isExpired` (Task 1); `POST /api/super/impersonate/exit` (Task 5); `isPlatformAdmin` (existing).
- Produces: `<ImpersonationBanner session={ImpersonationSession} expired={boolean} />`; `<Sidebar isPlatformAdmin={boolean} …>`.

- [ ] **Step 1: Write the banner**

Create `src/components/ImpersonationBanner.tsx`. Amber — the one warning color in the design system (`.badge-amber` in the mockup).

```tsx
"use client";

import { useState } from "react";
import type { ImpersonationSession } from "@/lib/auth/impersonation";

export function ImpersonationBanner({
  session,
  expired,
}: {
  session: ImpersonationSession;
  expired: boolean;
}) {
  const [leaving, setLeaving] = useState(false);

  async function exit() {
    setLeaving(true);
    try {
      const res = await fetch("/api/super/impersonate/exit", { method: "POST" });
      const json = await res.json();
      // Full reload — the auth cookies just changed back to the operator's.
      window.location.href = json.redirect ?? "/super";
    } catch {
      window.location.href = "/sign-in";
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 bg-amber-100 px-6 py-2.5 text-[13px] text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
      <span aria-hidden>⚠</span>
      <span>
        {expired ? (
          <>
            Operator session expired — you are still signed in as{" "}
            <b className="font-semibold">{session.targetEmail}</b>.
          </>
        ) : (
          <>
            Operator session — you are viewing as <b className="font-semibold">{session.targetEmail}</b>.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="ml-auto rounded-md border border-amber-950/30 px-2.5 py-1 font-semibold hover:bg-amber-950/10 disabled:opacity-60 dark:border-amber-100/40 dark:hover:bg-amber-100/10"
      >
        {leaving ? "Exiting…" : "Exit →"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount the banner and pass the admin flag**

Replace `src/app/app/layout.tsx` in full. The banner is a full-width strip *above* the app chrome, so it pushes content down and can never obscure anything.

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { Sidebar } from "@/components/nav/Sidebar";
import { getViewer } from "@/db/queries";
import { isPlatformAdmin } from "@/lib/auth/is-platform-admin";
import { isExpired, readImpersonation } from "@/lib/auth/impersonation";
import { ROLE_LABELS } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, role, acceptedAt } = await getViewer();

  // Invited members must finish the /welcome accept flow (set password, see
  // role + accessible series, accept) before reaching anything under /app —
  // enforced centrally here so no individual page/route can be missed.
  // `/welcome` itself lives outside `/app` (not wrapped by this layout), so
  // this can't loop.
  if (organization && !acceptedAt) {
    redirect("/welcome");
  }

  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "You";
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "Member";

  const cookieStore = await cookies();
  const impersonation = readImpersonation(
    cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
  );

  // While impersonating, the session belongs to the target user — who is not
  // an admin — so this is false and the Operator link hides itself. No
  // special-casing needed.
  const platformAdmin = await isPlatformAdmin();

  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      {impersonation && (
        <ImpersonationBanner session={impersonation} expired={isExpired(impersonation, Date.now())} />
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar name={name} role={roleLabel} isPlatformAdmin={platformAdmin} />
        <main className="min-w-0 flex-1 px-9 py-[30px] pb-11">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the Operator link to the sidebar**

In `src/components/nav/Sidebar.tsx`, extend `Props` and render a Platform group when the flag is set. Change the props type and signature:

```tsx
type Props = {
  name: string;
  role: string;
  isPlatformAdmin?: boolean;
};
```

```tsx
export function Sidebar({ name, role, isPlatformAdmin = false }: Props) {
```

Then insert this block immediately after the `youItems.map(...)` render and before `<div className="flex-1" />`:

```tsx
      {isPlatformAdmin && (
        <>
          <div className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">
            Platform
          </div>
          <NavItem href="/super" label="Operator console" icon="⚿" />
        </>
      )}
```

**Careful:** `NavItem` calls `usePathname()` and compares with `pathname.startsWith(href)`. `/super` is never a pathname inside `/app`, so it simply never renders active. That's correct — no change needed to `NavItem`.

- [ ] **Step 4: Verify**

```bash
npm run lint
npm test
npm run build
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImpersonationBanner.tsx src/app/app/layout.tsx src/components/nav/Sidebar.tsx
git commit -m "feat(super): impersonation banner and operator sidebar link"
```

---

### Task 8: End-to-end manual verification

The session swap needs a real Supabase — it cannot be unit-tested. This task is the gate before the branch is considered done.

**Files:** none (verification only).

- [ ] **Step 1: Confirm the env is set**

```bash
grep PLATFORM_ADMIN_EMAILS .env.local
```
Expected: contains `nick@pixelocity.com`. If absent, add it — every `/super` route will 404 without it.

- [ ] **Step 2: Start the dev server**

```bash
rm -rf .next && npm run dev
```

- [ ] **Step 3: Walk the flow** (spec §Testing, manual)

Use the `/verify` skill to drive this in a real browser:

1. Sign in as the admin → **Operator console** appears at the bottom of the `/app` sidebar.
2. Click it → `/super` lists users with stat tiles.
3. Click a user → `/super/users/[id]` shows their accounts, series, counts.
4. Click **⚿ Log in as user** → lands on `/app` as that user. The amber banner names *their* email. The sidebar's Operator link is **gone**.
5. Navigate to `/super` manually → **404**.
6. Click **Exit →** in the banner → back at `/super/users/[id]` as the admin, banner gone, Operator link back.
7. Sign in as a non-admin → `/super` 404s and there is no sidebar link.

- [ ] **Step 4: Confirm the audit trail**

Query via the Supabase MCP tool or SQL editor:

```sql
select action, actor_email, target_type, target_id, meta, at
from audit_logs
where action like 'admin.impersonation%'
order by at desc
limit 10;
```
Expected: a matched `admin.impersonation_started` / `admin.impersonation_ended` pair, both with `actor_email` = the admin, `target_type` = `user`, `target_id` = the impersonated user's id, and a `durationSeconds` in the ended row's `meta`.

- [ ] **Step 5: Confirm `/admin` is gone**

Visit `/admin`, `/admin/accounts`, `/api/admin/impersonation-request` → all 404. No redirect to `/super`.

- [ ] **Step 6: Final commit and push**

```bash
npm run lint && npm test && npm run build
git add -A
git commit -m "feat(super): super-admin console — users, detail, impersonation"
git push
```
