import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getViewer: mocks.getViewer,
}));

import { PATCH } from "../route";

/**
 * Minimal chainable stand-in for the one query shape the PATCH handler
 * uses: from("series").update({...}).eq().eq().select("id").maybeSingle().
 * Records the update payload so tests can assert on exactly what would be
 * written — including that fields the request didn't touch never appear
 * as keys at all (vs. being written as `undefined`/`null`).
 */
function makeSupabaseStub() {
  const calls = { updates: [] as Record<string, unknown>[] };

  const stub = {
    from(table: string) {
      if (table !== "series") throw new Error(`unexpected table: ${table}`);
      return {
        update(row: Record<string, unknown>) {
          calls.updates.push(row);
          const chain = {
            eq() {
              return chain;
            },
            select() {
              return {
                async maybeSingle() {
                  return { data: { id: "series-1" }, error: null };
                },
              };
            },
          };
          return chain;
        },
      };
    },
  };

  return { supabase: stub as unknown as SupabaseClient<Database>, calls };
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/series/series-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "series-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/series/[id]", () => {
  it("re-derives interviewer_name from a supplied voice", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ voice: "cedar" }), ctx());

    expect(res.status).toBe(200);
    expect(calls.updates).toEqual([{ voice: "cedar", interviewer_name: "Ellis" }]);
  });

  it("leaves interviewer_name untouched when only conversationMode is sent", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ conversationMode: "quickfire" }), ctx());

    expect(res.status).toBe(200);
    expect(calls.updates).toEqual([{ conversation_mode: "quickfire" }]);
  });

  it("maps totalMinutes to total_minutes, including null for unlimited", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    expect((await PATCH(patchReq({ totalMinutes: 45 }), ctx())).status).toBe(200);
    expect((await PATCH(patchReq({ totalMinutes: null }), ctx())).status).toBe(200);
    expect(calls.updates).toEqual([{ total_minutes: 45 }, { total_minutes: null }]);
  });

  it("no longer accepts the retired deep mode or the parked quickfireQueueOnly flag", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    expect((await PATCH(patchReq({ conversationMode: "deep" }), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({ quickfireQueueOnly: true }), ctx())).status).toBe(400);
    expect(calls.updates).toEqual([]);
  });

  it("no longer accepts depth — a depth-only request is ignored and rejected as empty", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ depth: "deep" }), ctx());

    expect(res.status).toBe(400);
    expect(calls.updates).toEqual([]);
  });

  it("leaves interviewer_name (and planned_sessions) untouched when only plannedSessions is sent", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ plannedSessions: 6 }), ctx());

    expect(res.status).toBe(200);
    expect(calls.updates).toEqual([{ planned_sessions: 6 }]);
  });

  it("clears planned_sessions when explicitly sent as null", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ plannedSessions: null }), ctx());

    expect(res.status).toBe(200);
    expect(calls.updates).toEqual([{ planned_sessions: null }]);
  });

  it("leaves planned_sessions alone entirely when the field is omitted", async () => {
    const { supabase, calls } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });

    const res = await PATCH(patchReq({ title: "New Title" }), ctx());

    expect(res.status).toBe(200);
    expect(calls.updates).toEqual([{ title: "New Title" }]);
    expect(calls.updates[0]).not.toHaveProperty("planned_sessions");
    expect(calls.updates[0]).not.toHaveProperty("interviewer_name");
  });
});
