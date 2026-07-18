# Obsidian Vault Sync — Server Implementation Plan (Phase 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PostAud.io server foundation that lets a user link a series to an Obsidian vault and press "Send update to vault" — personal API tokens, a machine-readable series export, and the vault-link/pending/ack trigger flow.

**Architecture:** A new `Authorization: Bearer pat_…` auth path resolves a token to a user, then mints a short-lived user-scoped Supabase JWT so **all existing RLS applies unchanged** (no service-role bypass for user data). The export route's data assembly is extracted into a reusable builder that serves both the existing Markdown render and a new JSON format with content hashes. A `series_vault_links` table holds a latest-wins `push_requested_at` flag that the user sets from the series page and the plugin clears via ack.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, Zod (env), node:crypto (HMAC/SHA-256).

**Spec:** `docs/superpowers/specs/2026-07-18-obsidian-vault-sync-design.md`

**Phase 2 (separate plan, after this ships):** the Obsidian plugin — a separate repo consuming these endpoints.

## Global Constraints

- **This is NOT the Next.js you know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code. Route `params` are a `Promise` and must be awaited (see the existing export route).
- Migrations are applied via the **Supabase MCP `apply_migration`** tool (the Supabase CLI is unlinked in this repo). Migration files still get committed to `supabase/migrations/`.
- **Do not hardcode a migration number — derive it.** A concurrent session is committing to this repo and has already claimed 0014 and 0015. Before creating any migration, run `ls supabase/migrations | tail -3` and use the next free number. This plan's task text says `0016_api_tokens.sql` (Task 2) and `0017_series_vault_links.sql` (Task 8); if those are taken by the time you get there, bump to the next free number and note it in your report.
- Tests live in `__tests__/` next to the code and run under Vitest: `npx vitest run <path>`. Only files matching `src/**/__tests__/**/*.test.ts` are collected.
- New required env vars must be added to **both** `src/lib/env.ts` (Zod schema) and the `test.env` block in `vitest.config.ts`, or every test that imports `env()` breaks.
- Never bypass RLS for user-scoped reads. `serviceClient()` is only for the `api_tokens` lookup itself (the caller is unauthenticated at that moment, by definition).
- Supabase project ref: `umdksvftvugxlrartnhn`.
- Commit after every task.

---

## File Structure

**Create:**
- `src/lib/auth/user-jwt.ts` — mints an HS256 Supabase-compatible user JWT. Pure, no I/O, fully unit-testable.
- `src/lib/auth/api-token.ts` — token generation / hashing / format check. Pure.
- `src/db/user-client.ts` — builds a Supabase client authenticated as a given user id.
- `src/server/auth/bearer.ts` — `resolveApiToken(request)`: Bearer header → `{ userId, supabase }` or null.
- `src/server/export/series-data.ts` — `buildSeriesExportData()`, the shared data assembly extracted from the export route.
- `src/server/export/hash.ts` — stable content hashing.
- `src/app/app/settings/tokens/page.tsx` + `token-actions.ts` — token management UI.
- `src/app/api/vault/pending/route.ts` — pending-push list for the plugin.
- `src/app/api/series/[id]/vault-link/route.ts` — POST link / DELETE unlink.
- `src/app/api/series/[id]/vault-ack/route.ts` — POST ack.
- `src/app/app/series/[id]/VaultCard.tsx` + `vault-actions.ts` — the Vault card and Send button.
- `supabase/migrations/0016_api_tokens.sql`, `supabase/migrations/0017_series_vault_links.sql`

**Modify:**
- `src/lib/env.ts` — add `SUPABASE_JWT_SECRET`.
- `vitest.config.ts` — stub the new env var.
- `src/app/api/series/[id]/export/route.ts` — delegate to `buildSeriesExportData`, add `format=json`, accept Bearer auth.
- `src/app/api/series/route.ts` (or create) — add `format=json` discovery.
- `src/app/app/series/[id]/page.tsx` — mount `<VaultCard />`.
- `src/db/types.ts` — add the two new tables.

**Why this shape:** the pure helpers (`user-jwt`, `api-token`, `hash`, `series-data`) hold the logic worth testing and carry no framework or network dependency, so their tests are fast and real. Route files stay thin. The export data assembly moves out of the route because two formats now need it — that's the DRY trigger, not speculative refactoring.

---

## Task 1: User-scoped Supabase JWT

Foundation for token auth: given a user id, produce a client that Postgres sees as that user, so RLS applies exactly as it does for a browser session.

**Files:**
- Create: `src/lib/auth/user-jwt.ts`
- Create: `src/lib/auth/__tests__/user-jwt.test.ts`
- Modify: `src/lib/env.ts`, `vitest.config.ts`

**Interfaces:**
- Produces: `mintUserJwt(userId: string, secret: string, nowSec: number, ttlSec?: number): string`

- [ ] **Step 1: Add the env var**

In `src/lib/env.ts`, add to the Zod schema alongside `SUPABASE_SERVICE_ROLE_KEY`:

```ts
  SUPABASE_JWT_SECRET: z.string().min(1),
```

In `vitest.config.ts`, add to the `test.env` block:

```ts
      SUPABASE_JWT_SECRET: "test-jwt-secret",
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/auth/__tests__/user-jwt.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mintUserJwt } from "../user-jwt";

const SECRET = "test-jwt-secret";
const USER = "11111111-1111-1111-1111-111111111111";

function decodePayload(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

describe("mintUserJwt", () => {
  it("carries the claims Supabase RLS needs", () => {
    const payload = decodePayload(mintUserJwt(USER, SECRET, 1_000));
    expect(payload.sub).toBe(USER);
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
  });

  it("expires shortly after issue so a leaked token is near-useless", () => {
    const payload = decodePayload(mintUserJwt(USER, SECRET, 1_000, 60));
    expect(payload.iat).toBe(1_000);
    expect(payload.exp).toBe(1_060);
  });

  it("signs with HS256 over header.payload", () => {
    const jwt = mintUserJwt(USER, SECRET, 1_000);
    const [header, payload, sig] = jwt.split(".");
    const expected = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    expect(sig).toBe(expected);
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("does not verify under the wrong secret", () => {
    const jwt = mintUserJwt(USER, SECRET, 1_000);
    const [header, payload, sig] = jwt.split(".");
    const wrong = createHmac("sha256", "other-secret").update(`${header}.${payload}`).digest("base64url");
    expect(sig).not.toBe(wrong);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/__tests__/user-jwt.test.ts`
