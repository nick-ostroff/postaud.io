import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  serviceClient: vi.fn(),
  createClientSecret: vi.fn(),
}));

vi.mock("@/db/queries", () => ({
  getViewer: mocks.getViewer,
}));

vi.mock("@/db/service", () => ({
  serviceClient: mocks.serviceClient,
}));

vi.mock("@/server/ai/openai", () => ({
  openaiClient: () => ({
    realtime: { clientSecrets: { create: mocks.createClientSecret } },
  }),
}));

import { POST } from "../route";

type Row = {
  id: string;
  series_id: string;
  status: string;
  started_at: string;
  organization_id: string;
  hand_the_mic?: boolean;
};

/**
 * Stand-in for the `interviews` table that actually applies the filters the
 * route chains on (.eq/.in/.lt) against fixture rows, rather than returning
 * a canned count — so the test exercises the real filtering logic instead of
 * just trusting a pre-baked number. This is what catches a regression where
 * the status filter is dropped from the session-count query.
 */
function makeInterviewsTable(rows: Row[]) {
  return {
    select(_cols: string, opts?: { count?: string; head?: boolean }) {
      const isCount = !!opts?.count;
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const ltFilters: Array<[string, unknown]> = [];
      const chain = {
        eq(col: string, val: unknown) {
          eqFilters.push([col, val]);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          inFilters.push([col, vals]);
          return chain;
        },
        lt(col: string, val: unknown) {
          ltFilters.push([col, val]);
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        async maybeSingle() {
          const match = rows.find((r) =>
            eqFilters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
          );
          return { data: match ?? null, error: null };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const matches = rows.filter(
            (r) =>
              eqFilters.every(([c, v]) => (r as Record<string, unknown>)[c] === v) &&
              inFilters.every(([c, vals]) => vals.includes((r as Record<string, unknown>)[c])) &&
              ltFilters.every(([c, v]) => ((r as Record<string, unknown>)[c] as string) < (v as string)),
          );
          const result = isCount
            ? { count: matches.length, data: null, error: null }
            : { data: matches, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

/** Simple canned-response chain for tables whose filtering isn't under test. */
function makeChain(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => chain,
    async maybeSingle() {
      return result;
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

const CURRENT_STARTED_AT = "2026-07-14T12:00:00Z";

function makeSvcStub(
  opts: { mode?: string; queued?: { id: string; text: string }[] } = {},
) {
  const { mode = "deep", queued = [] } = opts;
  const interviewRows: Row[] = [
    {
      id: "cur-1",
      series_id: "series-1",
      status: "in_progress",
      started_at: CURRENT_STARTED_AT,
      organization_id: "org-1",
      hand_the_mic: false,
    },
    {
      id: "done-1",
      series_id: "series-1",
      status: "completed",
      started_at: "2026-07-01T00:00:00Z",
      organization_id: "org-1",
    },
    {
      // Another conductor's session, still open, started before "cur-1".
      // Must NOT count toward cur-1's session number.
      id: "prog-1",
      series_id: "series-1",
      status: "in_progress",
      started_at: "2026-07-10T00:00:00Z",
      organization_id: "org-1",
    },
  ];

  const interviewsTable = makeInterviewsTable(interviewRows);
  const seriesResult = {
    data: {
      id: "series-1",
      subject_user_id: "subject-1",
      title: "Grandpa's Stories",
      subject_name: "Grandpa",
      subject_relationship: "grandfather",
      goal: "Capture family history",
      opening_prompt: null,
      dont_bring_up: [],
      tone: "warm",
      session_minutes: 30,
      // Deliberately a non-default voice with a stale/wrong stored name — the
      // route must derive the spoken name from `voice` (persona.name), never
      // from this column, so a mismatch here can't leak into the prompt.
      voice: "cedar",
      interviewer_name: "Some Stale Name",
      depth: "balanced",
      conversation_mode: mode,
      planned_sessions: 6,
    },
    error: null,
  };

  return {
    from(table: string) {
      if (table === "interviews") return interviewsTable;
      if (table === "series") return makeChain(seriesResult);
      if (table === "topics") return makeChain({ data: [], error: null });
      if (table === "facts") return makeChain({ data: [], error: null });
      if (table === "queued_questions") return makeChain({ data: queued, error: null });
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function ctx() {
  return { params: Promise.resolve({ id: "cur-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serviceClient.mockReturnValue(makeSvcStub());
  mocks.getViewer.mockResolvedValue({
    user: { id: "user-1" },
    supabase: {},
    organization: { id: "org-1" },
    role: "admin",
  });
  mocks.createClientSecret.mockResolvedValue({
    value: "ek_test_secret",
    session: { model: "gpt-realtime" },
  });
});

describe("POST /api/interviews/[id]/realtime-token", () => {
  it(
    "numbers the session using only completed/processed priors, ignoring another " +
      "conductor's still-in_progress session",
    async () => {
      const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

      expect(res.status).toBe(200);
      expect(mocks.createClientSecret).toHaveBeenCalledTimes(1);
      const sessionArg = mocks.createClientSecret.mock.calls[0][0];
      // One completed prior ("done-1") + this in_progress interview itself =
      // session 2. The other conductor's in_progress interview ("prog-1"),
      // despite starting before this one, must not bump it to session 3.
      expect(sessionArg.session.instructions).toContain("This is session 2 of 6");
      expect(sessionArg.session.instructions).not.toContain("session 3 of");
    },
  );

  it("sends the persona's voice and name together, ignoring the stored interviewer_name column", async () => {
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

    expect(res.status).toBe(200);
    const sessionArg = mocks.createClientSecret.mock.calls[0][0];
    // series.voice is "cedar" — the persona registry says that voice is
    // "Ellis". The fixture's stored interviewer_name column is deliberately
    // a stale, different value; the route must ignore it and derive the
    // spoken name from the voice, not the column.
    expect(sessionArg.session.audio.output.voice).toBe("cedar");
    expect(sessionArg.session.instructions).toContain("You are Ellis,");
  });

  it("flow mode mints a session with exactly the propose_followups tool and tool_choice auto", async () => {
    mocks.serviceClient.mockReturnValue(makeSvcStub({ mode: "flow" }));
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

    expect(res.status).toBe(200);
    const sessionArg = mocks.createClientSecret.mock.calls[0][0];
    const tools = sessionArg.session.tools as { type: string; name: string }[];
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].name).toBe("propose_followups");
    expect(sessionArg.session.tool_choice).toBe("auto");
  });

  it("quickfire mode mints a session with the mark_question_asked tool", async () => {
    mocks.serviceClient.mockReturnValue(makeSvcStub({ mode: "quickfire" }));
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

    expect(res.status).toBe(200);
    const sessionArg = mocks.createClientSecret.mock.calls[0][0];
    const tools = sessionArg.session.tools as { type: string; name: string }[];
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("mark_question_asked");
    expect(sessionArg.session.tool_choice).toBe("auto");
  });

  it("deep mode mints a session with no tools key", async () => {
    mocks.serviceClient.mockReturnValue(makeSvcStub({ mode: "deep" }));
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

    expect(res.status).toBe(200);
    const sessionArg = mocks.createClientSecret.mock.calls[0][0];
    expect(sessionArg.session.tools).toBeUndefined();
    expect(sessionArg.session.tool_choice).toBeUndefined();
  });

  it("injects pending queue rows into the instructions and returns their order as queueIds", async () => {
    mocks.serviceClient.mockReturnValue(
      makeSvcStub({
        mode: "quickfire",
        queued: [
          { id: "q-1", text: "Who was there on opening day?" },
          { id: "q-2", text: "How did the first holiday season go?" },
        ],
      }),
    );
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx());

    expect(res.status).toBe(200);
    const sessionArg = mocks.createClientSecret.mock.calls[0][0];
    expect(sessionArg.session.instructions).toContain("Who was there on opening day?");

    const body = (await res.json()) as { queueIds: string[] };
    expect(body.queueIds).toEqual(["q-1", "q-2"]);
  });
});
