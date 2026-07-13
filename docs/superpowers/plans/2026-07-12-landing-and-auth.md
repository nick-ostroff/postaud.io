# Landing Page + Auth Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder landing page with a full marketing page that captures waitlist emails, and rebuild the entire auth surface on the warm-paper design system.

**Architecture:** Waitlist writes go through a pure, unit-tested domain module (`src/server/waitlist/`) called by a `"use server"` action — the same pure-logic-plus-thin-action split the codebase already uses for members/invites. The landing page is composed of one file per section under `src/app/(marketing)/`, driven by a single shared content module so the visible FAQ and its JSON-LD cannot drift. The auth pages are restyled onto existing `ui/` primitives with zero changes to auth logic.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), React 19, Tailwind v4 (`@theme inline` tokens), Supabase (`@supabase/ssr` + service-role client), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-12-landing-and-auth-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data. This applies especially to server actions and `metadata`.
- **Design tokens only.** Allowed color classes: `paper`, `paper-2`, `ink`, `ink-soft`, `muted`, `faint`, `green`, `green-deep`, `green-tint`, `mint`, `mint-tint`, `amber`, `amber-tint`, `card`, `line`, `line-strong`, and the `dark-*` tokens (the latter **only** on the landing page's product-demo section). **Banned everywhere in this plan's files:** any `blue-*`, `neutral-*`, `emerald-*`, `rose-*`, `gray-*`, `slate-*` class, and any `dark:` variant.
- **Use the shared primitives** from `src/components/ui/`: `Button` (`variant`: `primary` | `secondary` | `ghost` | `quiet-danger`; `size`: `md` | `big`), `Card` (bare panel — bring your own padding), `Field` (`label`, optional `hint`, wraps children), `Badge`, `Avatar`. Do not hand-roll a button or a panel.
- **Fonts:** `font-serif` (Newsreader) for headings and spoken words; the default sans (Instrument Sans) for UI. The `serif` utility class is already defined in `globals.css`.
- **SSR safety:** No bare `window` / `document` / `localStorage` outside a `useEffect` or a `typeof window !== "undefined"` guard. This deploys to Vercel.
- **Tests:** Vitest only discovers `src/**/__tests__/**/*.test.ts` — note **`.ts`, not `.tsx`**. Logic that must be tested therefore lives in `.ts` modules, not in components. Run with `npm test`.
- **No auth behavior changes.** Tasks 8 and 9 are styling-only. No Supabase call, redirect, route handler, or search-param contract may change.
- **Commit after every task** (per the repo's git workflow rule): `git add -A && git commit -m '<message>' && git push`.

---

## File Structure

**Create:**
- `src/components/ui/Input.tsx` — shared input + `inputClasses` (Task 1)
- `supabase/migrations/0010_waitlist.sql` — waitlist table (Task 2)
- `src/server/waitlist/validate.ts` — pure email validation (Task 3)
- `src/server/waitlist/join.ts` — the service-role insert (Task 3)
- `src/server/waitlist/__tests__/validate.test.ts` (Task 3)
- `src/server/waitlist/__tests__/join.test.ts` (Task 3)
- `src/app/actions.ts` — `"use server"` `joinWaitlistAction` (Task 4)
- `src/components/waitlist/WaitlistForm.tsx` — client form (Task 4)
- `src/app/(marketing)/content.ts` — all landing copy + the FAQ array (Task 5)
- `src/app/(marketing)/__tests__/content.test.ts` — FAQ/JSON-LD consistency (Task 5)
- `src/app/(marketing)/JsonLd.tsx` — FAQPage + SoftwareApplication JSON-LD (Task 5)
- `src/app/(marketing)/Nav.tsx`, `Hero.tsx`, `Stakes.tsx`, `HowItWorks.tsx` (Task 6)
- `src/app/(marketing)/ProductMoment.tsx`, `Benefits.tsx`, `WhoItsFor.tsx`, `Faq.tsx`, `ClosingCta.tsx`, `Footer.tsx` (Task 7)

**Modify:**
- `src/app/app/series/new/formkit.tsx:14-17`, `src/app/app/members/InviteForm.tsx:15`, `src/app/welcome/AcceptForm.tsx:9` — import shared `inputClasses` (Task 1)
- `src/db/types.ts` — add the `waitlist` table to `Database["public"]["Tables"]` (Task 2)
- `src/app/page.tsx` — full rewrite (Tasks 6, 7)
- `src/app/sign-in/page.tsx`, `src/app/sign-in/SignInForm.tsx` — rebuild (Task 8)
- `src/app/sign-up/page.tsx`, `src/app/sign-up/SignUpForm.tsx`, `src/app/auth/reset/page.tsx`, `src/app/auth/update-password/page.tsx`, `src/app/auth/verify/page.tsx` — restyle (Task 9)

---

### Task 1: Shared `Input` primitive

Pure refactor. `inputClasses` is currently defined three separate times with identical content. The auth pages need it too, and a fourth copy is the wrong answer. **No screen may look different after this task** — if one does, the refactor is wrong.

**Files:**
- Create: `src/components/ui/Input.tsx`
- Modify: `src/app/app/series/new/formkit.tsx:14-17`
- Modify: `src/app/app/members/InviteForm.tsx:15`
- Modify: `src/app/welcome/AcceptForm.tsx:9`

**Interfaces:**
- Produces: `inputClasses: string` and `Input: (props: InputHTMLAttributes<HTMLInputElement>) => JSX.Element` from `@/components/ui/Input`. Every later task uses these for text fields.

- [ ] **Step 1: Create the shared component**

Create `src/components/ui/Input.tsx`. The class string is copied **verbatim** from the current `formkit.tsx:15` — do not "improve" it:

```tsx
import type { InputHTMLAttributes } from "react";

/** Matches `.input` in postaudio-mockups.css. */
export const inputClasses =
  "w-full rounded-sm border border-line-strong bg-card px-[13px] py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-green focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-green";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClasses} ${className}`} {...rest} />;
}
```

- [ ] **Step 2: Point `formkit.tsx` at it**

In `src/app/app/series/new/formkit.tsx`, delete the local `inputClasses` definition (lines 14-15) and re-export from the shared module so `QuickCreate.tsx` and `Wizard.tsx` — which import `inputClasses` from `formkit` — keep working untouched:

```tsx
import { inputClasses } from "@/components/ui/Input";