Expected: FAIL — cannot resolve `../user-jwt`.

- [ ] **Step 4: Implement**

Create `src/lib/auth/user-jwt.ts`:

```ts
/**
 * Mints a Supabase-compatible user JWT.
 *
 * API-token requests arrive with no cookies, so there is no Supabase session
 * to ride on. Rather than fall back to the service role (which bypasses RLS
 * and would make every vault endpoint a fresh authorization surface), we sign
 * a short-lived JWT carrying the caller's user id. Postgres then applies the
 * *existing* RLS policies verbatim — `auth.uid()` resolves exactly as it does
 * for a browser session.
 *
 * TTL is deliberately tiny: the JWT is minted per-request and used
 * immediately, so it never needs to outlive the request that created it.
 */
import "server-only";
import { createHmac } from "node:crypto";

const DEFAULT_TTL_SEC = 60;

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function mintUserJwt(
  userId: string,
  secret: string,
  nowSec: number,
  ttlSec: number = DEFAULT_TTL_SEC,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iat: nowSec,
      exp: nowSec + ttlSec,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/__tests__/user-jwt.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Set the real secret**

Get the JWT secret from the Supabase dashboard (Project Settings → API → JWT Settings → JWT Secret) for project `umdksvftvugxlrartnhn`, then:

```bash
vercel env add SUPABASE_JWT_SECRET production
vercel env add SUPABASE_JWT_SECRET preview
vercel env add SUPABASE_JWT_SECRET development
```

Also add it to local `.env.local`.

**Resolved 2026-07-18:** the legacy symmetric JWT Secret was confirmed present in the dashboard for this project, so HS256 is the approach. (Supabase now defaults new projects to asymmetric signing keys and marks the legacy secret deprecated; this project retains it. If it is ever migrated to signing keys, this resolver must be revisited — self-signing would then require importing our own ES256 key and rotating it project-wide, which would make our key sign all real user logins.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/user-jwt.ts src/lib/auth/__tests__/user-jwt.test.ts src/lib/env.ts vitest.config.ts
git commit -m "feat(vault): mint user-scoped Supabase JWTs for API-token requests"
```

---

## Task 2: API token table + token helpers

**Files:**
- Create: `supabase/migrations/0016_api_tokens.sql`
- Create: `src/lib/auth/api-token.ts`
- Create: `src/lib/auth/__tests__/api-token.test.ts`
- Modify: `src/db/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateApiToken(): string`, `hashApiToken(token: string): string`, `looksLikeApiToken(value: string): boolean`, `TOKEN_PREFIX: "pat_"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/api-token.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken, looksLikeApiToken, TOKEN_PREFIX } from "../api-token";

describe("generateApiToken", () => {
  it("is prefixed and long enough to resist guessing", () => {
    const token = generateApiToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateApiToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashApiToken", () => {
  it("is sha-256 of the raw token", () => {
    expect(hashApiToken("pat_abc")).toBe(createHash("sha256").update("pat_abc").digest("hex"));
  });

  it("is stable and distinguishes different tokens", () => {
    expect(hashApiToken("pat_abc")).toBe(hashApiToken("pat_abc"));
    expect(hashApiToken("pat_abc")).not.toBe(hashApiToken("pat_abd"));
  });
});

describe("looksLikeApiToken", () => {
  it("accepts a generated token", () => {
    expect(looksLikeApiToken(generateApiToken())).toBe(true);
  });

  it("rejects junk, so we skip the DB round-trip on obvious garbage", () => {
    expect(looksLikeApiToken("")).toBe(false);
    expect(looksLikeApiToken("Bearer")).toBe(false);
    expect(looksLikeApiToken("pat_short")).toBe(false);
    expect(looksLikeApiToken("eyJhbGciOiJIUzI1NiJ9.x.y")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/__tests__/api-token.test.ts`
Expected: FAIL — cannot resolve `../api-token`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/api-token.ts`:

```ts
/**
 * Personal access tokens for the Obsidian plugin (and any future API client).
 *
 * Only the SHA-256 hash is ever persisted — the raw token is shown to the user
 * exactly once at creation. A stolen database therefore yields no usable
 * tokens. No salt/bcrypt here on purpose: these are 256 bits of CSPRNG output,
 * not user-chosen passwords, so there is nothing to brute-force or rainbow.
 */
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "pat_";

/** 32 random bytes → 43 base64url chars. */
export function generateApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check so malformed Authorization headers skip the DB lookup. */
export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 40;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/__tests__/api-token.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/0016_api_tokens.sql`:

```sql
-- 0016_api_tokens.sql
-- Personal access tokens, so the Obsidian plugin can authenticate as a user
-- without a browser session.
--
-- Only `token_hash` (sha-256 of the raw token) is stored; the raw `pat_…`
-- value is displayed once at creation and never again. Lookup is by hash, so
-- the column is unique and indexed.
--
-- Revocation is a soft delete (`revoked_at`) rather than a row delete so the
-- token list can keep showing what was revoked and when.

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  name text not null,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index api_tokens_user_id_idx on api_tokens (user_id);

alter table api_tokens enable row level security;

-- A user manages only their own tokens. The resolver reads this table with the
-- service role (the caller has no identity yet at that point), which bypasses
-- this policy by design; the policy governs the settings UI.
create policy api_tokens_owner on api_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 6: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (project `umdksvftvugxlrartnhn`, name `api_tokens`) with the SQL above. Then confirm:

Run the MCP `list_tables` tool and expect `api_tokens` to be present.

- [ ] **Step 7: Add the table to `src/db/types.ts`**

In the `Tables` block, following the existing style:

```ts
      api_tokens: {
        Row: {
          id: string
          user_id: string
          token_hash: string
          name: string
          last_used_at: string | null
          created_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          token_hash: string
          name: string
          last_used_at?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          token_hash?: string
          name?: string
          last_used_at?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/auth/api-token.ts src/lib/auth/__tests__/api-token.test.ts supabase/migrations/0016_api_tokens.sql src/db/types.ts
git commit -m "feat(vault): add api_tokens table and token helpers"
```

---

## Task 3: Bearer token resolver

**Files:**
- Create: `src/db/user-client.ts`
- Create: `src/server/auth/bearer.ts`
- Create: `src/server/auth/__tests__/bearer.test.ts`

**Interfaces:**
- Consumes: `mintUserJwt` (Task 1); `hashApiToken`, `looksLikeApiToken` (Task 2); `serviceClient()` from `@/db/service`.
- Produces:
  - `userScopedClient(userId: string): SupabaseClient<Database>`
  - `type ApiCaller = { userId: string; supabase: SupabaseClient<Database> }`
  - `resolveApiToken(request: Request): Promise<ApiCaller | null>`

- [ ] **Step 1: Write the failing test**

Create `src/server/auth/__tests__/bearer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "@/lib/auth/api-token";

const mocks = vi.hoisted(() => ({
  serviceClient: vi.fn(),
  userScopedClient: vi.fn(() => ({ marker: "user-scoped" })),
}));

vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));
vi.mock("@/db/user-client", () => ({ userScopedClient: mocks.userScopedClient }));

import { resolveApiToken } from "../bearer";

const VALID = `pat_${"a".repeat(43)}`;

/** Minimal stand-in for the api_tokens table that matches on token_hash. */
function makeServiceClient(rows: Array<{ id: string; user_id: string; revoked_at: string | null; token_hash: string }>) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    from(table: string) {
      if (table !== "api_tokens") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, value: unknown) => ({
            maybeSingle: async () => ({ data: rows.find((r) => r.token_hash === value) ?? null, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

function request(header?: string): Request {
  return new Request("https://example.test/api/vault/pending", {
    headers: header ? { authorization: header } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveApiToken", () => {
  it("resolves a live token to its user with an RLS-scoped client", async () => {
    mocks.serviceClient.mockReturnValue(
      makeServiceClient([{ id: "t1", user_id: "u1", revoked_at: null, token_hash: hashApiToken(VALID) }]),
    );
    const caller = await resolveApiToken(request(`Bearer ${VALID}`));
    expect(caller?.userId).toBe("u1");
    expect(mocks.userScopedClient).toHaveBeenCalledWith("u1");
    expect(caller?.supabase).toEqual({ marker: "user-scoped" });
  });

  it("rejects a revoked token", async () => {
    mocks.serviceClient.mockReturnValue(
      makeServiceClient([
        { id: "t1", user_id: "u1", revoked_at: "2026-07-01T00:00:00Z", token_hash: hashApiToken(VALID) },
      ]),
    );
    expect(await resolveApiToken(request(`Bearer ${VALID}`))).toBeNull();
  });

  it("rejects an unknown token", async () => {
    mocks.serviceClient.mockReturnValue(makeServiceClient([]));
    expect(await resolveApiToken(request(`Bearer ${VALID}`))).toBeNull();
  });

  it("rejects missing and malformed headers without touching the database", async () => {
    mocks.serviceClient.mockReturnValue(makeServiceClient([]));
    expect(await resolveApiToken(request())).toBeNull();
    expect(await resolveApiToken(request("Basic abc"))).toBeNull();
    expect(await resolveApiToken(request("Bearer nope"))).toBeNull();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("stamps last_used_at on a successful resolve", async () => {
    const svc = makeServiceClient([{ id: "t1", user_id: "u1", revoked_at: null, token_hash: hashApiToken(VALID) }]);
    mocks.serviceClient.mockReturnValue(svc);
    await resolveApiToken(request(`Bearer ${VALID}`));
    expect(svc.updates).toHaveLength(1);
    expect(typeof svc.updates[0].last_used_at).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/auth/__tests__/bearer.test.ts`
Expected: FAIL — cannot resolve `../bearer`.

- [ ] **Step 3: Implement the user-scoped client**

Create `src/db/user-client.ts`:

```ts
/**
 * A Supabase client that Postgres sees as a specific user.
 *
 * Used only on the API-token path, where there are no auth cookies to build a
 * session from. Because the attached JWT carries `sub = userId`, every
 * existing RLS policy applies unchanged — this is emphatically NOT a
 * service-role client and must never be swapped for one.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { mintUserJwt } from "@/lib/auth/user-jwt";
import type { Database } from "@/db/types";

export function userScopedClient(userId: string) {
  const jwt = mintUserJwt(userId, process.env.SUPABASE_JWT_SECRET!, Math.floor(Date.now() / 1000));
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `accessToken` is the current API for supplying a custom JWT. Setting
      // `global.headers.Authorization` is explicitly deprecated by Supabase
      // ("no longer recommended … causes confusion when combined with a user
      // session"). The anon key still travels separately as `apikey` — the
      // minted JWT cannot serve that role.
      accessToken: async () => jwt,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
```

**Construct a fresh client per request — never a module-level singleton.** It carries user-specific state, and Fluid Compute reuses function instances across concurrent requests, so a shared client would leak one user's scope into another's request.

- [ ] **Step 4: Implement the resolver**

Create `src/server/auth/bearer.ts`:

```ts
/**
 * Resolves an `Authorization: Bearer pat_…` header to a caller.
 *
 * The api_tokens lookup uses the service role because the caller has no
 * identity yet — that is the one and only service-role read on this path. The
 * client handed back is user-scoped, so everything downstream runs under
 * normal RLS.
 *
 * Returns null for every failure mode (missing, malformed, unknown, revoked)
 * so callers cannot accidentally distinguish "no such token" from "revoked".
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/db/service";
import { userScopedClient } from "@/db/user-client";
import { hashApiToken, looksLikeApiToken } from "@/lib/auth/api-token";
import type { Database } from "@/db/types";

export type ApiCaller = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

export async function resolveApiToken(request: Request): Promise<ApiCaller | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!looksLikeApiToken(token)) return null;

  const svc = serviceClient();
  const { data } = await svc
    .from("api_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hashApiToken(token))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Best-effort: a failed stamp must not fail the request.
  await svc.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { userId: data.user_id, supabase: userScopedClient(data.user_id) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/auth/__tests__/bearer.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/db/user-client.ts src/server/auth/bearer.ts src/server/auth/__tests__/bearer.test.ts
git commit -m "feat(vault): resolve bearer API tokens to RLS-scoped callers"
```

