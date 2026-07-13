import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  platformAdminEmail: vi.fn(),
  mintSessionToken: vi.fn(),
  primaryOrgId: vi.fn(),
  logImpersonationStart: vi.fn(),
  logImpersonationEnd: vi.fn(),
  verifyOtp: vi.fn(),
  setAllSink: { current: null as null | ((c: { name: string; value: string; options?: object }[]) => void) },
}));

vi.mock("@/lib/auth/is-platform-admin", () => ({
  platformAdminEmail: mocks.platformAdminEmail,
}));

vi.mock("@/server/super/impersonate", () => ({
  mintSessionToken: mocks.mintSessionToken,
  primaryOrgId: mocks.primaryOrgId,
  logImpersonationStart: mocks.logImpersonationStart,
  logImpersonationEnd: mocks.logImpersonationEnd,
}));

// Stand-in for @supabase/ssr's createServerClient: verifyOtp is what writes the
// TARGET user's auth cookies onto the response, so the fake replays that by
// calling setAll with whatever cookies the test says the target session has.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    auth: {
      verifyOtp: async () => {
        const result = await mocks.verifyOtp();
        if (!result?.error) {
          opts.cookies.setAll(result?.targetCookies ?? []);
        }
        return { error: result?.error ?? null };
      },
    },
  }),
}));

import { packStash, encodeSession, PREV_COOKIE, IMP_COOKIE } from "@/lib/auth/impersonation";
import { POST as startPOST } from "../route";
import { POST as exitPOST } from "../exit/route";

type Cookie = { name: string; value: string };