export { inputClasses };
export const textareaClasses = `${inputClasses} min-h-[92px] resize-y`;
```

- [ ] **Step 3: Point the other two files at it**

In `src/app/app/members/InviteForm.tsx`, delete the local `const inputClasses = ...` (line 15) and add `import { inputClasses } from "@/components/ui/Input";` to the imports.

In `src/app/welcome/AcceptForm.tsx`, delete the local `const inputClasses = ...` (line 9) and add the same import.

- [ ] **Step 4: Verify only one definition remains**

Run: `grep -rn "^export const inputClasses\|^const inputClasses" src`
Expected: exactly one line — `src/components/ui/Input.tsx`.

- [ ] **Step 5: Verify nothing broke**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: lint clean, no type errors, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(ui): promote inputClasses to a shared Input primitive" && git push
```

---

### Task 2: Waitlist table

**Files:**
- Create: `supabase/migrations/0010_waitlist.sql`
- Modify: `src/db/types.ts` (add `waitlist` inside `Database["public"]["Tables"]`, alphabetically near the other tables)

**Interfaces:**
- Produces: the `public.waitlist` table, and the `Database` type gains a `waitlist` entry so `serviceClient().from("waitlist")` type-checks in Task 3.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_waitlist.sql`:

```sql
-- 0010: waitlist capture for the marketing landing page.
--
-- RLS is enabled with NO policies for anon/authenticated. That is deliberate,
-- not an oversight: the public must never read this list, and must never write
-- to it directly. Every insert goes through the `joinWaitlist` server action
-- (src/server/waitlist/join.ts) using the service-role client, which is where
-- validation and the honeypot check live.

