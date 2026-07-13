import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getUser() resolves to whatever `mockUser` currently holds. Each test sets it
// before calling proxy() so we can simulate an unauthenticated caller (the
// state of someone mid-impersonation-exit: their session belongs to the
// target user, who is never a platform admin).
const mockUser = vi.hoisted(() => ({ current: null as { email: string } | null }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser.current } }),
    },
  })),
}));

import { proxy } from "../proxy";

const prevAdminEmails = process.env.PLATFORM_ADMIN_EMAILS;

beforeEach(() => {
  mockUser.current = null;
  // No admins configured — every caller in this file is a non-admin.
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

afterEach(() => {
  if (prevAdminEmails === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = prevAdminEmails;
});

describe("proxy /api/super gate", () => {
  it("404s a non-admin hitting the impersonation START route", async () => {
    mockUser.current = { email: "customer@example.com" };
    const req = new NextRequest("https://app.example.com/api/super/impersonate", { method: "POST" });
    const res = await proxy(req);
    expect(res.status).toBe(404);
  });

  it("404s a non-admin hitting /super directly", async () => {
    mockUser.current = { email: "customer@example.com" };
    const req = new NextRequest("https://app.example.com/super");
    const res = await proxy(req);
    expect(res.status).toBe(404);
  });

  it("does NOT 404 the impersonation EXIT route for a non-admin caller", async () => {
    // This is the exact situation at the moment of exit: the browser's
    // session belongs to the target user, not an admin.
    mockUser.current = { email: "customer@example.com" };
    const req = new NextRequest("https://app.example.com/api/super/impersonate/exit", { method: "POST" });
    const res = await proxy(req);
    expect(res.status).not.toBe(404);
  });

  it("does NOT 404 the impersonation EXIT route even for a fully unauthenticated caller", async () => {
    mockUser.current = null;
    const req = new NextRequest("https://app.example.com/api/super/impersonate/exit", { method: "POST" });
    const res = await proxy(req);
    expect(res.status).not.toBe(404);
  });
});