function req(cookies: Cookie[], body?: unknown) {
  const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return new NextRequest("http://localhost:3000/api/super/impersonate", {
    method: "POST",
    headers: { cookie: header, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** name -> the value the browser ends up with. `null` means "cookie deleted". */
function resultingCookies(res: Response): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const c of (res as unknown as { cookies: { getAll: () => { name: string; value: string; expires?: Date; maxAge?: number }[] } }).cookies.getAll()) {
    const deleted = c.maxAge === 0 || (c.expires instanceof Date && c.expires.getTime() === 0);
    out.set(c.name, deleted ? null : c.value);
  }
  return out;
}

const SESSION = {
  adminEmail: "nick@pixelocity.com",
  targetUserId: "u1",
  targetEmail: "jane@example.com",
  startedAt: Date.now() - 60_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platformAdminEmail.mockResolvedValue("nick@pixelocity.com");
  mocks.mintSessionToken.mockResolvedValue({ tokenHash: "tok", email: "jane@example.com" });
  mocks.primaryOrgId.mockResolvedValue("o1");
  mocks.logImpersonationStart.mockResolvedValue(undefined);
  mocks.logImpersonationEnd.mockResolvedValue(undefined);
  mocks.verifyOtp.mockResolvedValue({ error: null, targetCookies: [] });
});

describe("POST /api/super/impersonate/exit — IMPORTANT 1: leftover target cookies", () => {
  it("clears the target's UNCHUNKED auth cookie when the operator's stash is chunked", async () => {
    // Operator's own session was chunked (.0/.1); the target's is a single
    // unchunked cookie. @supabase/ssr's chunk reader prefers the unchunked base
    // key, so leaving it behind keeps the operator logged in as the customer.
    const operatorPairs: Cookie[] = [
      { name: "sb-x-auth-token.0", value: "OP0" },
      { name: "sb-x-auth-token.1", value: "OP1" },
    ];
    const cookies: Cookie[] = [
      { name: "sb-x-auth-token", value: "TARGET_SESSION" },
      { name: IMP_COOKIE, value: encodeSession(SESSION) },
      ...packStash(operatorPairs),
    ];

    const res = await exitPOST(req(cookies));
    expect(res.status).toBe(200);
    const got = resultingCookies(res);

    expect(got.get("sb-x-auth-token")).toBeNull(); // target's session must be gone
    expect(got.get("sb-x-auth-token.0")).toBe("OP0"); // operator restored
    expect(got.get("sb-x-auth-token.1")).toBe("OP1");
    expect(got.get(`${PREV_COOKIE}.0`)).toBeNull();
    expect(got.get(IMP_COOKIE)).toBeNull();
  });

  it("clears the target's leftover higher-index chunk that the stash does not overwrite", async () => {
    const operatorPairs: Cookie[] = [
      { name: "sb-x-auth-token.0", value: "OP0" },
      { name: "sb-x-auth-token.1", value: "OP1" },
    ];
    const cookies: Cookie[] = [
      { name: "sb-x-auth-token.0", value: "T0" },
      { name: "sb-x-auth-token.1", value: "T1" },
      { name: "sb-x-auth-token.2", value: "T2" },
      { name: IMP_COOKIE, value: encodeSession(SESSION) },
      ...packStash(operatorPairs),
    ];

    const res = await exitPOST(req(cookies));
    const got = resultingCookies(res);

    expect(got.get("sb-x-auth-token.2")).toBeNull(); // stray chunk would corrupt the join
    expect(got.get("sb-x-auth-token.0")).toBe("OP0");
    expect(got.get("sb-x-auth-token.1")).toBe("OP1");
  });

  it("restores auth cookies with Supabase's own attributes (MINOR 4)", async () => {
    const cookies: Cookie[] = [
      { name: "sb-x-auth-token", value: "TARGET" },
      { name: IMP_COOKIE, value: encodeSession(SESSION) },
      ...packStash([{ name: "sb-x-auth-token", value: "OP" }]),
    ];
    const res = await exitPOST(req(cookies));
    const restored = (res as unknown as { cookies: { get: (n: string) => { httpOnly?: boolean; maxAge?: number } | undefined } }).cookies.get("sb-x-auth-token");
    expect(restored?.httpOnly).toBe(false);
    expect(restored?.maxAge).toBe(400 * 24 * 60 * 60);
  });
});

describe("POST /api/super/impersonate/exit — IMPORTANT 2: audit-log forgery", () => {
  it("rejects a hand-crafted pa_op_imp cookie and writes no audit row", async () => {
    // Attacker has no session and no admin: they just craft the cookies.
    const forged = Buffer.from(
      JSON.stringify({
        adminEmail: "nick@pixelocity.com",
        targetUserId: "victim",
        targetEmail: "victim@example.com",
        startedAt: Date.now(),
      }),
      "utf8",
    ).toString("base64url");

    const res = await exitPOST(
      req([
        { name: IMP_COOKIE, value: forged },
        { name: `${PREV_COOKIE}.0`, value: "W10" }, // base64url of "[]" — truthy stash
      ]),
    );

    expect(res.status).toBe(400);
    expect(mocks.logImpersonationEnd).not.toHaveBeenCalled();
  });

  it("still restores the session on a tampered signature but writes no audit row (attacker swaps the admin email)", async () => {
    // The signature only guards the AUDIT WRITE now (MINOR 1). Restore is
    // gated on possession of a real stash, which an attacker forging
    // pa_op_imp does not have — but a legitimate operator whose signing key
    // rotated mid-session does. They must still be able to escape.
    const signed = encodeSession(SESSION);
    const [, sig] = signed.split(".");
    const evil = Buffer.from(
      JSON.stringify({ ...SESSION, adminEmail: "framed@pixelocity.com" }),
      "utf8",
    ).toString("base64url");

    const res = await exitPOST(
      req([
        { name: "sb-x-auth-token", value: "TARGET" },
        { name: IMP_COOKIE, value: `${evil}.${sig}` },
        ...packStash([{ name: "sb-x-auth-token", value: "OP" }]),
      ]),
    );
    expect(res.status).toBe(200);
    const got = resultingCookies(res);
    expect(got.get("sb-x-auth-token")).toBe("OP");
    expect(mocks.logImpersonationEnd).not.toHaveBeenCalled();
  });

  it("accepts the genuine signed cookie minted by the start route", async () => {
    const res = await exitPOST(
      req([
        { name: IMP_COOKIE, value: encodeSession(SESSION) },
        ...packStash([{ name: "sb-x-auth-token", value: "OP" }]),
      ]),
    );
    expect(res.status).toBe(200);
    expect(mocks.logImpersonationEnd).toHaveBeenCalledOnce();
  });

  it("still restores the operator's session when the end-log write fails (never strand)", async () => {
    mocks.logImpersonationEnd.mockRejectedValue(new Error("db down"));
    const res = await exitPOST(
      req([
        { name: "sb-x-auth-token", value: "TARGET" },
        { name: IMP_COOKIE, value: encodeSession(SESSION) },
        ...packStash([{ name: "sb-x-auth-token.0", value: "OP0" }]),
      ]),
    );
    expect(res.status).toBe(200);
    const got = resultingCookies(res);
    expect(got.get("sb-x-auth-token")).toBeNull();
    expect(got.get("sb-x-auth-token.0")).toBe("OP0");
  });
});

describe("POST /api/super/impersonate/exit — MINOR 1: exit must survive key rotation", () => {
  it("restores the operator's session and clears the target's cookies when pa_op_imp is unsigned/invalid, and writes NO audit row", async () => {
    // Simulates SUPABASE_SERVICE_ROLE_KEY rotating mid-impersonation: pa_op_imp
    // was signed with the OLD key, so it fails HMAC verification today. The
    // stash itself is untouched by key rotation — it's just cookies the
    // operator already possessed. Restore must not depend on the signature.
    const staleSignedElsewhere = Buffer.from(JSON.stringify(SESSION), "utf8").toString("base64url") + ".stale-signature-from-old-key";

    const res = await exitPOST(
      req([
        { name: "sb-x-auth-token", value: "TARGET_SESSION" },
        { name: IMP_COOKIE, value: staleSignedElsewhere },
        ...packStash([{ name: "sb-x-auth-token", value: "OPERATOR_SESSION" }]),
      ]),
    );

    expect(res.status).toBe(200);
    const got = resultingCookies(res);
    expect(got.get("sb-x-auth-token")).toBe("OPERATOR_SESSION"); // operator restored
    expect(got.get(IMP_COOKIE)).toBeNull();
    expect(got.get(`${PREV_COOKIE}.0`)).toBeNull();
    expect(mocks.logImpersonationEnd).not.toHaveBeenCalled(); // no verified actor -> no audit row
  });

  it("redirects to /super (not /super/users/<id>) when there is no verified session to read the target id from", async () => {
    const res = await exitPOST(
      req([
        { name: IMP_COOKIE, value: "garbage.notasignature" },
        ...packStash([{ name: "sb-x-auth-token", value: "OPERATOR_SESSION" }]),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.redirect).toBe("/super");
  });

  it("still 400s and writes no audit row when the stash is absent entirely (forged pa_op_imp, no real prior session)", async () => {
    const res = await exitPOST(req([{ name: IMP_COOKIE, value: encodeSession(SESSION) }]));
    expect(res.status).toBe(400);
    expect(mocks.logImpersonationEnd).not.toHaveBeenCalled();
    const got = resultingCookies(res);
    expect(got.size).toBe(0); // nothing restored, nothing cleared
  });

  it("still 400s, no audit, no restore, for a stash that decodes to an empty array (truthy-but-empty)", async () => {
    const res = await exitPOST(
      req([
        { name: IMP_COOKIE, value: encodeSession(SESSION) },
        { name: `${PREV_COOKIE}.0`, value: "W10" }, // base64url of "[]"
      ]),
    );
    expect(res.status).toBe(400);
    expect(mocks.logImpersonationEnd).not.toHaveBeenCalled();
    const got = resultingCookies(res);
    expect(got.size).toBe(0);
  });
});

describe("POST /api/super/impersonate — start", () => {
  it("404s for non-admins without minting anything", async () => {
    mocks.platformAdminEmail.mockResolvedValue(null);
    const res = await startPOST(req([], { userId: "u1" }));
    expect(res.status).toBe(404);
    expect(mocks.mintSessionToken).not.toHaveBeenCalled();
  });

  it("fails closed when the audit write fails — no session handed over (IMPORTANT 3)", async () => {
    mocks.logImpersonationStart.mockRejectedValue(new Error("insert failed"));
    mocks.verifyOtp.mockResolvedValue({
      error: null,
      targetCookies: [{ name: "sb-x-auth-token", value: "TARGET", options: {} }],
    });

    const res = await startPOST(req([{ name: "sb-x-auth-token", value: "OP" }], { userId: "u1" }));
    expect(res.status).toBe(500);
    const got = resultingCookies(res);
    expect(got.has("sb-x-auth-token")).toBe(false); // target's session never reaches the browser
    expect(got.has(`${PREV_COOKIE}.0`)).toBe(false);
  });

  it("stashes the operator, signs the banner cookie, and gives both an 8h maxAge (MINOR 5)", async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: null,
      targetCookies: [{ name: "sb-x-auth-token", value: "TARGET", options: {} }],
    });

    const res = await startPOST(req([{ name: "sb-x-auth-token", value: "OP" }], { userId: "u1" }));
    expect(res.status).toBe(200);

    const jar = (res as unknown as { cookies: { get: (n: string) => { value: string; maxAge?: number; httpOnly?: boolean } | undefined } }).cookies;
    expect(jar.get("sb-x-auth-token")?.value).toBe("TARGET");
    expect(jar.get(`${PREV_COOKIE}.0`)?.maxAge).toBe(8 * 60 * 60);
    expect(jar.get(`${PREV_COOKIE}.0`)?.httpOnly).toBe(true);

    const imp = jar.get(IMP_COOKIE);
    expect(imp?.maxAge).toBe(8 * 60 * 60);
    expect(imp?.value.split(".")).toHaveLength(2); // payload.signature
  });

  it("clears stale pa_op_prev chunks the new stash does not overwrite", async () => {
    const res = await startPOST(
      req(
        [
          { name: "sb-x-auth-token", value: "OP" },
          { name: `${PREV_COOKIE}.0`, value: "stale0" },
          { name: `${PREV_COOKIE}.1`, value: "stale1" },
          { name: `${PREV_COOKIE}.2`, value: "stale2" },
        ],
        { userId: "u1" },
      ),
    );
    const got = resultingCookies(res);
    expect(got.get(`${PREV_COOKIE}.1`)).toBeNull();
    expect(got.get(`${PREV_COOKIE}.2`)).toBeNull();
    expect(got.get(`${PREV_COOKIE}.0`)).not.toBeNull(); // freshly written stash
  });
});