create extension if not exists citext;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  -- citext so Nick@x.com and nick@x.com are one person, enforced by the DB
  -- rather than by remembering to lowercase at every call site.
  email      citext not null unique,
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;
-- Intentionally no policies. Service-role bypasses RLS; everyone else is denied.
```

- [ ] **Step 2: Apply the migration**

Apply it against the Supabase project (via `supabase db push`, the Supabase MCP `apply_migration` tool, or the SQL editor — whichever this project normally uses).

Then verify:

```sql
select tablename, rowsecurity from pg_tables where tablename = 'waitlist';
select count(*) from pg_policies where tablename = 'waitlist';
```
Expected: one row with `rowsecurity = true`, and a policy count of **0**.

- [ ] **Step 3: Add the table to the `Database` type**

In `src/db/types.ts`, inside `Database["public"]["Tables"]`, add (matching the surrounding style — no trailing semicolons/commas beyond what neighbors use):

```ts
      waitlist: {
        Row: {
          id: string
          email: string
          source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          source?: string | null
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(waitlist): add waitlist table with RLS locked to service-role" && git push
```

---

### Task 3: Waitlist domain module (TDD)

The logic that must not be wrong: a **duplicate email must be indistinguishable from a fresh signup**. If a repeat submit produced a different response, the form would be an email-enumeration oracle — anyone could check whether a given address is on the list.

**Files:**
- Create: `src/server/waitlist/validate.ts`
- Create: `src/server/waitlist/join.ts`
- Test: `src/server/waitlist/__tests__/validate.test.ts`
- Test: `src/server/waitlist/__tests__/join.test.ts`

**Interfaces:**
- Consumes: `serviceClient()` from `@/db/service`; the `waitlist` table type from Task 2.
- Produces:
  - `normalizeEmail(raw: unknown): string | null` — trimmed + lowercased, or `null` if not a valid email.
  - `type WaitlistSource = "hero" | "footer"`
  - `type WaitlistResult = { ok: true } | { ok: false; error: string }`
  - `joinWaitlist(input: { email: unknown; source: unknown; honeypot: unknown }): Promise<WaitlistResult>`

  Task 4's server action calls `joinWaitlist` and passes `WaitlistResult` straight to the client.

- [ ] **Step 1: Write the failing validation test**

Create `src/server/waitlist/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../validate";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  nick@pixelocity.com  ")).toBe("nick@pixelocity.com");
  });

  it("lowercases so casing can't create a duplicate person", () => {
    expect(normalizeEmail("Nick@Pixelocity.COM")).toBe("nick@pixelocity.com");
  });

  it("rejects a string that isn't an email", () => {
    expect(normalizeEmail("nick")).toBeNull();
    expect(normalizeEmail("nick@")).toBeNull();
    expect(normalizeEmail("@pixelocity.com")).toBeNull();
    expect(normalizeEmail("nick @pixelocity.com")).toBeNull();
  });

  it("rejects empty and non-string input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/server/waitlist/__tests__/validate.test.ts`
Expected: FAIL — cannot resolve `../validate`.

- [ ] **Step 3: Implement `validate.ts`**

Create `src/server/waitlist/validate.ts`:

```ts
import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Trimmed + lowercased email, or null if the input isn't a usable address.
 *
 * Normalization happens before validation, not as a Zod transform chain — so
 * the order is explicit and doesn't depend on how Zod sequences `.trim()`,
 * `.toLowerCase()`, and `.email()`.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase();
  const parsed = emailSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- src/server/waitlist/__tests__/validate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing join test**

Create `src/server/waitlist/__tests__/join.test.ts`. This mocks `@/db/service` at the module boundary, so no database is touched:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock("@/db/service", () => ({
  serviceClient: () => ({ from }),
}));

import { joinWaitlist } from "../join";

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
});

describe("joinWaitlist", () => {
  it("inserts a normalized email into the waitlist table", async () => {
    const result = await joinWaitlist({
      email: "  Nick@Pixelocity.COM ",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("waitlist");
    expect(insert).toHaveBeenCalledWith({ email: "nick@pixelocity.com", source: "hero" });
  });

  it("reports the same success for a duplicate as for a fresh signup", async () => {
    // 23505 = unique_violation. The caller must not be able to tell.
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const result = await joinWaitlist({
      email: "nick@pixelocity.com",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects a malformed email without touching the database", async () => {
    const result = await joinWaitlist({ email: "nope", source: "hero", honeypot: "" });

    expect(result).toEqual({ ok: false, error: "That doesn't look like an email address." });
    expect(insert).not.toHaveBeenCalled();
  });

  it("silently no-ops when the honeypot is filled, but reports success to the bot", async () => {
    const result = await joinWaitlist({
      email: "bot@spam.com",
      source: "hero",
      honeypot: "http://spam.example",
    });

    expect(result).toEqual({ ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("falls back to a null source when the source isn't one we recognize", async () => {
    await joinWaitlist({ email: "nick@pixelocity.com", source: "evil", honeypot: "" });

    expect(insert).toHaveBeenCalledWith({ email: "nick@pixelocity.com", source: null });
  });

  it("surfaces a real database failure", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    const result = await joinWaitlist({
      email: "nick@pixelocity.com",
      source: "hero",
      honeypot: "",
    });

    expect(result).toEqual({ ok: false, error: "Something went wrong. Try again in a moment." });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm test -- src/server/waitlist/__tests__/join.test.ts`
Expected: FAIL — cannot resolve `../join`.

- [ ] **Step 7: Implement `join.ts`**

Create `src/server/waitlist/join.ts`:

```ts
import { serviceClient } from "@/db/service";
import { normalizeEmail } from "./validate";

export type WaitlistSource = "hero" | "footer";
export type WaitlistResult = { ok: true } | { ok: false; error: string };

const SOURCES: WaitlistSource[] = ["hero", "footer"];

/** Postgres unique_violation — the email is already on the list. */
const UNIQUE_VIOLATION = "23505";

/**
 * Adds an email to the waitlist.
 *
 * Two things here are deliberate and must not be "fixed":
 *
 * 1. A duplicate email returns the SAME `{ ok: true }` as a fresh signup. If it
 *    didn't, anyone could submit an address and learn from the response whether
 *    it was already on the list — an email-enumeration oracle on a public form.
 *
 * 2. A filled honeypot also returns `{ ok: true }` without writing. Bots get
 *    told they succeeded; telling them they failed just teaches them to retry.
 *
 * Writes go through the service client because `waitlist` has RLS on with no
 * policies (see 0010_waitlist.sql) — the public has no direct write path.
 */
export async function joinWaitlist(input: {
  email: unknown;
  source: unknown;
  honeypot: unknown;
}): Promise<WaitlistResult> {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    return { ok: true };
  }

  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const source = SOURCES.includes(input.source as WaitlistSource)
    ? (input.source as WaitlistSource)
    : null;

  const { error } = await serviceClient().from("waitlist").insert({ email, source });

  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error("[waitlist] insert failed", error);
    return { ok: false, error: "Something went wrong. Try again in a moment." };
  }

  return { ok: true };
}
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all tests pass, including the 6 new `join` tests and 4 new `validate` tests.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(waitlist): join logic with duplicate-safe, honeypot-guarded insert" && git push
```

---

### Task 4: Server action + waitlist form

**Files:**
- Create: `src/app/actions.ts`
- Create: `src/components/waitlist/WaitlistForm.tsx`

**Interfaces:**
- Consumes: `joinWaitlist`, `WaitlistResult`, `WaitlistSource` from `@/server/waitlist/join`.
- Produces: `<WaitlistForm source="hero" | "footer" className?: string />` — used by Task 6 (hero) and Task 7 (closing CTA).

> **Before writing this task:** read the server-actions guide in `node_modules/next/dist/docs/` — this Next.js version's action signature and `useActionState` contract may differ from what you remember.

- [ ] **Step 1: Write the server action**

Create `src/app/actions.ts`:

```ts
"use server";

import { joinWaitlist, type WaitlistResult } from "@/server/waitlist/join";

/**
 * Thin wrapper — all logic (and every security decision) lives in
 * `joinWaitlist`, where it's unit-tested. This exists only to cross the
 * client/server boundary.
 */
export async function joinWaitlistAction(
  _prev: WaitlistResult | null,
  formData: FormData,
): Promise<WaitlistResult> {
  return joinWaitlist({
    email: formData.get("email"),
    source: formData.get("source"),
    honeypot: formData.get("website"),
  });
}
```

- [ ] **Step 2: Write the form component**

Create `src/components/waitlist/WaitlistForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { WaitlistSource } from "@/server/waitlist/join";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="big" disabled={pending}>
      {pending ? "Joining…" : "Request an invite"}
    </Button>
  );
}

export function WaitlistForm({
  source,
  className = "",
}: {
  source: WaitlistSource;
  className?: string;
}) {
  const [result, formAction] = useActionState(joinWaitlistAction, null);

  if (result?.ok) {
    return (
      <div
        className={`rounded-card border border-green bg-green-tint px-5 py-4 text-center ${className}`}
        role="status"
      >
        <p className="serif text-[17px] text-green-deep">You&rsquo;re on the list.</p>
        <p className="mt-1 text-[13.5px] text-muted">
          We&rsquo;ll be in touch when there&rsquo;s a door to open.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="source" value={source} />

      {/* Honeypot. Off-screen rather than display:none — bots skip hidden
          fields but happily fill ones they can "see" in the DOM. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`website-${source}`}>Leave this empty</label>
        <input id={`website-${source}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          aria-label="Email address"
          className="sm:flex-1"
        />
        <SubmitButton />
      </div>

      {result && !result.ok && (
        <p className="mt-2 text-[13px] text-amber" role="alert">
          {result.error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(waitlist): server action and waitlist form component" && git push
```

---

### Task 5: Landing content module + JSON-LD

The FAQ's visible text and its `FAQPage` structured data are generated from **one array**. Two hand-maintained copies drift, and Google penalizes JSON-LD that doesn't match visible content. A test enforces this.

**Files:**
- Create: `src/app/(marketing)/content.ts`
- Create: `src/app/(marketing)/JsonLd.tsx`
- Test: `src/app/(marketing)/__tests__/content.test.ts`

**Interfaces:**
- Produces, from `@/app/(marketing)/content`:
  - `type Faq = { q: string; a: string }`
  - `FAQS: Faq[]`
  - `HOW_IT_WORKS: { n: string; title: string; body: string }[]`
  - `BENEFITS: { title: string; body: string }[]`
  - `AUDIENCES: { title: string; body: string }[]`
  - `SITE_URL: string`
  - `faqJsonLd(): object` and `softwareJsonLd(): object`

  Tasks 6 and 7 import these arrays; nothing else may hardcode this copy.

- [ ] **Step 1: Write the failing consistency test**

Create `src/app/(marketing)/__tests__/content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FAQS, faqJsonLd, softwareJsonLd } from "../content";

describe("landing content", () => {
  it("ships a real FAQ", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.q.trim().length).toBeGreaterThan(0);
      expect(f.a.trim().length).toBeGreaterThan(0);
    }
  });

  it("generates FAQPage JSON-LD from the same array the page renders", () => {
    const ld = faqJsonLd() as {
      "@type": string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };

    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQS.length);

    // Every rendered question/answer must appear verbatim in the structured
    // data. If someone edits the copy and hand-edits the JSON-LD, this fails.
    FAQS.forEach((f, i) => {
      expect(ld.mainEntity[i].name).toBe(f.q);
      expect(ld.mainEntity[i].acceptedAnswer.text).toBe(f.a);
    });
  });

  it("describes the product in SoftwareApplication JSON-LD", () => {
    const ld = softwareJsonLd() as { "@type": string; name: string };
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.name).toBe("PostAud.io");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/app/\(marketing\)/__tests__/content.test.ts`
Expected: FAIL — cannot resolve `../content`.

- [ ] **Step 3: Write the content module**

Create `src/app/(marketing)/content.ts`. This is the single source of truth for landing copy — the page components import from here and hardcode nothing:

```ts
export const SITE_URL = "https://postaud.io";

export type Faq = { q: string; a: string };

export const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Start a series",
    body: "Name the person and what you want to remember. That's the whole setup.",
  },
  {
    n: "02",
    title: "Anna interviews",
    body: "One question at a time. She listens to the answer and follows up on the part that mattered — the way a good interviewer would.",
  },
  {
    n: "03",
    title: "The knowledge base grows",
    body: "Every session adds people, places, dates, and stories to a living record. Session six knows everything sessions one through five learned.",
  },
];

