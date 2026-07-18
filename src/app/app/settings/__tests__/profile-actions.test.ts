import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  revalidatePath: vi.fn(),
  updateUser: vi.fn(),
  mirrorEq: vi.fn(),
  mirrorUpdate: vi.fn(),
}));

vi.mock("@/db/queries", () => ({ getViewer: mocks.getViewer }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db/service", () => ({
  serviceClient: () => ({ from: () => ({ update: mocks.mirrorUpdate }) }),
}));

import { updateProfileNameAction } from "../profile-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.mirrorEq.mockResolvedValue({ error: null });
  mocks.mirrorUpdate.mockReturnValue({ eq: mocks.mirrorEq });
  mocks.getViewer.mockResolvedValue({
    user: { id: "user-1", email: "nick@ostroff.la" },
    supabase: { auth: { updateUser: mocks.updateUser } },
  });
});

describe("updateProfileNameAction", () => {
  it("persists the trimmed name and revalidates the app layout", async () => {
    const res = await updateProfileNameAction("  Nick Ostroff  ");
    expect(res).toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: "Nick Ostroff" } });
    expect(mocks.mirrorUpdate).toHaveBeenCalledWith({ display_name: "Nick Ostroff" });
    expect(mocks.mirrorEq).toHaveBeenCalledWith("id", "user-1");
    expect(mocks.mirrorUpdate).toHaveBeenCalledWith({ subject_name: "Nick Ostroff" });
    expect(mocks.mirrorEq).toHaveBeenCalledWith("subject_user_id", "user-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });

  it("falls back to the email prefix when the name is blank", async () => {
    const res = await updateProfileNameAction("   ");
    expect(res).toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: "nick" } });
  });

  it("returns an error and does not revalidate when Supabase rejects", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "nope" } });
    const res = await updateProfileNameAction("Nick");
    expect(res).toEqual({ ok: false, error: "nope" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
