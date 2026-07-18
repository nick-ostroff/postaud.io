import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CRITICAL 1 / MINOR 6 (final review): `SUPABASE_JWT_SECRET` is optional at
 * the `env()` schema level now (src/lib/env.ts) so a missing vault secret
 * can never 500 sign-in. That means `userScopedClient` — the one place that
 * actually needs the secret — must fail LOUDLY and CLOSED: throw a clear,
 * named error rather than silently minting a JWT with `undefined` or
 * falling back to some other (anon/service-role) access mode.
 *
 * `env()` caches its parse in a module-level singleton, so each test resets
 * the module registry and dynamically re-imports both `@/lib/env` (via
 * `@/db/user-client`) and `@/db/user-client` itself to get a fresh parse
 * against that test's process.env.
 */

const mocks = vi.hoisted(() => ({
  mintUserJwt: vi.fn(() => "signed.jwt.token"),
  createClient: vi.fn(() => ({ marker: "supabase-client" })),
}));

vi.mock("@/lib/auth/user-jwt", () => ({ mintUserJwt: mocks.mintUserJwt }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("userScopedClient", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it("throws a named, actionable error instead of silently producing an unscoped client when the secret is entirely unset", async () => {
    delete process.env.SUPABASE_JWT_SECRET;

    const { userScopedClient } = await import("@/db/user-client");

    expect(() => userScopedClient("user-1")).toThrow(
      /SUPABASE_JWT_SECRET is not set — API token authentication is unavailable/,
    );
    // Fail CLOSED: no JWT minted, no client built, no fallback to anon or
    // service-role access.
    expect(mocks.mintUserJwt).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("throws the same way for a blank secret (dotenv's `KEY=`, the actual current state of .env.local)", async () => {
    process.env.SUPABASE_JWT_SECRET = "";

    const { userScopedClient } = await import("@/db/user-client");

    expect(() => userScopedClient("user-1")).toThrow(/SUPABASE_JWT_SECRET is not set/);
    expect(mocks.mintUserJwt).not.toHaveBeenCalled();
  });

  it("mints a user-scoped JWT and builds a client when the secret is present", async () => {
    process.env.SUPABASE_JWT_SECRET = "a-real-secret";

    const { userScopedClient } = await import("@/db/user-client");
    const client = userScopedClient("user-1");

    expect(mocks.mintUserJwt).toHaveBeenCalledWith("user-1", "a-real-secret", expect.any(Number));
    expect(mocks.createClient).toHaveBeenCalled();
    expect(client).toEqual({ marker: "supabase-client" });
  });
});