export const BENEFITS = [
  {
    title: "Voice-first, not a form",
    body: "Nobody fills out a questionnaire about their life. But everyone will answer a good question. Anna asks good questions.",
  },
  {
    title: "A knowledge base that compounds",
    body: "The transcript isn't the product. What accumulates is — facts, people, and context that stay organized and get richer every time you talk.",
  },
  {
    title: "Yours to keep",
    body: "Export everything as Markdown whenever you want. No lock-in, no export queue, no asking us for permission.",
  },
];

export const AUDIENCES = [
  {
    title: "Families",
    body: "Your mother's childhood, in her own voice, before it's a thing you meant to get around to.",
  },
  {
    title: "Founders",
    body: "The decisions, the near-misses, and the reasons — the context that lives in exactly one head.",
  },
  {
    title: "Experts",
    body: "Thirty years of judgment, captured before the person carrying it retires.",
  },
];

export const FAQS: Faq[] = [
  {
    q: "What is PostAud.io?",
    a: "PostAud.io is an AI interviewer. You talk; it asks good questions, listens, and follows up. What it builds isn't a transcript — it's a structured, growing knowledge base of everything it has learned about the person or subject.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Interviews happen in your browser, on a phone or a laptop. If the person you're interviewing can open a link, they can do this.",
  },
  {
    q: "Who can see my family's memories?",
    a: "Only the people you invite. Series are private to your workspace, and access is granted per person and per series — an interviewer you invite to one series cannot see the others.",
  },
  {
    q: "What happens to my data if I leave?",
    a: "You export everything as Markdown, any time, without asking us. It's your family's history. Holding it hostage would be a strange way to run a business.",
  },
  {
    q: "How long is a session?",
    a: "As long as you want, but the good ones tend to run fifteen to thirty minutes. Memory works better in short, regular conversations than in one exhausting marathon.",
  },
];

/**
 * FAQPage structured data, generated from FAQS — never hand-written. Google
 * penalizes structured data that doesn't match the visible page, so there is
 * exactly one place the FAQ copy lives, and both the DOM and this function
 * read from it. `content.test.ts` enforces that.
 */
export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PostAud.io",
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "A voice-first AI interviewer that turns conversation into a living knowledge base — not just a transcript.",
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- src/app/\(marketing\)/__tests__/content.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the JSON-LD component**

Create `src/app/(marketing)/JsonLd.tsx`:

```tsx
import { faqJsonLd, softwareJsonLd } from "./content";

/** Structured data for the landing page. Rendered server-side, no hydration. */
export function JsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(marketing): landing content module with generated FAQ JSON-LD" && git push
```

---

### Task 6: Landing page — nav, hero, stakes, how it works

**Files:**
- Create: `src/app/(marketing)/Nav.tsx`
- Create: `src/app/(marketing)/Hero.tsx`
- Create: `src/app/(marketing)/Stakes.tsx`
- Create: `src/app/(marketing)/HowItWorks.tsx`
- Modify: `src/app/page.tsx` (rewrite; sections from Task 7 get added there next task)

**Interfaces:**
- Consumes: `WaitlistForm` (Task 4); `HOW_IT_WORKS`, `SITE_URL` (Task 5); `Button` from `@/components/ui/Button`.
- Produces: `<Nav />`, `<Hero />`, `<Stakes />`, `<HowItWorks />` — all server components, no props.

