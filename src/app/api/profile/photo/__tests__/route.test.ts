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

/** Stub for the one auth call the handler makes: auth.updateUser({ data }). */
function makeSupabaseStub() {
  const calls = { updates: [] as Record<string, unknown>[] };
  const stub = {
    auth: {
      async updateUser(args: { data: Record<string, unknown> }) {
        calls.updates.push(args.data);
        return { data: {}, error: null };
      },
    },
  };
  return { supabase: stub as unknown as SupabaseClient<Database>, calls };
}

function makeStorageStub() {
  const storage = {
    uploads: [] as { path: string; contentType: unknown }[],
    removed: [] as string[][],
    userUpdates: [] as { values: Record<string, unknown>; id: string }[],
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
    from() {
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(_col: string, id: string) {
              storage.userUpdates.push({ values, id });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { svc, storage };
}

function photoReq(body: BodyInit | null, contentType = "image/webp") {
  return new Request("http://localhost:3000/api/profile/photo", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

function viewer(supabase: unknown, avatarPath: string | null) {
  return {
    user: { id: "user-1", email: "nick@ostroff.la", user_metadata: { avatar_path: avatarPath } },
    supabase,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/profile/photo", () => {
  it("rejects an unsupported content-type with 415", async () => {
    const { supabase } = makeSupabaseStub();
    mocks.getViewer.mockResolvedValue(viewer(supabase, null));
    const res = await POST(photoReq("x", "text/plain"));
    expect(res.status).toBe(415);
  });

  it("rejects an empty body with 400", async () => {
    const { supabase } = makeSupabaseStub();
    const { svc } = makeStorageStub();
    mocks.getViewer.mockResolvedValue(viewer(supabase, null));
    mocks.serviceClient.mockReturnValue(svc);
    const res = await POST(photoReq(null));
    expect(res.status).toBe(400);
  });

  it("uploads under the user's folder, records avatar_path, and removes the prior photo", async () => {
    const { supabase, calls } = makeSupabaseStub();
    const { svc, storage } = makeStorageStub();
    mocks.getViewer.mockResolvedValue(viewer(supabase, "user-1/old.webp"));
    mocks.serviceClient.mockReturnValue(svc);

    const res = await POST(photoReq(new Uint8Array([1, 2, 3, 4])));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0].path).toMatch(/^user-1\/[0-9a-f-]+\.webp$/);
    expect(storage.uploads[0].contentType).toBe("image/webp");
    expect(calls.updates).toEqual([{ avatar_path: body.photoPath }]);
    expect(storage.userUpdates).toEqual([{ values: { avatar_path: body.photoPath }, id: "user-1" }]);
    expect(storage.removed).toEqual([["user-1/old.webp"]]);
  });

  it("doesn't remove anything when there was no prior photo", async () => {
    const { supabase } = makeSupabaseStub();
    const { svc, storage } = makeStorageStub();
    mocks.getViewer.mockResolvedValue(viewer(supabase, null));
    mocks.serviceClient.mockReturnValue(svc);

    const res = await POST(photoReq(new Uint8Array([9])));

    expect(res.status).toBe(200);
    expect(storage.removed).toEqual([]);
  });
});
