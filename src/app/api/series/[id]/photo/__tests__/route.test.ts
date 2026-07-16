import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  serviceClient: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/db/service", () => ({ serviceClient: mocks.serviceClient }));

import { POST } from "../route";

/**
 * Chainable stub for the two series query shapes the handler uses:
 *   from("series").select("photo_path").eq().eq().maybeSingle()  (read)
 *   from("series").update({...}).eq().eq()                        (write, awaited)
 */
function makeSupabaseStub(existingPhotoPath: string | null) {
  const calls = { updates: [] as Record<string, unknown>[] };
  const stub = {
    from(table: string) {
      if (table !== "series") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          const chain = {
            eq() {
              return chain;
            },
            async maybeSingle() {
              return { data: existingPhotoPath === undefined ? null : { photo_path: existingPhotoPath }, error: null };
            },
          };
          return chain;
        },
        update(row: Record<string, unknown>) {
          calls.updates.push(row);
          const chain = {
            eq() {
              return chain;
            },
            then(resolve: (v: { error: null }) => unknown) {
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  };
  return { supabase: stub as unknown as SupabaseClient<Database>, calls };
}

function makeStorageStub() {
  const storage = {
    uploads: [] as { path: string; contentType: unknown }[],
    removed: [] as string[][],
  };
  const svc = {
    storage: {
      from() {
        return {
          async upload(path: string, _buf: unknown, opts: { contentType: unknown }) {
            storage.uploads.push({ path, contentType: opts.contentType });
            return { error: null };
          },
          async remove(paths: string[]) {
            storage.removed.push(paths);
            return { error: null };
          },
        };
      },
    },
  };
  return { svc, storage };
}

function photoReq(body: BodyInit | null, contentType = "image/webp") {
  return new Request("http://localhost:3000/api/series/series-1/photo", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "series-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/series/[id]/photo", () => {
  it("rejects non-admins with 403", async () => {
    mocks.getViewer.mockResolvedValue({ supabase: {}, organization: { id: "org-1" }, role: "interviewer" });
    const res = await POST(photoReq("x"), ctx());
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported content-type with 415", async () => {
    const { supabase } = makeSupabaseStub(null);
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });
    const res = await POST(photoReq("x", "text/plain"), ctx());
    expect(res.status).toBe(415);
  });

  it("404s when the series isn't in the caller's org", async () => {
    const { supabase } = makeSupabaseStub(undefined as unknown as null); // maybeSingle → null
    const { svc } = makeStorageStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });
    mocks.serviceClient.mockReturnValue(svc);
    const res = await POST(photoReq(new Uint8Array([1, 2, 3])), ctx());
    expect(res.status).toBe(404);
  });

  it("uploads, records photo_path, and removes the prior photo", async () => {
    const { supabase, calls } = makeSupabaseStub("org-1/series-1/old.webp");
    const { svc, storage } = makeStorageStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });
    mocks.serviceClient.mockReturnValue(svc);

    const res = await POST(photoReq(new Uint8Array([1, 2, 3, 4])), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0].path).toMatch(/^org-1\/series-1\/[0-9a-f-]+\.webp$/);
    expect(storage.uploads[0].contentType).toBe("image/webp");
    expect(calls.updates).toEqual([{ photo_path: body.photoPath }]);
    expect(storage.removed).toEqual([["org-1/series-1/old.webp"]]);
  });

  it("doesn't remove anything when there was no prior photo", async () => {
    const { supabase } = makeSupabaseStub(null);
    const { svc, storage } = makeStorageStub();
    mocks.getViewer.mockResolvedValue({ supabase, organization: { id: "org-1" }, role: "admin" });
    mocks.serviceClient.mockReturnValue(svc);

    const res = await POST(photoReq(new Uint8Array([9])), ctx());

    expect(res.status).toBe(200);
    expect(storage.removed).toEqual([]);
  });
});