Design notes that matter:
- The wordmark is `post` + **`aud`** (in `green-deep`, semibold) + `.io`, in the serif — per `Postaudio Login.dc.html`.
- The giant `”` background mark: serif, italic, weight 300, ~340px, color `rgba(33,30,26,0.045)`, `select-none pointer-events-none`, `aria-hidden="true"`, positioned absolutely and allowed to bleed off-canvas. It is decoration; it must never be announced or focusable.
- Exactly **one `<h1>`** on the whole page — the hero headline. Everything else is `<h2>`.

- [ ] **Step 1: Build the nav**

Create `src/app/(marketing)/Nav.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`serif ${className}`}>
      post<b className="font-semibold text-green-deep">aud</b>.io
    </span>
  );
}

export function Nav() {
  return (
    <nav className="sticky top-0 z-20 w-full border-b border-line bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 text-[13.5px] text-muted md:flex">
            <a href="#how-it-works" className="hover:text-ink">How it works</a>
            <a href="#why" className="hover:text-ink">Why</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </div>
          <Link href="/sign-in">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Build the hero**

Create `src/app/(marketing)/Hero.tsx`. Note the waitlist form is **in** the hero — not a button that scrolls somewhere:

```tsx
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden px-6 pt-24 pb-28">
      {/* Decorative. Bleeds off the top-left, like the login mockup. */}
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[120px] left-4 select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)]"
      >
        &rdquo;
      </span>

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1 className="serif text-[40px] leading-[1.15] text-ink md:text-[60px]">
          The stories leave with the person.
          <br />
          Unless someone asks.
        </h1>

        <p className="mt-7 max-w-xl text-[16.5px] leading-[1.65] text-muted">
          PostAud.io is an AI interviewer that sits down with the people who know things
          — and turns what they say into a knowledge base that grows every time you talk.
        </p>

        <WaitlistForm source="hero" className="mt-10 w-full max-w-md" />

        <p className="serif mt-14 text-[16px] italic text-faint">
          &raquo;Tell me about the ferry.&laquo;
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Build the stakes section**

Create `src/app/(marketing)/Stakes.tsx`. This section's only job is to make someone feel something for four seconds — so it gets air, serif, and no cards or icons:

```tsx
export function Stakes() {
  return (
    <section id="why" className="w-full border-y border-line bg-paper-2 px-6 py-28">
      <div className="mx-auto w-full max-w-2xl text-center">
        <h2 className="serif text-[28px] leading-[1.4] text-ink md:text-[34px]">
          Everyone means to ask. Almost nobody does.
        </h2>
        <p className="mt-6 text-[16px] leading-[1.7] text-muted">
          Not because we don&rsquo;t care — because sitting down with a recorder feels
          like an occasion, and occasions get postponed. So the ferry story, the reason
          they left, the name of the street: they go quiet, and then they&rsquo;re gone,
          and what&rsquo;s left is a folder of photographs nobody can label.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Build how-it-works**

Create `src/app/(marketing)/HowItWorks.tsx`:

```tsx
import { HOW_IT_WORKS } from "./content";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full px-6 py-28">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">How it works</h2>

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.n}>
              <div className="serif text-[15px] text-green-deep">{step.n}</div>
              <h3 className="serif mt-3 text-[21px] text-ink">{step.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.65] text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Rewrite the page with the sections built so far**

Rewrite `src/app/page.tsx` entirely. Task 7 adds the remaining sections between `<HowItWorks />` and the closing tag:

```tsx
import type { Metadata } from "next";
import { JsonLd } from "./(marketing)/JsonLd";
import { Nav } from "./(marketing)/Nav";
import { Hero } from "./(marketing)/Hero";
import { Stakes } from "./(marketing)/Stakes";
import { HowItWorks } from "./(marketing)/HowItWorks";
import { SITE_URL } from "./(marketing)/content";

const title = "PostAud.io — An AI interviewer that builds knowledge through conversation";
const description =
  "Voice-first AI interviews that build a living knowledge base — not just a transcript. Capture what only one person knows, and export it as Markdown any time.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: SITE_URL },
  openGraph: { title, description, url: SITE_URL, siteName: "PostAud.io", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function MarketingHome() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper text-ink">
      <JsonLd />
      <Nav />
      <main className="w-full flex-1">
        <Hero />
        <Stakes />
        <HowItWorks />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Build and look at it**

Run: `rm -rf .next && npm run build && npm run dev`

Open `http://localhost:3000`. Confirm: warm paper background (not white, not dark); the ghosted `”` in the hero; the waitlist form is present and inline; exactly one `<h1>`. Submit a **real email**, confirm the success state appears in place, and confirm the row landed:

```sql
select email, source, created_at from public.waitlist order by created_at desc limit 5;
```

Then submit the **same email again** and confirm you see the identical success state (not an error).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(marketing): landing hero, stakes, and how-it-works" && git push
```

---

### Task 7: Landing page — product moment, benefits, audiences, FAQ, CTA, footer

The product-moment section is the centerpiece and gets the most design attention. **This is the only place in this plan permitted to use the `dark-*` tokens** — it renders a sample interview on the same `.dark-session` surface a real live interview uses, so it doubles as a screenshot of the product.

**Files:**
- Create: `src/app/(marketing)/ProductMoment.tsx`
- Create: `src/app/(marketing)/Benefits.tsx`
- Create: `src/app/(marketing)/WhoItsFor.tsx`
- Create: `src/app/(marketing)/Faq.tsx`
- Create: `src/app/(marketing)/ClosingCta.tsx`
- Create: `src/app/(marketing)/Footer.tsx`
- Modify: `src/app/page.tsx` (add the six sections)

**Interfaces:**
- Consumes: `BENEFITS`, `AUDIENCES`, `FAQS` (Task 5); `WaitlistForm` (Task 4); `Wordmark` from `./Nav` (Task 6); `Card` from `@/components/ui/Card`.

- [ ] **Step 1: Build the product moment**

Create `src/app/(marketing)/ProductMoment.tsx`. The argument this section makes visually: *talking produced structured knowledge, and you didn't do anything.* The follow-up question is the beat that proves it isn't a form — Anna picks up the one specific detail from the answer:

```tsx
import { Card } from "@/components/ui/Card";

