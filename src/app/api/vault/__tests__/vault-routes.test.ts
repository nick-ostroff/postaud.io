import { beforeEach, describe, expect, it, vi } from "vitest";
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
 *
 * `select`/`update`/`delete` build a small chainable filter (supporting one
 * or more `.eq()` calls plus, for `select`, `.order()`) rather than a fixed
 * single-filter shape — the routes now add an explicit `user_id` filter
 * alongside `series_id` (defence in depth, final review IMPORTANT 4), so the
 * stub has to apply BOTH filters for real, the same way real RLS-plus-filter
 * queries would, or the cross-tenant tests below would pass for the wrong
 * reason (never actually checking user_id).
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

/** A minimal chainable `.eq(...).eq(...)...` filter shared by select/update/delete below. */
function makeFilterBuilder<T extends Record<string, unknown>>(
  rows: () => T[],
  finish: (predicate: (r: T) => boolean) => { data?: T[] | T | null; error: null },
) {
  let predicate: (r: T) => boolean = () => true;
  let ordered: ((r: T[]) => T[]) | null = null;
  const builder = {
    eq(col: keyof T, val: unknown) {
      const prev = predicate;
      predicate = (r) => prev(r) && r[col] === val;
      return builder;
    },
    order(col: keyof T, opts?: { ascending?: boolean }) {
      const dir = opts?.ascending === false ? -1 : 1;
      ordered = (list) =>
        [...list].sort((a, b) => {
          const av = (a[col] as string | null) ?? "";
          const bv = (b[col] as string | null) ?? "";
          return av < bv ? -dir : av > bv ? dir : 0;
        });
      return builder;
    },
    maybeSingle() {
      const matched = rows().filter(predicate);
      return Promise.resolve({ data: matched[0] ?? null, error: null });
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      const result = finish(predicate);
      const data = ordered && Array.isArray(result.data) ? ordered(result.data) : result.data;
      return Promise.resolve({ ...result, data }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function makeCallerSupabase(opts: { vaultLinks?: VaultLink[]; seriesTitles?: SeriesTitleRow[] } = {}) {
  let links = [...(opts.vaultLinks ?? [])];
  const titles = opts.seriesTitles ?? [];
  const seriesSelectSpy = vi.fn(() => ({
    in: (_col: string, ids: string[]) =>
      Promise.resolve({ data: titles.filter((t) => ids.includes(t.id)), error: null }),
  }));

  const vaultLinksTable = {
    select() {
      return makeFilterBuilder<VaultLink>(
        () => links,
        (predicate) => ({ data: links.filter(predicate), error: null }),
      );
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
      return makeFilterBuilder<VaultLink>(
        () => links,
        (predicate) => {
          links.forEach((r) => {
            if (predicate(r)) Object.assign(r, patch);
          });
          return { error: null };
        },
      );
    },
    delete() {
      return makeFilterBuilder<VaultLink>(
        () => links,
        (predicate) => {
          links = links.filter((r) => !predicate(r));
          return { error: null };
        },
      );
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

  it("defence in depth (IMPORTANT 4): a caller cannot delete another user's link for the same series, even though RLS is only simulated here", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-B",
          label: "User B's vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: null,
          last_acked_at: null,
        },
      ],
    });
    // User A calls it, but only user B's row exists for this series_id.
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-A", supabase: stub });

    const res = await linkDELETE(
      jsonReq("http://localhost:3000/api/series/series-1/vault-link", "DELETE"),
      ctx(),
    );

    // Idempotent DELETE: matching zero rows is still a 200, but the other
    // user's row must survive untouched — this is the whole point of the
    // explicit user_id filter.
    expect(res.status).toBe(200);
    expect(links()).toHaveLength(1);
    expect(links()[0]?.user_id).toBe("user-B");
  });
});

