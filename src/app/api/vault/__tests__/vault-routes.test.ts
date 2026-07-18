import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import type { VaultLink } from "@/db/queries/vault";

/**
 * Route-level tests for the three plugin-facing vault endpoints (Task 9):
 * `POST/DELETE /api/series/[id]/vault-link`, `POST /api/series/[id]/vault-ack`,
 * `GET /api/vault/pending`. All Bearer-only — mocked at the same
 * `@/server/auth/bearer` boundary as `discovery.test.ts`.
 *
 * `@/db/queries/vault` is deliberately left UNMOCKED: `listPendingVaultLinks`
 * and `isPushPending` run for real against the in-memory `caller.supabase`
 * stub below, so the "pending" tests exercise the actual pending-filter
 * logic (Task 8) rather than a canned mock return value. Only `getSeries`
 * (from `@/db/queries`) is mocked, matching how `export/__tests__` mocks
 * `getViewer` rather than hand-rolling series RLS.
 *
 * The `series_vault_links` table stub below simulates real Postgres
 * ON-CONFLICT-DO-UPDATE semantics (only payload keys are overwritten) so the
 * idempotent-upsert test is a genuine behavioral check: if the route ever
 * started sending `linked_at` in its upsert payload, this stub would
 * overwrite it and the test would fail for real, not just assert a call arg.
 */

const mocks = vi.hoisted(() => ({
  resolveApiToken: vi.fn(),
  getSeries: vi.fn(),
}));

vi.mock("@/server/auth/bearer", () => ({
  resolveApiToken: mocks.resolveApiToken,
}));

vi.mock("@/db/queries", () => ({
  getSeries: mocks.getSeries,
}));

import { POST as linkPOST, DELETE as linkDELETE } from "../../series/[id]/vault-link/route";
import { POST as ackPOST } from "../../series/[id]/vault-ack/route";
import { GET as pendingGET } from "../pending/route";

type SeriesTitleRow = { id: string; title: string };

function makeCallerSupabase(opts: { vaultLinks?: VaultLink[]; seriesTitles?: SeriesTitleRow[] } = {}) {
  let links = [...(opts.vaultLinks ?? [])];
  const titles = opts.seriesTitles ?? [];
  const seriesSelectSpy = vi.fn(() => ({
    in: (_col: string, ids: string[]) =>
      Promise.resolve({ data: titles.filter((t) => ids.includes(t.id)), error: null }),
  }));

  const vaultLinksTable = {
    select() {
      // Mirrors `listPendingVaultLinks`'s bare `select("*")` — no filters,
      // RLS (simulated here by only ever seeding the caller's own rows) is
      // what would normally scope this in production.
      return Promise.resolve({ data: links, error: null });
    },
    upsert(payload: Partial<VaultLink> & { series_id: string; user_id: string }) {
      const existing = links.find((r) => r.series_id === payload.series_id && r.user_id === payload.user_id);
      if (existing) {
        // Real ON CONFLICT DO UPDATE only sets columns present in the
        // payload — Object.assign with a partial payload mirrors that
        // exactly, so an omitted `linked_at` is provably preserved.
        Object.assign(existing, payload);
      } else {
        links.push({
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: null,
          last_acked_at: null,
          label: "",
          ...payload,
        } as VaultLink);
      }
      return Promise.resolve({ error: null });
    },
    update(patch: Partial<VaultLink>) {
      return {
        eq: (col: keyof VaultLink, val: string) => {
          links.forEach((r) => {
            if (r[col] === val) Object.assign(r, patch);
          });
          return Promise.resolve({ error: null });
        },
      };
    },
    delete() {
      return {
        eq: (col: keyof VaultLink, val: string) => {
          links = links.filter((r) => r[col] !== val);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const seriesTable = { select: seriesSelectSpy };

  return {
    links: () => links,
    seriesSelectSpy,
    stub: {
      from(table: string) {
        if (table === "series_vault_links") return vaultLinksTable;
        if (table === "series") return seriesTable;
        throw new Error(`unexpected table: ${table}`);
      },
    } as unknown as SupabaseClient<Database>,
  };
}

function jsonReq(url: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer pat_test", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id = "series-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/series/[id]/vault-link", () => {
  it("upserts a new link with the caller's ids and given label", async () => {
    const { stub, links } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });
    mocks.getSeries.mockResolvedValue({ id: "series-1" });

    const res = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "My Vault" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(links()).toEqual([
      expect.objectContaining({ series_id: "series-1", user_id: "user-1", label: "My Vault" }),
    ]);
  });

  it("calling it twice is idempotent: one row, label updates, linked_at is NOT reset", async () => {
    const { stub, links } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });
    mocks.getSeries.mockResolvedValue({ id: "series-1" });

    await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "First" }),
      ctx(),
    );
    const firstLinkedAt = links()[0]?.linked_at;

    const res2 = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "Second" }),
      ctx(),
    );

    expect(res2.status).toBe(200);
    expect(links()).toHaveLength(1);
    expect(links()[0]).toMatchObject({ label: "Second", linked_at: firstLinkedAt });
  });

  it("404s a series the caller cannot see (getSeries returns null) and never writes a row", async () => {
    const { stub, links } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });
    mocks.getSeries.mockResolvedValue(null);

    const res = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "X" }),
      ctx(),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    // Proves the visibility check actually gates the write: if it were
    // removed or reordered after the upsert, this would find one row.
    expect(links()).toHaveLength(0);
  });

  it("returns 400 label_required for a missing label, without checking series visibility", async () => {
    const { stub } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", {}),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "label_required" });
    expect(mocks.getSeries).not.toHaveBeenCalled();
  });

  it("returns 400 label_required for a blank/whitespace-only label", async () => {
    const { stub } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "   " }),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "label_required" });
  });

  it("malformed JSON body returns 400, never 500", async () => {
    const { stub } = makeCallerSupabase();
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const req = new NextRequest("http://localhost:3000/api/series/series-1/vault-link", {
      method: "POST",
      headers: { authorization: "Bearer pat_test", "content-type": "application/json" },
      body: "{not valid json",
    });

    const res = await linkPOST(req, ctx());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "label_required" });
  });

  it("returns 401 with no/unresolvable Bearer token and never checks series or writes", async () => {
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await linkPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "POST", { label: "X" }),
      ctx(),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.getSeries).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/series/[id]/vault-link", () => {
  it("removes the caller's row for that series", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: null,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await linkDELETE(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "DELETE"),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(links()).toHaveLength(0);
  });

  it("returns 401 with no/unresolvable Bearer token and never deletes", async () => {
    const { links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: null,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await linkDELETE(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "DELETE"),
      ctx(),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(links()).toHaveLength(1);
  });
});

