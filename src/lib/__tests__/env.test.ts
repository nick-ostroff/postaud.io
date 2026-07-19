import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
describe("env", () => {
  it("no longer requires Twilio configuration", async () => {
    const src = await import("node:fs").then(fs =>
      fs.readFileSync("src/lib/env.ts", "utf8"));
    expect(src).not.toMatch(/TWILIO/);
    expect(src).not.toMatch(/STRIPE/);
    expect(src).toMatch(/OPENAI_API_KEY/);
    expect(src).toMatch(/CRON_SECRET/);
  });
});

/**
 * CRITICAL 1 (final review): `SUPABASE_JWT_SECRET` backs only the vault-sync
 * API-token path, but `env()` runs on every authenticated page render via
 * `isPlatformAdmin()` -> `platformAdminEmails()`. Before this fix, a blank or
 * unset secret (the real state of `.env.local` and every deployed
 * environment right now) made the whole schema.safeParse fail, throwing
 * "Missing or invalid environment variables" and 500ing every `/app/*` page.
 * These tests pin that it can never regress.
 *
 * `env()` caches its parsed result in a module-level singleton, so each test
 * resets the module registry and re-imports to get a fresh, uncached parse
 * against that test's process.env.
 */
describe("env() SUPABASE_JWT_SECRET handling", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = originalSecret;
    vi.resetModules();
  });

  it("does not throw when SUPABASE_JWT_SECRET is blank — dotenv's `KEY=` sets \"\", not undefined", async () => {
    process.env.SUPABASE_JWT_SECRET = "";

    const { env } = await import("@/lib/env");

    expect(() => env()).not.toThrow();
    expect(env().SUPABASE_JWT_SECRET).toBeUndefined();
  });

  it("does not throw when SUPABASE_JWT_SECRET is entirely unset", async () => {
    delete process.env.SUPABASE_JWT_SECRET;

    const { env } = await import("@/lib/env");

    expect(() => env()).not.toThrow();
    expect(env().SUPABASE_JWT_SECRET).toBeUndefined();
  });

  it("still validates a present-but-otherwise-invalid value the normal way (regression guard: this isn't `.optional()` on the whole object)", async () => {
    // Sanity check that other required fields are unaffected by the
    // preprocessing added for this one field.
    const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url";

    const { env } = await import("@/lib/env");
    expect(() => env()).toThrow(/Missing or invalid environment variables/);

    process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  });

  it("platformAdminEmails() — the exact call chain that 500'd /app/* — works with no SUPABASE_JWT_SECRET set", async () => {
    process.env.SUPABASE_JWT_SECRET = "";
    const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = "nick@pixelocity.com";

    const { platformAdminEmails } = await import("@/lib/env");
    expect(() => platformAdminEmails()).not.toThrow();
    expect(platformAdminEmails()).toContain("nick@pixelocity.com");

    if (originalAdmins === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
  });

  it("preserves a real secret when one is set", async () => {
    process.env.SUPABASE_JWT_SECRET = "a-real-secret";

    const { env } = await import("@/lib/env");

    expect(env().SUPABASE_JWT_SECRET).toBe("a-real-secret");
  });
});
