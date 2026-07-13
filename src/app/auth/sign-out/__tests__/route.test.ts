import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  jar: new Map<string, string>(),
}));

vi.mock("@/db/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...mocks.jar].map(([name, value]) => ({ name, value })),
    delete: (name: string) => mocks.jar.delete(name),
  }),
}));

import { IMP_COOKIE, PREV_COOKIE } from "@/lib/auth/impersonation";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jar.clear();
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("POST /auth/sign-out — MINOR 3: the fallback escape hatch must clear operator cookies", () => {
  it("deletes pa_op_imp and every pa_op_prev chunk", async () => {
    // Sign-out is how an operator escapes when Exit fails. If these survive, the
    // banner claims an active impersonation after they sign back in as
    // themselves, and Exit would replay a dead stash.
    mocks.jar.set("sb-x-auth-token", "TARGET");
    mocks.jar.set(IMP_COOKIE, "signed.session");
    mocks.jar.set(`${PREV_COOKIE}.0`, "chunk0");
    mocks.jar.set(`${PREV_COOKIE}.1`, "chunk1");
    mocks.jar.set(`${PREV_COOKIE}.2`, "chunk2");
    mocks.jar.set("theme", "dark");

    const res = await POST();

    expect(res.status).toBe(303);
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.jar.has(IMP_COOKIE)).toBe(false);
    expect(mocks.jar.has(`${PREV_COOKIE}.0`)).toBe(false);
    expect(mocks.jar.has(`${PREV_COOKIE}.1`)).toBe(false);
    expect(mocks.jar.has(`${PREV_COOKIE}.2`)).toBe(false);
    expect(mocks.jar.has("theme")).toBe(true); // unrelated cookies untouched
  });

  it("is a no-op on the operator cookies for an ordinary user signing out", async () => {
    mocks.jar.set("sb-x-auth-token", "USER");
    const res = await POST();
    expect(res.status).toBe(303);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