const facts = [
  { kind: "Person", value: "Aunt Rina", detail: "Travelled with her; sister-in-law" },
  { kind: "Place", value: "The Hoek van Holland ferry", detail: "Crossing to Harwich, winter" },
  { kind: "Date", value: "January 1953", detail: "Two weeks before the North Sea flood" },
];

export function ProductMoment() {
  return (
    <section className="w-full bg-paper-2 px-6 py-28">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="serif text-[30px] text-ink md:text-[38px]">
            A conversation. Then, quietly, a record.
          </h2>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-muted">
            Anna doesn&rsquo;t work from a script. She listens to the answer and follows the
            thread that matters — and while she does it, the knowledge base fills in behind her.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* The live-interview surface — the same dark session UI the product uses. */}
          <div className="rounded-card bg-dark p-8 shadow-pop md:p-10">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.1em] text-dark-muted uppercase">
              <span className="h-1.5 w-1.5 rounded-pill bg-mint" />
              Session 4 · live
            </div>

            <div className="mt-8 space-y-7">
              <p className="serif text-[19px] leading-[1.55] text-paper md:text-[21px]">
                &raquo;Tell me about the ferry.&laquo;
              </p>

              <p className="text-[14.5px] leading-[1.7] text-dark-muted">
                Oh, the ferry. We went over in the winter — it was rough, everyone was sick.
                Rina held my hand the whole way and pretended she wasn&rsquo;t frightened.
                That was two weeks before the water came.
              </p>

              <p className="serif text-[19px] leading-[1.55] text-paper md:text-[21px]">
                &raquo;Two weeks before the water came. You mean the flood?&laquo;
              </p>
            </div>

            <div className="mt-9 border-t border-dark-line pt-5 text-[12.5px] text-dark-muted">
              She asked about the flood because your mother mentioned the water — not because
              a script told her to.
            </div>
          </div>

          {/* What that exchange produced, with no effort from anyone. */}
          <div>
            <div className="text-[11.5px] font-semibold tracking-[0.1em] text-faint uppercase">
              Added to the knowledge base
            </div>

            <div className="mt-4 space-y-3">
              {facts.map((f) => (
                <Card key={f.value} className="px-5 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-green-deep uppercase">
                    {f.kind}
                  </div>
                  <div className="serif mt-1.5 text-[17px] text-ink">{f.value}</div>
                  <div className="mt-1 text-[13px] text-muted">{f.detail}</div>
                </Card>
              ))}
            </div>

            <p className="mt-5 text-[13px] leading-[1.6] text-faint">
              Nobody tagged anything. Nobody filled out a form. Someone just told a story.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Build benefits and audiences**

Create `src/app/(marketing)/Benefits.tsx`:

```tsx
import { Card } from "@/components/ui/Card";
import { BENEFITS } from "./content";

export function Benefits() {
  return (
    <section className="w-full px-6 py-28">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        {BENEFITS.map((b) => (
          <Card key={b.title} className="px-6 py-7">
            <h3 className="serif text-[19px] text-ink">{b.title}</h3>
            <p className="mt-2.5 text-[14px] leading-[1.65] text-muted">{b.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

Create `src/app/(marketing)/WhoItsFor.tsx`:

```tsx
import { AUDIENCES } from "./content";