describe("POST /api/series/[id]/vault-ack", () => {
  /**
   * `last_acked_at` is now stamped from the request body's `requestedAt`
   * (the value the plugin fetched from `/api/vault/pending`), not from
   * `now()` — see the route's doc comment for the race this fixes.
   */
  const REQUESTED_AT = "2026-07-18T10:00:00.000Z";

  it("stamps last_acked_at to the echoed requestedAt, not now", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", { requestedAt: REQUESTED_AT }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(links()[0]?.last_acked_at).toBe(REQUESTED_AT);
  });

  it("a Send that lands mid-sync (after fetch, before ack) remains pending: acking with a stale requestedAt does not swallow it", async () => {
    const staleRequestedAt = "2026-07-18T09:00:00.000Z"; // T-1, what the plugin fetched
    const midSyncSend = "2026-07-18T11:00:00.000Z"; // T2, user pressed Send after the fetch
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          // Simulates: plugin fetched at T-1, then the user pressed Send
          // again at T2 before the plugin's ack (T3) arrives.
          push_requested_at: midSyncSend,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", {
        requestedAt: staleRequestedAt,
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    const link = links()[0];
    expect(link?.last_acked_at).toBe(staleRequestedAt);
    // The T2 Send must still read as pending after this ack.
    const { isPushPending } = await import("@/db/queries/vault");
    expect(isPushPending(link!)).toBe(true);
  });

  it("returns 400 requested_at_required when requestedAt is missing, and does not stamp", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", {}),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "requested_at_required" });
    expect(links()[0]?.last_acked_at).toBeNull();
  });

  it("returns 400 requested_at_required for a malformed (unparseable) requestedAt", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", { requestedAt: "not-a-date" }),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "requested_at_required" });
    expect(links()[0]?.last_acked_at).toBeNull();
  });

  it("returns 400 requested_at_required for malformed JSON, never 500", async () => {
    const { stub } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const req = new NextRequest("http://localhost:3000/api/series/series-1/vault-ack", {
      method: "POST",
      headers: { authorization: "Bearer pat_test", "content-type": "application/json" },
      body: "{not valid json",
    });

    const res = await ackPOST(req, ctx());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "requested_at_required" });
  });

  it("returns 401 with no/unresolvable Bearer token and never stamps", async () => {
    const { links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-1",
          label: "My Vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue(null);

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", { requestedAt: REQUESTED_AT }),
      ctx(),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(links()[0]?.last_acked_at).toBeNull();
  });

  it("defence in depth (IMPORTANT 4): a caller cannot ack another user's link for the same series", async () => {
    const { stub, links } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-1",
          user_id: "user-B",
          label: "User B's vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: REQUESTED_AT,
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-A", supabase: stub });

    const res = await ackPOST(
      jsonReq("http://localhost:3000/api/series/series-1/vault-ack", "POST", { requestedAt: REQUESTED_AT }),
      ctx(),
    );

    // Matching zero rows is still a 200 (same idempotent-update reasoning
    // as vault-link's DELETE), but user B's row must be untouched.
    expect(res.status).toBe(200);
    expect(links()[0]?.user_id).toBe("user-B");
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

  it("orders multiple pending links by push_requested_at ascending (MINOR 9: deterministic plugin processing)", async () => {
    const { stub } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-newest",
          user_id: "user-1",
          label: "Newest",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T12:00:00.000Z",
          last_acked_at: null,
        },
        {
          series_id: "series-oldest",
          user_id: "user-1",
          label: "Oldest",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T08:00:00.000Z",
          last_acked_at: null,
        },
        {
          series_id: "series-middle",
          user_id: "user-1",
          label: "Middle",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T10:00:00.000Z",
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-1", supabase: stub });

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending", {
      headers: { authorization: "Bearer pat_test" },
    }));

    const body = await res.json();
    expect(body.pending.map((p: { seriesId: string }) => p.seriesId)).toEqual([
      "series-oldest",
      "series-middle",
      "series-newest",
    ]);
  });

  it("defence in depth (IMPORTANT 4): another user's pending link never appears, even one that would otherwise match", async () => {
    const { stub } = makeCallerSupabase({
      vaultLinks: [
        {
          series_id: "series-other-user",
          user_id: "user-B",
          label: "User B's vault",
          linked_at: "2026-01-01T00:00:00.000Z",
          push_requested_at: "2026-07-18T11:00:00.000Z",
          last_acked_at: null,
        },
      ],
    });
    mocks.resolveApiToken.mockResolvedValue({ userId: "user-A", supabase: stub });

    const res = await pendingGET(new NextRequest("http://localhost:3000/api/vault/pending", {
      headers: { authorization: "Bearer pat_test" },
    }));

    expect(await res.json()).toEqual({ pending: [] });
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
