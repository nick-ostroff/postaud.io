import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  platformAdminEmail: vi.fn(),
  getPlatformUserDetail: vi.fn(),
}));

vi.mock("@/lib/auth/is-platform-admin", () => ({
  platformAdminEmail: mocks.platformAdminEmail,
}));

vi.mock("@/db/queries/admin", () => ({
  getPlatformUserDetail: mocks.getPlatformUserDetail,
}));

import { GET } from "../route";

const DETAIL = {
  user: { id: "u1", email: "jane@example.com", displayName: "Jane", createdAt: "2026-01-01T00:00:00Z" },
  orgs: [{ id: "o1", name: "Acme", role: "admin", accepted: true }],
  seriesOwned: [{ id: "s1", title: "Dad's stories", organizationId: "o1" }],
  seriesSubjectOf: [],
  topSeries: [{ id: "s1", title: "Dad's stories", facts: 3 }],
  interviewCount: 4,
  factCount: 5,
  auditLog: [],
};

function req(id: string) {
  return new NextRequest(`http://localhost:3000/api/super/users/${id}`);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platformAdminEmail.mockResolvedValue("nick@pixelocity.com");
  mocks.getPlatformUserDetail.mockResolvedValue(DETAIL);
});

describe("GET /api/super/users/[id]", () => {
  it("404s for non-admins without querying the detail", async () => {
    mocks.platformAdminEmail.mockResolvedValue(null);
    const res = await GET(req("u1"), ctx("u1"));
    expect(res.status).toBe(404);
    expect(mocks.getPlatformUserDetail).not.toHaveBeenCalled();
  });

  it("returns the platform user detail JSON for an admin", async () => {
    const res = await GET(req("u1"), ctx("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DETAIL);
    expect(mocks.getPlatformUserDetail).toHaveBeenCalledWith("u1");
  });

  it("404s when the user id doesn't resolve to a real user", async () => {
    mocks.getPlatformUserDetail.mockResolvedValue(null);
    const res = await GET(req("missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });
});