export function WhoItsFor() {
  return (
    <section className="w-full border-y border-line bg-paper-2 px-6 py-24">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">
          For anyone who knows something nobody wrote down.
        </h2>

        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title}>
              <h3 className="text-[12px] font-semibold tracking-[0.1em] text-green-deep uppercase">
                {a.title}
              </h3>
              <p className="serif mt-3 text-[18px] leading-[1.5] text-ink-soft">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Build the FAQ**

Create `src/app/(marketing)/Faq.tsx`. Native `<details>` — no JavaScript, works unhydrated, and it's crawlable. The copy comes from `FAQS`, the same array that generates the JSON-LD:

```tsx
import { FAQS } from "./content";

export function Faq() {
  return (
    <section id="faq" className="w-full px-6 py-28">
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="serif text-center text-[30px] text-ink md:text-[38px]">Questions</h2>

        <div className="mt-12 divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="serif flex cursor-pointer list-none items-center justify-between gap-4 text-[18px] text-ink marker:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-[20px] leading-none text-faint transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.7] text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Build the closing CTA and footer**

Create `src/app/(marketing)/ClosingCta.tsx`:

```tsx
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export function ClosingCta() {
  return (
    <section className="w-full border-t border-line bg-paper-2 px-6 py-28">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <h2 className="serif text-[28px] leading-[1.35] text-ink md:text-[34px]">
          The best time to ask was ten years ago.
        </h2>
        <p className="mt-4 text-[15.5px] text-muted">
          We&rsquo;re opening PostAud.io to a small group first. Leave your email and we&rsquo;ll
          come find you.
        </p>
        <WaitlistForm source="footer" className="mt-9 w-full max-w-md" />
      </div>
    </section>
  );
}
```

Create `src/app/(marketing)/Footer.tsx`. **Only link to things that exist** — no dead links:

```tsx
import Link from "next/link";
import { Wordmark } from "./Nav";

export function Footer() {
  return (
    <footer className="w-full border-t border-line bg-paper px-6 py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Wordmark className="text-lg" />
          <p className="mt-3 text-[13px] leading-[1.6] text-muted">
            An AI interviewer that turns conversation into a knowledge base worth keeping.
          </p>
        </div>

        <div className="flex gap-16">
          <div>
            <div className="text-[11.5px] font-semibold tracking-[0.1em] text-faint uppercase">
              Product
            </div>
            <ul className="mt-3.5 space-y-2.5 text-[13.5px] text-muted">
              <li><a href="#how-it-works" className="hover:text-ink">How it works</a></li>
              <li><a href="#faq" className="hover:text-ink">FAQ</a></li>
              <li><Link href="/sign-in" className="hover:text-ink">Sign in</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 w-full max-w-6xl border-t border-line pt-6 text-[12.5px] text-faint">
        © {new Date().getFullYear()} PostAud.io
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Assemble the full page**

In `src/app/page.tsx`, add the imports and drop the sections in. The full section order must be: Nav, Hero, Stakes, HowItWorks, ProductMoment, Benefits, WhoItsFor, Faq, ClosingCta, Footer.

```tsx
import { ProductMoment } from "./(marketing)/ProductMoment";
import { Benefits } from "./(marketing)/Benefits";
import { WhoItsFor } from "./(marketing)/WhoItsFor";
import { Faq } from "./(marketing)/Faq";
import { ClosingCta } from "./(marketing)/ClosingCta";
import { Footer } from "./(marketing)/Footer";
```

```tsx
      <main className="w-full flex-1">
        <Hero />
        <Stakes />
        <HowItWorks />
        <ProductMoment />
        <Benefits />
        <WhoItsFor />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
```

- [ ] **Step 6: Build and review the whole page**

Run: `rm -rf .next && npm run build && npm run dev`

At `http://localhost:3000`, check: the page scrolls through all ten sections; the product-moment section reads as a real interview; the FAQ accordions open and close **with JavaScript disabled**; the footer CTA form works; nothing overflows horizontally at 375px width.

- [ ] **Step 7: Verify the structured data matches the page**

Run: `curl -s localhost:3000 | grep -o '"@type":"FAQPage"'`
Expected: one match.

Then confirm one FAQ answer string appears in the HTML **twice** — once in the visible DOM, once in the JSON-LD:

Run: `curl -s localhost:3000 | grep -c "the good ones tend to run fifteen"`
Expected: `2`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(marketing): product moment, benefits, audiences, FAQ, CTA, footer" && git push
```

---

### Task 8: Rebuild the sign-in screen

Built to `Postaudio Login.dc.html` §1a. **Auth behavior does not change** — same `signInWithPassword`, same `signInWithOtp`, same `next` param, same `?error=` banner contract that `/auth/callback` depends on. This is a restyle plus a layout rebuild, nothing more.

**Files:**
- Modify: `src/app/sign-in/page.tsx` (rewrite)
- Modify: `src/app/sign-in/SignInForm.tsx` (rewrite)

**Interfaces:**
- Consumes: `Card`, `Button`, `Field`, `Input`, `Wordmark` (from `@/app/(marketing)/Nav`), and the existing `createClient` from `@/db/client`.

Where the mockup puts "Continue with Google," we put **"Email me a link instead"** — the magic-link flow that already works. It occupies the exact slot Google will later take, so adding Google is a drop-in, not a redesign.

- [ ] **Step 1: Rewrite the page**

Rewrite `src/app/sign-in/page.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/app/(marketing)/Nav";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in — PostAud.io" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-paper px-6 py-14">
      <span
        aria-hidden="true"
        className="serif pointer-events-none absolute -top-[60px] left-8 select-none text-[340px] font-light italic leading-none text-[rgba(33,30,26,0.045)]"
      >
        &rdquo;
      </span>

      <Card className="relative w-full max-w-[400px] px-[38px] pt-9 pb-8">
        <Link href="/" aria-label="PostAud.io home">
          <Wordmark className="text-xl" />
        </Link>

        <h1 className="serif mt-[18px] text-[27px] text-ink">Welcome back</h1>
        <p className="mb-6 mt-1 text-[13.5px] text-muted">Sign in to keep the stories going.</p>

        {error && (
          <div className="mb-5 rounded-sm border border-amber-tint bg-amber-tint px-4 py-3 text-[13.5px] text-amber">
            {error}
          </div>
        )}

        <SignInForm next={next} />
      </Card>

      <p className="relative mt-6 text-center text-[12.5px] text-faint">
        New here? Someone in your family usually opens the door.
      </p>

      <p className="serif relative mt-14 text-[16px] italic text-faint">
        &raquo;Tell me about the ferry.&laquo;
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the form**

Rewrite `src/app/sign-in/SignInForm.tsx`. The `submitPassword` and `submitMagic` function bodies are **carried over unchanged** from the current file — only the markup and classes change:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/db/client";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

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

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState("error");
        setErrorMsg(error.message);
        return;
      }
      router.push(next ?? "/app");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectTo = `${appUrl}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

    try {
      const supabase = createClient();
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
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (mode === "magic" && state === "sent") {
    return (
      <div className="rounded-card border border-green bg-green-tint px-5 py-6 text-center">
        <p className="serif text-[18px] text-green-deep">Check your inbox</p>
        <p className="mt-1.5 text-[13.5px] text-muted">
          We sent a secure link to <strong className="text-ink">{email}</strong>.
        </p>
      </div>
    );
  }

  const disabled = state === "submitting" || !email || (mode === "password" && !password);

  return (
    <form onSubmit={mode === "password" ? submitPassword : submitMagic}>
      <Field label="Email">
        <Input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      {mode === "password" && (
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
      )}

      <Button type="submit" variant="primary" disabled={disabled} className="w-full justify-center">
        {state === "submitting"
          ? mode === "password" ? "Signing in…" : "Sending link…"
          : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>

      {/* The `or` divider — the ::before/::after rule pattern from the mockup. */}
      <div className="my-5 flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.1em] text-faint uppercase before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']">
        or
      </div>

      {/* This slot is where "Continue with Google" goes when OAuth is enabled. */}
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-center"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setState("idle");
          setErrorMsg(null);
        }}
      >
        {mode === "password" ? "Email me a link instead" : "Use a password instead"}
      </Button>

      {errorMsg && (
        <p className="mt-4 text-center text-[13px] text-amber" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="mt-5 text-center text-[12.5px]">
        <Link href="/auth/reset" className="text-faint hover:text-ink">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify no banned classes survived**

Run: `grep -rnE "blue-|neutral-|emerald-|rose-|gray-|slate-|dark:" src/app/sign-in`
Expected: **no output**.

- [ ] **Step 4: Test the real flows in a browser**

Run: `npm run dev`, then at `http://localhost:3000/sign-in`:
1. Sign in with a valid password → lands on `/app`.
2. Sign in with a **wrong** password → the error renders in amber, in the form.
3. Click "Email me a link instead" → the form switches to magic-link mode; submit → the "Check your inbox" state appears in green; the email actually arrives.
4. Confirm the page looks like `Postaudio Login.dc.html` §1a: warm paper, ghosted quote, wordmark, one primary action.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(auth): rebuild sign-in on the warm-paper design system" && git push
```

---

### Task 9: De-blue the rest of the auth surface

Mechanical, styling-only. These pages are all in the same off-brand blue; leaving them means "Forgot password?" drops the user off a cliff from a beautiful page onto an ugly one.

**Files:**
- Modify: `src/app/sign-up/page.tsx`
- Modify: `src/app/sign-up/SignUpForm.tsx`
- Modify: `src/app/auth/reset/page.tsx`
- Modify: `src/app/auth/update-password/page.tsx`
- Modify: `src/app/auth/verify/page.tsx`

**Interfaces:**
- Consumes: `Card`, `Button`, `Field`, `Input`, `Wordmark` — the same set Task 8 used.

**Do not change any auth logic**, redirect, route handler, Supabase call, or search-param contract on these pages. If an existing test covering auth behavior breaks, the change was wrong — revert and redo it as styling only.

- [ ] **Step 1: Read each page before touching it**

Read all five files. For each, note exactly which Supabase calls and redirects it performs. Those lines survive the change untouched.

- [ ] **Step 2: Apply the same treatment to each**

For every one of the five files, apply this mapping:

| Currently | Becomes |
|---|---|
| `bg-white`, `bg-[#111111]`, `bg-neutral-50` | `bg-card`, or `bg-paper` for the page background |
| `text-neutral-900` / `text-white` | `text-ink` |
| `text-neutral-600` / `text-neutral-400` | `text-muted` |
| `text-neutral-500` | `text-faint` |
| `border-neutral-200` / `border-neutral-300` / `-700` / `-800` | `border-line` or `border-line-strong` |
| `bg-blue-600` button + its hover/disabled classes | `<Button variant="primary" className="w-full justify-center">` |
| `text-blue-600` link | `text-green-deep hover:text-ink` |
| `rose-*` (errors) | `amber` on `amber-tint` |
| `emerald-*` (success) | `green-deep` on `green-tint` |
| raw `<input className="...">` | `<Field label="…"><Input … /></Field>` |
| any `dark:` variant | **delete it** |
| `rounded-xl` / `rounded-2xl` / `rounded-[2rem]` | `rounded-sm` (inputs) or `rounded-card` (panels) |

Wrap each page's content in the same centered warm-paper stage as sign-in — `<main className="flex min-h-screen w-full flex-col items-center justify-center bg-paper px-6 py-14">` around a `<Card className="w-full max-w-[400px] px-[38px] pt-9 pb-8">` with the `Wordmark` at the top — so the whole auth flow reads as one place.

`/sign-up`'s existing copy ("Three free interviews per month. No credit card required.") **stays** — self-serve signup still works; it's just no longer advertised on the landing page.

- [ ] **Step 3: Verify no banned classes survived anywhere in auth**

Run: `grep -rnE "blue-|neutral-|emerald-|rose-|gray-|slate-|dark:" src/app/sign-in src/app/sign-up src/app/auth src/app/page.tsx src/app/\(marketing\)`
Expected: **no output**.

(Note: `dark-muted`, `dark-line`, and `bg-dark` in `ProductMoment.tsx` are design *tokens*, not the `dark:` variant, and won't match this pattern.)

- [ ] **Step 4: Walk the whole flow in a browser**

Run: `npm run dev`. End to end, in one sitting:
1. `/sign-up` → create an account → confirm it still works and looks like the rest.
2. `/sign-in` → "Forgot password?" → `/auth/reset` → submit → the reset email arrives.
3. Click the emailed link → `/auth/update-password` → set a new password → confirm you're signed in.
4. Confirm every one of these pages is warm paper with a green primary button — no blue anywhere.

- [ ] **Step 5: Full verification**

Run: `rm -rf .next && npm run build && npm run lint && npx tsc --noEmit && npm test`
Expected: build succeeds, lint clean, no type errors, **all tests pass** — including the pre-existing auth tests, which must be untouched by this task.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(auth): move sign-up, reset, update-password, and verify onto the design system" && git push
```

---

## Final Verification

Run before declaring this done. Every item is a command or an observation, not a vibe.

- [ ] `rm -rf .next && npm run build` — succeeds.
- [ ] `npm run lint && npx tsc --noEmit` — clean.
- [ ] `npm test` — all pass, including the 13 new waitlist/content tests.
- [ ] `grep -rnE "blue-|neutral-|emerald-|rose-|gray-|slate-|dark:" src/app/page.tsx src/app/\(marketing\) src/app/sign-in src/app/sign-up src/app/auth` — no output.
- [ ] Waitlist: submit a real email on the landing page; the row appears in `public.waitlist`. Submit the **same email again**; the user sees the identical success state, and no second row appears.
- [ ] The waitlist table rejects anonymous reads: from a client with the anon key, `select * from waitlist` returns zero rows / permission denied.
- [ ] Auth: password sign-in works; magic-link sign-in works; the forgot-password → reset → update-password flow completes end to end.
- [ ] The landing page renders correctly at 375px wide with no horizontal overflow.
- [ ] The rendered FAQ text matches the `FAQPage` JSON-LD exactly (Task 7, Step 7).