describe("POST /api/series/[id]/vault-ack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps last_acked_at to now", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T10:00:00.000Z",
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await ackPOST(jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST"), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(links()[0]?.last_acked_at).toBe("2026-07-18T12:00:00.000Z");
  });

  it("returns 401 with no/unresolvable Bearer token and never stamps", async () => {
    const { links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T10:00:00.000Z",
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await ackPOST(jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST"), ctx());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(links()[0]?.last_acked_at).toBeNull();
  });
});

describe("GET /api/vault/pending", () => {
  it("returns only links where isPushPending is true, mapped to seriesId/title/requestedAt", async () => {
    const { stub } = makeCallerSupabase({
      vaultLinks: [
        // Pending: requested after last ack.
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "A",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T11:00:00.000Z",
          last_acked_at: "2026-07-18T10:00:00.000Z",
        },
        // Not pending: never requested.
        {
          series_id: "series-2",
          user_id: "user-1",
          label: "B",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: null,
          last_acked_at: null,
        },
        // Not pending: already acked at/after the request.
        {
          series_id: "series-3",
          user_id: "user-1",
          label: "C",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T09:00:00.000Z",
          last_acked_at: "2026-07-18T09:00:00.000Z",
        },
      ],
      seriesTitles: [{ id: "series-1", title: "Dad's Stories" }],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending", {
      headers: { authorization: "Bearer pat_test" },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pending: [{ seriesId: "series-1", title: "Dad's Stories", requestedAt: "2026-07-18T11:00:00.000Z" }],
    });
  });

  it("falls back to 'Untitled series' when the title lookup has no row for a pending link", async () => {
    const { stub } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "A",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T11:00:00.000Z",
          last_acked_at: null,
        },
      ],
      seriesTitles: [],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending", {
      headers: { authorization: "Bearer pat_test" },
    }));

    const body = await res.json();
    expect(body.pending[0].title).toBe("Untitled series");
  });

  it("with nothing pending, returns { pending: [] } without querying series titles", async () => {
    const { stub, seriesSelectSpy } = makeCallerSupabase({ vaultLinks: [] });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending", {
      headers: { authorization: "Bearer pat_test" },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: [] });
    expect(seriesSelectSpy).not.toHaveBeenCalled();
  });

  it("returns 401 with no/unresolvable Bearer token, never touches supabase", async () => {
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