---

## Task 4: Token settings UI

**Files:**
- Create: `src/app/app/settings/tokens/page.tsx`
- Create: `src/app/app/settings/tokens/token-actions.ts`
- Create: `src/app/app/settings/tokens/__tests__/token-actions.test.ts`

**Interfaces:**
- Consumes: `generateApiToken`, `hashApiToken` (Task 2); `getViewer()` from `@/db/queries`.
- Produces: `createToken(name: string): Promise<{ token: string }>`, `revokeToken(id: string): Promise<void>`

Follow the existing pattern in `src/app/app/settings/profile-actions.ts` for server-action shape and its test in `src/app/app/settings/__tests__/profile-actions.test.ts` for mocking style. Read both before starting.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/settings/tokens/__tests__/token-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken, TOKEN_PREFIX } from "@/lib/auth/api-token";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createToken, revokeToken } from "../token-actions";

function viewerClient() {
  return {
    from(table: string) {
      if (table !== "api_tokens") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: Record<string, unknown>) => {
          mocks.insert(row);
          return Promise.resolve({ error: null });
        },
        update: (patch: Record<string, unknown>) => {
          mocks.update(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({ user: { id: "u1" }, supabase: viewerClient() });
});

describe("createToken", () => {
  it("returns the raw token but stores only its hash", async () => {
    const { token } = await createToken("Obsidian – laptop");
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);

    const row = mocks.insert.mock.calls[0][0];
    expect(row.token_hash).toBe(hashApiToken(token));
    expect(row.user_id).toBe("u1");
    expect(row.name).toBe("Obsidian – laptop");
    // The raw token must never be persisted under any key.
    expect(Object.values(row)).not.toContain(token);
  });

  it("rejects a blank name", async () => {
    await expect(createToken("   ")).rejects.toThrow(/name/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("revokeToken", () => {
  it("soft-deletes by stamping revoked_at", async () => {
    await revokeToken("t1");
    expect(typeof mocks.update.mock.calls[0][0].revoked_at).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/app/settings/tokens/__tests__/token-actions.test.ts`
Expected: FAIL — cannot resolve `../token-actions`.

- [ ] **Step 3: Implement the actions**

Create `src/app/app/settings/tokens/token-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";
import { generateApiToken, hashApiToken } from "@/lib/auth/api-token";

/**
 * Creates a token and returns the raw value ONCE. Only the hash is stored, so
 * this return value is the single opportunity to show it to the user.
 * Writes go through the viewer's own client, so the api_tokens RLS policy
 * guarantees a user can only mint tokens for themselves.
 */
export async function createToken(name: string): Promise<{ token: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A token name is required");

  const { user, supabase } = await getViewer();
  const token = generateApiToken();

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    token_hash: hashApiToken(token),
    name: trimmed,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/app/settings/tokens");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const { supabase } = await getViewer();
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/app/settings/tokens");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/app/settings/tokens/__tests__/token-actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Build the page**

Create `src/app/app/settings/tokens/page.tsx`. Requirements:
- Server component; lists the viewer's tokens (`id`, `name`, `created_at`, `last_used_at`, `revoked_at`) newest-first via `getViewer()`'s supabase client.
- A "Create token" form (client component) calling `createToken`, which reveals the raw token **once** in a copyable block with the warning "Copy this now — you won't be able to see it again."
- Each live token row shows name, created date, "Last used <date>" or "Never used", and a Revoke button calling `revokeToken`. Revoked tokens render greyed with "Revoked <date>" and no button.
- Match the existing settings page's visual language — read `src/app/app/settings/page.tsx` and reuse its card/section markup and design tokens (`--paper`, `--green`, Newsreader). Follow the width standard: `w-full` container, inputs capped around `max-w-3xl`.

- [ ] **Step 6: Verify the page renders**

Run `npm run dev`, sign in, visit `/app/settings/tokens`. Create a token, confirm the raw value appears once, reload and confirm it is not shown again, then revoke it and confirm the row greys out.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/settings/tokens
git commit -m "feat(vault): add API token settings page"
```

---

## Task 5: Extract export data assembly

Pure refactor — no behavior change. This unlocks Task 6 without duplicating the assembly logic.

**Files:**
- Create: `src/server/export/series-data.ts`
- Create: `src/server/export/__tests__/series-data.test.ts`
- Modify: `src/app/api/series/[id]/export/route.ts`

**Interfaces:**
- Consumes: `getSeries`, `getSeriesKnowledge`, `getInterviewMessages`, `listInterviewsForSeries` from `@/db/queries`; the `SeriesExport*` types from `@/server/export/markdown`.
- Produces:
  ```ts
  export type SeriesExportData = {
    series: { title: string; subjectName: string; goal: string };
    summaries: Array<{ short: string; date: string }>;
    factsByTopic: SeriesExportTopicGroup[];
    people: SeriesExportPerson[];
    places: string[];
    timeline: SeriesExportTimelineEntry[];
    transcripts?: SeriesExportTranscript[];
  };
  export async function buildSeriesExportData(
    supabase: SupabaseClient<Database>,
    seriesId: string,
    scope: SeriesExportScope,
  ): Promise<SeriesExportData | null>;
  ```
  Returns `null` when the series is not visible to the caller (preserving the route's 404-no-leak behavior).

- [ ] **Step 1: Save a baseline to diff against**

Before touching anything, capture the current output so Step 6 can prove the refactor changed nothing. With `npm run dev` running and signed in, download an export for a series that has facts, entities and at least two sessions:

```bash
curl -s -b "<your-session-cookies>" \
  "http://localhost:3000/api/series/<series-id>/export?format=md&scope=summaries,facts,entities,timeline" \
  > /tmp/export-baseline.md
wc -l /tmp/export-baseline.md   # expect a non-empty file
```

Easier alternative: use the browser's export button and move the downloaded file to `/tmp/export-baseline.md`. Either way, **confirm the file is non-empty before proceeding** — an empty baseline proves nothing later.

- [ ] **Step 2: Move the logic**

Create `src/server/export/series-data.ts` by moving the body of the existing GET handler in `src/app/api/series/[id]/export/route.ts` — everything from the `getSeries` call through building `timeline` and `transcripts` — into `buildSeriesExportData`. Move the private helpers `formatOffset` and `formatDateLabel` along with it. Return `null` where the route currently returns the 404 response. **Do not change any of the logic**, including the session re-sort (`Session 1` first) and the superseded-fact filter.

- [ ] **Step 3: Rewrite the route to delegate**

`src/app/api/series/[id]/export/route.ts` keeps `DEFAULT_SCOPE`, `parseScope`, and the GET handler, now shaped as:

```ts
export async function GET(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { supabase } = await getViewer();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "txt" ? "txt" : "md";
  const scope = parseScope(url.searchParams.get("scope"));

  const data = await buildSeriesExportData(supabase, id, scope);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const markdown = renderSeriesMarkdown({ ...data, scope });
  const body = format === "txt" ? stripMarkdownToText(markdown) : markdown;
  const filename = `${slugifyTitle(data.series.title)}.${format}`;
  const contentType = format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 4: Write a characterization test**

Create `src/server/export/__tests__/series-data.test.ts` covering, with a stubbed supabase client and fixture rows (mock `@/db/queries` the same way `src/app/api/series/[id]/__tests__/route.test.ts` does — read it first):
- returns `null` for an invisible series;
- excludes superseded facts;
- groups facts under their topic name and puts topic-less facts in an `Other` group placed last;
- orders sessions oldest-first (`Session 1` before `Session 2`);
- omits `transcripts` unless `scope.transcripts` is true.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/server/export src/app/api/series`
Expected: PASS, including all pre-existing export tests — this is a refactor, so nothing previously passing may break.

- [ ] **Step 6: Verify the output is byte-identical**

Re-download the same series export the same way as Step 1, then diff against the baseline:

```bash
curl -s -b "<your-session-cookies>" \
  "http://localhost:3000/api/series/<same-series-id>/export?format=md&scope=summaries,facts,entities,timeline" \
  > /tmp/export-after.md
diff /tmp/export-baseline.md /tmp/export-after.md && echo "IDENTICAL"
```

Expected: `IDENTICAL` with no diff output. **Any difference means the refactor changed behavior — investigate and fix before committing**, since this task is defined as behavior-preserving.

- [ ] **Step 7: Commit**

```bash
git add src/server/export src/app/api/series/[id]/export/route.ts
git commit -m "refactor(export): extract series export data assembly"
```

---

## Task 6: JSON export format with content hashes

**Files:**
- Create: `src/server/export/hash.ts`
- Create: `src/server/export/__tests__/hash.test.ts`
- Modify: `src/server/export/series-data.ts` (add `buildJsonPayload`)
- Modify: `src/app/api/series/[id]/export/route.ts`
- Create: `src/app/api/series/[id]/export/__tests__/json-format.test.ts`

**Interfaces:**
- Consumes: `buildSeriesExportData`, `SeriesExportData` (Task 5); `resolveApiToken` (Task 3).
- Produces:
  - `stableHash(value: unknown): string` — 16-char hex.
  - JSON response shape:
    ```ts
    {
      series: { id: string; title: string; subjectName: string; goal: string };
      contentHash: string;
      topics: Array<{ name: string; hash: string; facts: Array<{ statement: string; sessionLabel: string; timestamp: string | null; entities: Array<{ id: string; name: string; kind: string }> }> }>;
      entities: Array<{ id: string; name: string; kind: "person" | "place" | "date"; detail: string | null; hash: string }>;
      summaries: Array<{ short: string; date: string }>;
      timeline: Array<{ label: string; statement: string }>;
    }
    ```

- [ ] **Step 1: Write the failing hash test**

Create `src/server/export/__tests__/hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stableHash } from "../hash";

describe("stableHash", () => {
  it("is stable across calls", () => {
    expect(stableHash({ a: 1, b: [2, 3] })).toBe(stableHash({ a: 1, b: [2, 3] }));
  });

  it("ignores key order, so an unrelated reshuffle does not trigger a rewrite", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it("changes when content changes", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("respects array order, which is meaningful for facts", () => {
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  it("is short enough to store per-note", () => {
    expect(stableHash({ a: 1 })).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/export/__tests__/hash.test.ts`
Expected: FAIL — cannot resolve `../hash`.

- [ ] **Step 3: Implement**

Create `src/server/export/hash.ts`:

```ts
/**
 * Content hashing for incremental vault sync.
 *
 * The plugin stores one hash per note and rewrites only what moved, so these
 * hashes must be stable across requests for unchanged content — hence the
 * key-sorted serialization. Array order IS preserved, because fact ordering is
 * meaningful and a reorder should rewrite the note.
 *
 * 16 hex chars (64 bits) is ample: this is change detection, not a security
 * boundary.
 */
import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/export/__tests__/hash.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add `format=json` and Bearer auth to the export route**

In `src/app/api/series/[id]/export/route.ts`:

Replace the fixed `getViewer()` call with a dual-path resolve, so the plugin (Bearer) and the browser (cookies) share one route:

```ts
async function resolveCaller(request: Request) {
  const apiCaller = await resolveApiToken(request);
  if (apiCaller) return apiCaller.supabase;
  const { supabase } = await getViewer();
  return supabase;
}
```

Then, after building `data`, branch before the Markdown render:

```ts
  if (url.searchParams.get("format") === "json") {
    return NextResponse.json(buildJsonPayload(id, data));
  }
```

`buildJsonPayload` lives in `src/server/export/series-data.ts` and maps `SeriesExportData` into the shape declared in this task's Interfaces block, computing `stableHash` per topic (over its `facts` array), per entity (over `{ name, kind, detail }`), and a top-level `contentHash` over the whole payload minus the `contentHash` field itself.

JSON requests always use the full scope (`summaries`, `facts`, `entities`, `timeline`; transcripts excluded) — the plugin mirrors the knowledge base, not transcripts.

- [ ] **Step 6: Write the route test**

Create `src/app/api/series/[id]/export/__tests__/json-format.test.ts`, mocking `@/server/export/series-data` and `@/server/auth/bearer`, asserting:
- `?format=json` returns `application/json` with the declared shape;
- omitting `format` still returns Markdown with the `Content-Disposition` attachment header (no regression);
- an unknown series yields 404 `{ error: "not_found" }`;
- a valid Bearer token uses the token's supabase client and never calls `getViewer`;
- no Bearer token falls back to `getViewer`;
- `contentHash` is unchanged for identical data and changes when a fact statement changes.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/app/api/series src/server/export`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/export src/app/api/series/[id]/export
git commit -m "feat(vault): add json export format with content hashes"
```

---

## Task 7: Series discovery endpoint

**Files:**
- Modify or create: `src/app/api/series/route.ts`
- Create: `src/app/api/series/__tests__/discovery.test.ts`

**Interfaces:**
- Consumes: `resolveApiToken` (Task 3); `getSeriesForUser` from `@/db/queries`.
- Produces: `GET /api/series?format=json` → `{ series: Array<{ id: string; title: string; subjectName: string; status: string }> }`

First read `src/app/api/series/route.ts` if it exists; preserve any existing handlers and add the `format=json` branch alongside them rather than replacing them.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/series/__tests__/discovery.test.ts` asserting:
- with a valid Bearer token, returns only `getSeriesForUser`'s rows mapped to the declared shape;
- with no token and no session, returns 401 `{ error: "unauthorized" }`;
- with a revoked/unknown token, returns 401 (never 500).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/series/__tests__/discovery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("format") !== "json") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await getSeriesForUser(caller.supabase);
  return NextResponse.json({
    series: rows.map((s) => ({
      id: s.id,
      title: s.title,
      subjectName: s.subject_name,
      status: s.status,
    })),
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/api/series`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/series/route.ts src/app/api/series/__tests__/discovery.test.ts
git commit -m "feat(vault): add series discovery endpoint for the plugin"
```

---

## Task 8: Vault link table

**Files:**
- Create: `supabase/migrations/0017_series_vault_links.sql`
- Modify: `src/db/types.ts`
- Create: `src/db/queries/vault.ts`
- Create: `src/db/__tests__/vault.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type VaultLink = {
    series_id: string;
    user_id: string;
    label: string;
    linked_at: string;
    push_requested_at: string | null;
    last_acked_at: string | null;
  };
  export function isPushPending(link: Pick<VaultLink, "push_requested_at" | "last_acked_at">): boolean;
  export async function getVaultLink(sb, seriesId): Promise<VaultLink | null>;
  export async function listPendingVaultLinks(sb): Promise<VaultLink[]>;
  ```

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0017_series_vault_links.sql`:

```sql
-- 0017_series_vault_links.sql
-- Tracks that a series is linked to a user's Obsidian vault, and whether the
-- user has asked for an update to be sent.
--
-- The server deliberately stores NO local filesystem path — the vault folder
-- and layout live in the plugin's own config. All this table knows is *that* a
-- link exists (so the UI can show a Vault card) and *whether* an update is
-- waiting to be collected.
--
-- `push_requested_at` is latest-wins, not a queue: pressing Send twice before
-- the plugin collects means one delivery of current state, which is correct
-- for a mirror. Pending == push_requested_at > last_acked_at.
--
-- Primary key is (series_id, user_id): two users who both linked the same
-- series to their own vaults each get an independent flag.

create table series_vault_links (
  series_id uuid not null references series(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  linked_at timestamptz not null default now(),
  push_requested_at timestamptz null,
  last_acked_at timestamptz null,
  primary key (series_id, user_id)
);

create index series_vault_links_user_idx on series_vault_links (user_id);

alter table series_vault_links enable row level security;

-- A user sees and manages only their own links. Combined with the series RLS
-- (can_view_series), linking a series you cannot see fails on the FK insert
-- path anyway.
create policy series_vault_links_owner on series_vault_links
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (project `umdksvftvugxlrartnhn`, name `series_vault_links`). Confirm with `list_tables`.

- [ ] **Step 3: Add the table to `src/db/types.ts`**

Add a `series_vault_links` entry with `Row`/`Insert`/`Update`/`Relationships` mirroring the columns above, following the `api_tokens` entry added in Task 2 for style.

- [ ] **Step 4: Write the failing test**

Create `src/db/__tests__/vault.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPushPending } from "@/db/queries/vault";

describe("isPushPending", () => {
  it("is pending when the user pressed Send and the plugin has never acked", () => {
    expect(isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: null })).toBe(true);
  });

  it("is not pending before the user ever pressed Send", () => {
    expect(isPushPending({ push_requested_at: null, last_acked_at: null })).toBe(false);
    expect(isPushPending({ push_requested_at: null, last_acked_at: "2026-07-18T10:00:00Z" })).toBe(false);
  });

  it("is not pending once the plugin acks a later timestamp", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:01Z" }),
    ).toBe(false);
  });

  it("is pending again when the user presses Send after the last ack", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T11:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(true);
  });

  it("treats an ack at the exact request time as collected", () => {
    expect(
      isPushPending({ push_requested_at: "2026-07-18T10:00:00Z", last_acked_at: "2026-07-18T10:00:00Z" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/vault.test.ts`
Expected: FAIL — cannot resolve `@/db/queries/vault`.

- [ ] **Step 6: Implement**

Create `src/db/queries/vault.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

export type VaultLink = {
  series_id: string;
  user_id: string;
  label: string;
  linked_at: string;
  push_requested_at: string | null;
  last_acked_at: string | null;
};

/**
 * A push is waiting whenever the user's Send is newer than the plugin's last
 * ack. An ack at exactly the request time counts as collected — the plugin
 * stamps its ack after a successful write, so equality means "that write
 * covered this request."
 */
export function isPushPending(link: Pick<VaultLink, "push_requested_at" | "last_acked_at">): boolean {
  if (!link.push_requested_at) return false;
  if (!link.last_acked_at) return true;
  return new Date(link.push_requested_at).getTime() > new Date(link.last_acked_at).getTime();
}

export async function getVaultLink(
  sb: SupabaseClient<Database>,
  seriesId: string,
): Promise<VaultLink | null> {
  const { data, error } = await sb
    .from("series_vault_links")
    .select("*")
    .eq("series_id", seriesId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VaultLink | null) ?? null;
}

/** Every link belonging to the caller that has an uncollected push. */
export async function listPendingVaultLinks(sb: SupabaseClient<Database>): Promise<VaultLink[]> {
  const { data, error } = await sb.from("series_vault_links").select("*");
  if (error) throw new Error(error.message);
  return ((data as VaultLink[] | null) ?? []).filter(isPushPending);
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/db/__tests__/vault.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), no type errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0017_series_vault_links.sql src/db/types.ts src/db/queries/vault.ts src/db/__tests__/vault.test.ts
git commit -m "feat(vault): add series_vault_links table and pending logic"
```

---

## Task 9: Vault link / pending / ack endpoints

**Files:**
- Create: `src/app/api/series/[id]/vault-link/route.ts`
- Create: `src/app/api/series/[id]/vault-ack/route.ts`
- Create: `src/app/api/vault/pending/route.ts`
- Create: `src/app/api/vault/__tests__/vault-routes.test.ts`

**Interfaces:**
- Consumes: `resolveApiToken` (Task 3); `listPendingVaultLinks`, `getVaultLink` (Task 8); `getSeries` from `@/db/queries`.
- Produces:
  - `POST /api/series/[id]/vault-link` body `{ label: string }` → `{ ok: true }` (idempotent upsert)
  - `DELETE /api/series/[id]/vault-link` → `{ ok: true }`
  - `POST /api/series/[id]/vault-ack` → `{ ok: true }`
  - `GET /api/vault/pending` → `{ pending: Array<{ seriesId: string; title: string; requestedAt: string }> }`

All three are plugin-facing and **Bearer-only** — no cookie fallback. Unauthenticated → 401 `{ error: "unauthorized" }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/vault/__tests__/vault-routes.test.ts` asserting:
- `POST vault-link` upserts `{ series_id, user_id, label }` and is idempotent (calling twice yields one row, second call updates `label` without resetting `linked_at`);
- `POST vault-link` on a series the caller cannot see returns 404 (via `getSeries` returning null — no existence leak, matching the export route's convention);
- `DELETE vault-link` removes the row;
- `POST vault-ack` stamps `last_acked_at` to now;
- `GET vault/pending` returns only links where `isPushPending` is true, with `seriesId`/`title`/`requestedAt`;
- every route returns 401 with a missing or unresolvable Bearer token, and never 500.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/vault`
Expected: FAIL — routes do not exist.

- [ ] **Step 3: Implement `vault-link`**

```ts
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "label_required" }, { status: 400 });

  // 404 rather than 403 for an invisible series — same no-leak convention the
  // export route uses.
  const series = await getSeries(caller.supabase, id);
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await caller.supabase
    .from("series_vault_links")
    .upsert({ series_id: id, user_id: caller.userId, label }, { onConflict: "series_id,user_id" });
  if (error) return NextResponse.json({ error: "link_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await caller.supabase.from("series_vault_links").delete().eq("series_id", id);
  if (error) return NextResponse.json({ error: "unlink_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

Note the `upsert` must not overwrite `linked_at` (it has a default and is absent from the payload, so it is preserved on conflict update).

- [ ] **Step 4: Implement `vault-ack`**

Same auth preamble, then:

```ts
  const { error } = await caller.supabase
    .from("series_vault_links")
    .update({ last_acked_at: new Date().toISOString() })
    .eq("series_id", id);
  if (error) return NextResponse.json({ error: "ack_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
```

- [ ] **Step 5: Implement `vault/pending`**

```ts
export async function GET(request: Request) {
  const caller = await resolveApiToken(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await listPendingVaultLinks(caller.supabase);
  if (links.length === 0) return NextResponse.json({ pending: [] });

  const { data: rows } = await caller.supabase
    .from("series")
    .select("id, title")
    .in("id", links.map((l) => l.series_id));
  const titleById = new Map((rows ?? []).map((r) => [r.id, r.title] as const));

  return NextResponse.json({
    pending: links.map((l) => ({
      seriesId: l.series_id,
      title: titleById.get(l.series_id) ?? "Untitled series",
      requestedAt: l.push_requested_at as string,
    })),
  });
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/app/api/vault`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/series/[id]/vault-link src/app/api/series/[id]/vault-ack src/app/api/vault
git commit -m "feat(vault): add vault link, ack, and pending endpoints"
```

---

## Task 10: Vault card + "Send update to vault" button

**Files:**
- Create: `src/app/app/series/[id]/VaultCard.tsx`
- Create: `src/app/app/series/[id]/vault-actions.ts`
- Create: `src/app/app/series/[id]/__tests__/vault-actions.test.ts`
- Modify: `src/app/app/series/[id]/page.tsx`

**Interfaces:**
- Consumes: `getVaultLink`, `isPushPending`, `VaultLink` (Task 8); `getViewer` from `@/db/queries`.
- Produces: `requestVaultPush(seriesId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/app/app/series/[id]/__tests__/vault-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { requestVaultPush } from "../vault-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewer.mockResolvedValue({
    user: { id: "u1" },
    supabase: {
      from(table: string) {
        if (table !== "series_vault_links") throw new Error(`unexpected table ${table}`);
        return {
          update: (patch: Record<string, unknown>) => {
            mocks.update(patch);
            return {
              eq: (col: string, val: unknown) => {
                mocks.eq(col, val);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
  });
});

describe("requestVaultPush", () => {
  it("stamps push_requested_at for the given series", async () => {
    await requestVaultPush("s1");
    expect(typeof mocks.update.mock.calls[0][0].push_requested_at).toBe("string");
    expect(mocks.eq).toHaveBeenCalledWith("series_id", "s1");
  });

  it("refreshes the series page so the card shows the queued state", async () => {
    await requestVaultPush("s1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/series/s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/app/series/[id]/__tests__/vault-actions.test.ts`
Expected: FAIL — cannot resolve `../vault-actions`.

- [ ] **Step 3: Implement the action**

Create `src/app/app/series/[id]/vault-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/db/queries";

/**
 * The user-initiated half of the push. Stamping `push_requested_at` is all the
 * server can do — it cannot write to the user's local vault, so the plugin
 * collects this flag the next time Obsidian is open.
 *
 * RLS scopes the update to the caller's own link row, so no explicit user_id
 * filter is needed (and adding one would not hurt).
 */
export async function requestVaultPush(seriesId: string): Promise<void> {
  const { supabase } = await getViewer();
  const { error } = await supabase
    .from("series_vault_links")
    .update({ push_requested_at: new Date().toISOString() })
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);

  revalidatePath(`/app/series/${seriesId}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/app/series/[id]/__tests__/vault-actions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the card**

Create `src/app/app/series/[id]/VaultCard.tsx` — a server component taking `{ seriesId, link }: { seriesId: string; link: VaultLink | null }`, with a small client child for the Send button:

- **Unlinked** (`link === null`): heading "Obsidian vault", body "Connect this story to your vault to keep a Markdown copy in your notes.", and a link to setup instructions. No Send button.
- **Linked, nothing pending**: shows `link.label`, "Last sent {formatted last_acked_at}" or "Never sent", and the primary **"Send update to vault"** button.
- **Linked, push pending** (`isPushPending(link)`): the button is replaced with the status "Update queued — it'll arrive next time Obsidian is open." Keep an "Unlink" affordance available in both linked states.

Match the surrounding series-page cards — read `src/app/app/series/[id]/page.tsx` first and reuse its card markup and design tokens. Follow the width standard (`w-full`, readable caps on prose).

- [ ] **Step 6: Mount it**

In `src/app/app/series/[id]/page.tsx`, fetch the link alongside the existing series data and render the card in the sidebar/detail column next to the existing export affordance:

```tsx
const vaultLink = await getVaultLink(supabase, id);
// …
<VaultCard seriesId={id} link={vaultLink} />
```

- [ ] **Step 7: Verify live**

Run `npm run dev` and open a series page. Confirm the unlinked state renders. Then insert a link row manually via the Supabase MCP `execute_sql` tool:

```sql
insert into series_vault_links (series_id, user_id, label)
values ('<series-id>', '<your-user-id>', 'My Vault / PostAud');
```

Reload: the card shows the label, "Never sent", and the Send button. Press Send, confirm the card flips to the queued state, and verify `push_requested_at` is set:

```sql
select push_requested_at, last_acked_at from series_vault_links where series_id = '<series-id>';
```

- [ ] **Step 8: Full check and commit**

Run: `rm -rf .next && npm run build && npx vitest run && npx tsc --noEmit`
Expected: build succeeds, all tests pass, no type errors.

```bash
git add src/app/app/series/[id]
git commit -m "feat(vault): add vault card and send-update button to series page"
```

---

## Task 11: End-to-end verification

No new code — proves the server half works as a unit before the plugin exists.

- [ ] **Step 1: Create a token**

Visit `/app/settings/tokens`, create "Obsidian – test", copy the raw `pat_…` value.

- [ ] **Step 2: Exercise the plugin's exact request sequence**

```bash
TOKEN='pat_…'
BASE='http://localhost:3000'

# Discovery
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/series?format=json" | jq

# Link a series (use an id from the previous response)
SERIES='…'
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"label":"My Vault / PostAud"}' "$BASE/api/series/$SERIES/vault-link" | jq

# Nothing pending yet
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/vault/pending" | jq

# → Now press "Send update to vault" in the browser, then:
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/vault/pending" | jq   # expect one entry

# Fetch content and ack
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/series/$SERIES/export?format=json" | jq '.contentHash'
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/series/$SERIES/vault-ack" | jq
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/vault/pending" | jq   # expect []
```

Expected: discovery lists your series; pending is empty until Send, holds one entry after, and is empty again after ack.

- [ ] **Step 3: Verify the security boundary**

```bash
# No token → 401 everywhere
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/vault/pending"                    # 401
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/series?format=json"               # 401

# Revoked token → 401 (revoke it in the UI first)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "$BASE/api/vault/pending"  # 401

# Another user's series → 404, not 403
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/series/<other-users-series-id>/export?format=json"                        # 404
```

**The other-user check is the one that must not be skipped** — it is the proof that the minted JWT really is RLS-scoped and not silently service-role.

- [ ] **Step 4: Confirm content hashing tracks real changes**

Record `contentHash`, run an interview that adds facts, re-fetch, and confirm the top-level hash changed and that only the affected topic's hash moved.

- [ ] **Step 5: Deploy**

```bash
git push
```

Confirm `SUPABASE_JWT_SECRET` is set in Vercel production (Task 1 Step 6) and **redeploy** — env changes need a fresh deploy to take effect. Re-run Step 2 against the production URL.

---

## Self-Review Notes

**Spec coverage:** §2a tokens → Tasks 2–4. §2b JSON export → Tasks 5–6. §2c discovery → Task 7. §2d vault link/flag/UI → Tasks 8–10. The "one hard constraint" and trigger model are realized by Tasks 9–10 (flag set in UI, collected via pending/ack). Plugin sections (layouts, ownership contract, diff engine, archive/mirror, renames) are **deliberately out of scope** — Phase 2 plan.

**Deviation from spec, flagged:** the spec's §2a says the resolver yields a user and "existing RLS applies." It did not specify *how*. Task 1 resolves this with a minted user-scoped JWT and adds a new required env var (`SUPABASE_JWT_SECRET`) not named in the spec. This is the honest way to keep the RLS promise; the alternative (service-role + manual scoping) would have made every endpoint a new authorization surface. Task 1 Step 6 includes a stop-and-report branch if the project exposes no HS256 secret.

**Known gap carried from V1 debt:** existing unauthed APIs return 500 rather than 401. The new vault endpoints return 401 correctly and do not inherit that bug.
