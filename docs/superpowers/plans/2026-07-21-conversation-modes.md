# Conversation Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three conversation modes (Deep dive / Flow / Quickfire) to PostAud.io series, backed by a persistent per-series question queue, per the approved spec `docs/superpowers/specs/2026-07-21-conversation-modes-design.md`.

**Architecture:** A new `conversation_mode` on `series` (replacing the depth dial in the UI) and `mode` on `interviews` thread through the existing pipeline: settings form → PATCH route → `startInterview` → realtime-token route → `buildInterviewerInstructions`. Flow and Quickfire behaviors ride on OpenAI Realtime **function tools** (`propose_followups`, `mark_question_asked`) declared on the session and handled in `LiveInterview.tsx` over the existing `oai-events` data channel. A new `queued_questions` table stores saved follow-ups; a new queue screen manages it.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, Supabase (Postgres + RLS), openai@6.34.0 Realtime (WebRTC), zod, Tailwind v4, vitest.

## Global Constraints

- **This repo's Next.js is 16.2.4 with breaking changes** — before writing any Next.js-touching code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md requirement). Note existing conventions already visible in the code: `params`/`searchParams` are Promises and must be awaited.
- **SSR-safe:** no bare `window`/`document`/`localStorage` outside client components/effects (deploys to Vercel).
- **Never use `sed` for edits** — Edit/Write tools only.
- **Commit and push after each task** (`git add -A && git commit -m '<msg>' && git push`).
- **Screens are full width** — no page-level `max-w-*`; readable caps only on prose/inputs (global CLAUDE.md standard).
- **Realtime event/session shapes must be verified against `node_modules/openai/resources/realtime/realtime.d.ts`** (the codebase pins openai@6.34.0 and existing comments cite it) — do not trust memory for field names.
- **Tests:** `npm run test` (vitest). There is no component-test harness — UI verification is `npm run build` + manual QA.
- **Copy style:** warm, human microcopy matching existing strings ("Everything so far is already saved").
- Enum values are exactly: `conversation_mode ∈ {'deep','flow','quickfire'}`, `queued_questions.source ∈ {'flow','member'}`, `queued_questions.status ∈ {'pending','asked','removed'}`.

---

### Task 1: Migration 0019 + hand-maintained types

**Files:**
- Create: `supabase/migrations/0019_conversation_modes.sql`
- Modify: `src/db/types.ts` (enum unions near top; `series`/`interviews` table types; new `queued_questions` table type; enum registry near line 955; row aliases near line 967)

**Interfaces:**
- Produces: DB columns `series.conversation_mode`, `series.ask_mode_each_time`, `interviews.mode`, table `queued_questions`; TS types `ConversationMode`, `QueuedQuestionSource`, `QueuedQuestionStatus`, row alias `QueuedQuestion = Tables<"queued_questions">`. Every later task consumes these names exactly.

- [ ] **Step 1: Write the migration**

```sql
-- 0019_conversation_modes.sql
-- Conversation modes: 'deep' (today's full interview), 'flow' (pause after
-- each answer, offer follow-up cards), 'quickfire' (preset list, one question
-- after another). Mode replaces the depth dial in the settings UI; the depth
-- column STAYS so deep-mode series keep their stored register wording.
-- Backfill: 'single' series were already Q&A-style → 'quickfire'; all others
-- keep today's behavior → 'deep'.

create type conversation_mode as enum ('deep', 'flow', 'quickfire');

alter table series
  add column conversation_mode  conversation_mode not null default 'deep',
  add column ask_mode_each_time boolean           not null default false;

update series set conversation_mode = 'quickfire' where depth = 'single';

-- Mode actually used for one session (picker choice or series default at
-- start time). Null on historical rows = pre-modes deep behavior.
alter table interviews
  add column mode conversation_mode;

-- Saved follow-up questions ("the queue"): written by Flow sessions ('flow')
-- or typed by members ('member'). position 0 = "Next up". Soft states only —
-- 'asked'/'removed' rows stay for provenance, 'pending' is the live queue.
create table queued_questions (
  id                    uuid primary key default gen_random_uuid(),
  series_id             uuid not null references series(id) on delete cascade,
  text                  text not null,
  source                text not null check (source in ('flow', 'member')),
  created_by            uuid references users(id) on delete set null,
  source_interview_id   uuid references interviews(id) on delete set null,
  position              int  not null default 0,
  status                text not null default 'pending' check (status in ('pending', 'asked', 'removed')),
  asked_in_interview_id uuid references interviews(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on queued_questions (series_id, status, position);

alter table queued_questions enable row level security;

-- Mirrors topics: anyone who can view the series reads the queue; anyone who
-- can interview it may add (Flow's + button and member adds); management
-- (reorder/pin/remove) is admin — but marking 'asked' happens from a live
-- quickfire session, so update needs can_interview, matching "facts review".
create policy "queue read" on queued_questions for select
  using (can_view_series(series_id));
create policy "queue insert" on queued_questions for insert
  with check (can_interview_series(series_id));
create policy "queue update" on queued_questions for update
  using (can_interview_series(series_id))
  with check (can_interview_series(series_id));
```

(No delete policy — removal is `status = 'removed'`, same soft-archive posture as the rest of the schema. Admin-only enforcement for reorder/pin/remove lives in the API route role check, like `PATCH /api/series/[id]` does.)

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (name `0019_conversation_modes`, content = the file), or `supabase db push` if the CLI is linked. Expected: success, no errors.

- [ ] **Step 3: Update `src/db/types.ts` (hand-maintained)**

In the enum-unions block at the top, after `SeriesDepth`:

```ts
export type ConversationMode = "deep" | "flow" | "quickfire"
export type QueuedQuestionSource = "flow" | "member"
export type QueuedQuestionStatus = "pending" | "asked" | "removed"
```

In the `series` table type (`Row`, `Insert`, `Update`), add:

```ts
conversation_mode: ConversationMode        // Insert/Update: conversation_mode?: ConversationMode
ask_mode_each_time: boolean                // Insert/Update: ask_mode_each_time?: boolean
```

In the `interviews` table type, add:

```ts
mode: ConversationMode | null              // Insert/Update: mode?: ConversationMode | null
```

Add a `queued_questions` table type alongside `topics` (follow the exact Row/Insert/Update/Relationships shape neighboring tables use):

```ts
queued_questions: {
  Row: {
    id: string
    series_id: string
    text: string
    source: QueuedQuestionSource
    created_by: string | null
    source_interview_id: string | null
    position: number
    status: QueuedQuestionStatus
    asked_in_interview_id: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    series_id: string
    text: string
    source: QueuedQuestionSource
    created_by?: string | null
    source_interview_id?: string | null
    position?: number
    status?: QueuedQuestionStatus
    asked_in_interview_id?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    series_id?: string
    text?: string
    source?: QueuedQuestionSource
    created_by?: string | null
    source_interview_id?: string | null
    position?: number
    status?: QueuedQuestionStatus
    asked_in_interview_id?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
```

In the enum registry (~line 955) add `conversation_mode: ["deep", "flow", "quickfire"],`. In the row aliases (~line 967) add `export type QueuedQuestion = Tables<"queued_questions">`.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit` — Expected: no NEW errors (pre-existing errors, if any, unchanged). Then `npm run test` — Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): conversation modes + queued_questions table (0019)" && git push
```

---

### Task 2: Mode-aware interviewer instructions (TDD)

**Files:**
- Modify: `src/server/ai/interviewer-prompt.ts`
- Test: `src/server/ai/__tests__/interviewer-prompt.test.ts`

**Interfaces:**
- Consumes: `ConversationMode` from Task 1.
- Produces: `BuildInterviewerInstructionsInput` gains `mode: ConversationMode` and `queuedQuestions: string[]` (pending queue texts, position order). Task 7 calls it with both. Tool names referenced in prompt text: `propose_followups`, `mark_question_asked` — these exact strings are what Tasks 7–9 declare/handle.

- [ ] **Step 1: Update existing tests + write failing mode tests**

Existing tests construct `BuildInterviewerInstructionsInput` — add `mode: "deep", queuedQuestions: []` to every existing fixture (behavior for deep must be byte-identical, see Step 3). Then add:

```ts
describe("conversation modes", () => {
  const base = makeInput(); // reuse the test file's existing fixture helper/pattern

  it("deep mode with legacy depth 'single' coerces to balanced posture", () => {
    const out = buildInterviewerInstructions({ ...base, mode: "deep", queuedQuestions: [], series: { ...base.series, depth: "single" } });
    expect(out).toContain("STAY ON THE THREAD (this matters most)");
    expect(out).not.toContain("ONE QUESTION, ONE ANSWER");
  });

  it("quickfire builds a numbered QUESTION LIST: queue first, then topics by coverage", () => {
    const out = buildInterviewerInstructions({
      ...base,
      mode: "quickfire",
      queuedQuestions: ["Who was there on opening day?", "How did the first holiday season go?"],
      topics: [
        { name: "The warehouse years", coverageScore: 0.5, mustCover: true, suggested: false },
        { name: "First sofa sold", coverageScore: 0.1, mustCover: true, suggested: false },
      ],
    });
    expect(out).toContain("QUESTION LIST");
    const i1 = out.indexOf("1. Who was there on opening day?");
    const i2 = out.indexOf("2. How did the first holiday season go?");
    const i3 = out.indexOf("3. First sofa sold");   // lower coverage before higher
    const i4 = out.indexOf("4. The warehouse years");
    expect(Math.min(i1, i2, i3, i4)).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2); expect(i2).toBeLessThan(i3); expect(i3).toBeLessThan(i4);
    expect(out).toContain("mark_question_asked");
    expect(out).not.toContain("EXPLORE NEXT");
  });

  it("flow swaps thread-mining for the propose_followups contract", () => {
    const out = buildInterviewerInstructions({ ...base, mode: "flow", queuedQuestions: [] });
    expect(out).toContain("FLOW FOLLOW-UPS");
    expect(out).toContain("propose_followups");
    expect(out).not.toContain("STAY ON THE THREAD");
    expect(out).not.toContain("DEPTH (how this series wants to be interviewed");
  });

  it("flow opens with the queue's next-up question when one exists", () => {
    const out = buildInterviewerInstructions({ ...base, mode: "flow", queuedQuestions: ["Why '98 — what pushed you to finally open?"] });
    expect(out).toContain('Open this session by asking, near-verbatim: "Why \'98 — what pushed you to finally open?"');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm run test -- interviewer-prompt` — Expected: existing tests FAIL to compile until fixtures gain `mode`/`queuedQuestions`; after fixing fixtures, the four new tests FAIL (no `mode` handling yet).

- [ ] **Step 3: Implement in `interviewer-prompt.ts`**

Add to the input type:

```ts
import type { ConversationMode, SeriesDepth, SeriesTone } from "@/db/types";

export type BuildInterviewerInstructionsInput = {
  // ...existing fields unchanged...
  mode: ConversationMode;
  /** Pending queue texts, position order (0 = next up). Empty when the queue is empty. */
  queuedQuestions: string[];
};
```

At the top of `buildInterviewerInstructions`, derive the effective depth and never read `series.depth` directly below this line:

```ts
// Mode is the outer dial; depth survives only as deep-mode's legacy register.
// 'single' was migrated to quickfire in 0019 — a stray single+deep combo
// coerces to balanced rather than resurrecting the Q&A posture inside a
// conversational mode.
const effectiveDepth: SeriesDepth =
  input.mode === "deep"
    ? (series.depth === "single" ? "balanced" : series.depth)
    : input.mode === "flow"
      ? "balanced"
      : "single";
```

Replace every `series.depth` reference in the function body with `effectiveDepth` (the DEPTH_REGISTER lookup, the explore-intro branch, the STAY ON THE THREAD branches, the DEPTH section). With `mode: "deep"` the output must be **byte-identical** to today for depth light/balanced/deep — that's what keeps existing tests green.

**THE GOAL addition** (after the openingPrompt line): when `input.mode === "flow" && input.queuedQuestions.length > 0`:

```ts
goalLines.push(
  `Open this session by asking, near-verbatim: "${input.queuedQuestions[0]}" — the subject saved it for this session.`,
);
```

**EXPLORE NEXT vs QUESTION LIST:** for `mode === "quickfire"`, replace the whole EXPLORE NEXT section with:

```ts
const numbered: string[] = [];
input.queuedQuestions.forEach((q) => numbered.push(`${numbered.length + 1}. ${q} [from the queue]`));
sortedTopics
  .filter((t) => t.mustCover)
  .forEach((t) => numbered.push(`${numbered.length + 1}. ${t.name}`));
sections.push(
  [
    "QUESTION LIST (ask in order)",
    "This session is Quickfire: the list below IS the agenda. Ask each item as a single clear question, " +
      "near-verbatim for queue items, one at a time, in order. Take the answer as given — no follow-ups " +
      "(see ONE QUESTION, ONE ANSWER). It is fine to get through all of them.",
    ...(numbered.length > 0 ? numbered : ["1. (The queue and must-cover topics are empty — follow the goal with simple, single questions.)"]),
    `After the subject finishes answering an item, call the mark_question_asked tool with {"index": <its number>, "total": ${Math.max(numbered.length, 1)}} before you ask the next one. Never mention the tool or the numbering out loud.`,
  ].join("\n"),
);
```

(`sortedTopics` already exists — reuse it. Non-must-cover topics are deliberately excluded: quickfire is the curated list, not the whole compass.)

For `deep`/`flow`, keep the existing EXPLORE NEXT section (flow uses the balanced intro via `effectiveDepth`).

**Posture sections:** keep the existing `single`-vs-conversational branch keyed on `effectiveDepth` (quickfire lands in the ONE QUESTION, ONE ANSWER branch; deep/flow in STAY ON THE THREAD) — **except** for `mode === "flow"`, replace BOTH the STAY ON THE THREAD section AND the DEPTH section with one FLOW section:

```ts
if (input.mode === "flow") {
  sections.push(
    [
      "FLOW FOLLOW-UPS (this session is in Flow mode)",
      "This session gives the subject the wheel between answers. It replaces the usual follow-up instinct: " +
        "you never choose the next question yourself.",
      "- After the subject finishes an answer, do NOT ask the next question out loud. Call the " +
        "propose_followups tool with 2 or 3 short, distinct follow-up questions that build on what they " +
        "just said — specific, one sentence each, no compound questions.",
      "- After calling the tool, stay completely silent. The subject is choosing their next question on " +
        "screen. Do not speak again until the tool result arrives.",
      '- The tool result contains the chosen question as {"chosen": "..."}. Ask exactly that question out ' +
        "loud, warmly — do not rewrite it, stack anything onto it, or comment on the choosing.",
      "- While they are answering, listen like an oral-history interviewer: leave silence, never interrupt, " +
        "and keep any acknowledgment to a few warm words before the next tool call.",
      "- Never mention the tool, the cards, or the queue mechanics out loud.",
      "One hard exception: never propose a follow-up that touches anything under NEVER BRING UP below. " +
        "That guardrail outranks this section.",
    ].join("\n"),
  );
}
```

Guard the existing DEPTH `sections.push` with `if (input.mode !== "flow")` so flow gets neither STAY ON THE THREAD nor DEPTH. Quickfire's DEPTH section renders the `single` register (via `effectiveDepth === "single"`), which is correct as-is.

- [ ] **Step 4: Run the full suite**

Run: `npm run test` — Expected: ALL PASS (updated fixtures + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ai): mode-aware interviewer instructions (deep/flow/quickfire)" && git push
```

---

### Task 3: Series PATCH API + settings form (mode control, ask-each-time, queue card)

**Files:**
- Modify: `src/app/api/series/[id]/route.ts:7-18` (schema), `:38-55` (mapping)
- Modify: `src/app/app/series/[id]/settings/InterviewGuideForm.tsx`
- Modify: `src/app/app/series/[id]/settings/page.tsx` (props + queue card)

**Interfaces:**
- Consumes: `ConversationMode` (Task 1).
- Produces: PATCH accepts `conversationMode?: "deep"|"flow"|"quickfire"`, `askModeEachTime?: boolean`; stops accepting `depth`. Settings page shows a "Question queue — N waiting" card linking to `/app/series/[id]/queue` (route built in Task 5; a dead link for one task is acceptable mid-stream but both tasks land in the same push cycle).

- [ ] **Step 1: Update the route schema and mapping**

In `updateSeriesSchema`: remove the `depth` line, add:

```ts
conversationMode: z.enum(["deep", "flow", "quickfire"]).optional(),
askModeEachTime: z.boolean().optional(),
```

In the destructure + mapping: remove `depth`, add:

```ts
if (conversationMode !== undefined) update.conversation_mode = conversationMode;
if (askModeEachTime !== undefined) update.ask_mode_each_time = askModeEachTime;
```

- [ ] **Step 2: Rework `InterviewGuideForm.tsx`**

Replace `DEPTH_OPTIONS`/`depth` with mode. Concretely:

```ts
import type { ConversationMode, SeriesTone } from "@/db/types";

const MODE_OPTIONS: { value: ConversationMode; label: string }[] = [
  { value: "deep", label: "Deep dive" },
  { value: "flow", label: "Flow" },
  { value: "quickfire", label: "Quick fire" },
];

const MODE_HINTS: Record<ConversationMode, string> = {
  deep: "A full guided conversation — the interviewer follows the thread.",
  flow: "Answer, then choose where to go next. Save follow-ups for later.",
  quickfire: "One question after another from your queue and topics.",
};
```

Props: replace `initialDepth: SeriesDepth` with `initialConversationMode: ConversationMode; initialAskModeEachTime: boolean`. State:

```ts
const [conversationMode, setConversationMode] = useState<ConversationMode>(initialConversationMode);
const [askModeEachTime, setAskModeEachTime] = useState(initialAskModeEachTime);
```

Dirty check: replace `depth !== initialDepth` with `conversationMode !== initialConversationMode || askModeEachTime !== initialAskModeEachTime`. Patch assembly: replace the depth line with:

```ts
if (conversationMode !== initialConversationMode) patch.conversationMode = conversationMode;
if (askModeEachTime !== initialAskModeEachTime) patch.askModeEachTime = askModeEachTime;
```

Replace the Depth `<Field>` block (the `sm:col-span-2` div) with:

```tsx
<div className="sm:col-span-2">
  <Field label="Default mode" hint={MODE_HINTS[conversationMode]}>
    <Segmented
      name="conversation-mode"
      options={MODE_OPTIONS}
      value={conversationMode}
      onChange={(v) => {
        setConversationMode(v as ConversationMode);
        touch();
      }}
    />
    <div className="mt-3 flex items-center gap-3 border-t border-ink/10 pt-3">
      <div className="flex-1 text-[14px]">Ask me each time</div>
      <button
        type="button"
        role="switch"
        aria-checked={askModeEachTime}
        onClick={() => {
          setAskModeEachTime((v) => !v);
          touch();
        }}
        className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${
          askModeEachTime ? "bg-green-deep" : "bg-ink/20"
        }`}
      >
        <span
          className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${
            askModeEachTime ? "right-[3px]" : "left-[3px]"
          }`}
        />
      </button>
    </div>
  </Field>
</div>
```

(If `border-ink/10`, `bg-ink/20`, or `bg-green-deep` don't exist in this Tailwind theme, match the closest tokens already used in this file — `rgba(33,30,26,…)` borders and the `green-deep` class visible in `LiveInterview.tsx`/`Button` usage. Check `src/app/globals.css` for the theme tokens before inventing any.)

- [ ] **Step 3: Update `settings/page.tsx`**

Where `<InterviewGuideForm … initialDepth={series.depth} …/>` is rendered, replace with `initialConversationMode={series.conversation_mode} initialAskModeEachTime={series.ask_mode_each_time}`. Add a pending-count fetch to the page's data loading (alongside the existing `Promise.all`):

```ts
const queueCountRes = await supabase
  .from("queued_questions")
  .select("id", { count: "exact", head: true })
  .eq("series_id", id)
  .eq("status", "pending");
const queueCount = queueCountRes.count ?? 0;
```

And render, near the InterviewGuideForm card (inside the same column of cards):

```tsx
<Card className="px-[22px] py-5">
  <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1">
      <h3>Question queue</h3>
      <div className="mt-0.5 text-[13px] text-muted">Saved follow-ups from Flow sessions.</div>
    </div>
    <Link
      href={`/app/series/${series.id}/queue`}
      className="shrink-0 text-[13.5px] font-semibold text-green-deep"
    >
      {queueCount > 0 ? `${queueCount} waiting ›` : "Open ›"}
    </Link>
  </div>
</Card>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run test && npm run build` — Expected: clean compile, tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(settings): default mode control + ask-each-time + queue card" && git push
```

---

### Task 4: Queue reads in db/queries + queue API routes

**Files:**
- Modify: `src/db/queries.ts` (add two functions; follow the file's existing style)
- Create: `src/app/api/series/[id]/queue/route.ts`
- Create: `src/app/api/interviews/[id]/queue/route.ts`

**Interfaces:**
- Consumes: `QueuedQuestion` alias (Task 1); `getViewer`, `serviceClient`, `canInterviewSeries` (existing).
- Produces:
  - `listPendingQueuedQuestions(supabase, seriesId): Promise<QueuedQuestion[]>` — pending only, ordered `position asc, created_at asc`.
  - `POST /api/series/[id]/queue` body `{ text: string }` → member add; requires interview access.
  - `PATCH /api/series/[id]/queue` body is a discriminated union on `action`:
    `{ action: "reorder", ids: string[] }` | `{ action: "pin", id: string }` | `{ action: "remove", id: string }` (admin-only) | `{ action: "markAsked", ids: string[], interviewId: string }` (interview access).
  - `POST /api/interviews/[id]/queue` body `{ text: string }` → Flow's + button; returns `{ id, pendingCount }`.

- [ ] **Step 1: Add queries to `src/db/queries.ts`**

```ts
/** Pending queue for a series, position order (0 = next up). RLS: can_view_series. */
export async function listPendingQueuedQuestions(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<QueuedQuestion[]> {
  const { data, error } = await supabase
    .from("queued_questions")
    .select("*")
    .eq("series_id", seriesId)
    .eq("status", "pending")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

(Import `QueuedQuestion` in the file's existing type-import line. A separate count helper isn't needed — Task 3's head-count query is inline, matching how the page already does one-off queries.)

- [ ] **Step 2: Create `src/app/api/series/[id]/queue/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";

type Params = Promise<{ id: string }>;

const postSchema = z.object({ text: z.string().trim().min(1).max(500) });

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("pin"), id: z.string().uuid() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
  z.object({
    action: z.literal("markAsked"),
    ids: z.array(z.string().uuid()).min(1),
    interviewId: z.string().uuid(),
  }),
]);

/** Resolve the series through the viewer's org and check interview access. */
async function loadSeriesAccess(id: string) {
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  const { data: series, error } = await supabase
    .from("series")
    .select("id, subject_user_id, organization_id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const;
  if (!series) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  return { user, supabase, role, series, canInterview } as const;
}

// POST /api/series/[id]/queue — member adds a question. Interview access required.
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const ctx = await loadSeriesAccess(id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Append at the end of the pending queue.
  const svc = serviceClient();
  const { data: last } = await svc
    .from("queued_questions")
    .select("position")
    .eq("series_id", id)
    .eq("status", "pending")
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await svc
    .from("queued_questions")
    .insert({ series_id: id, text: parsed.data.text, source: "member", created_by: ctx.user.id, position })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/series/[id]/queue — manage the queue. reorder/pin/remove are
// admin-only (mirrors PATCH /api/series/[id]); markAsked needs interview
// access because it's called from a live quickfire session.
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const ctx = await loadSeriesAccess(id);
  if ("error" in ctx) return ctx.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  const svc = serviceClient();

  if (body.action === "markAsked") {
    if (!ctx.canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { error } = await svc
      .from("queued_questions")
      .update({ status: "asked", asked_in_interview_id: body.interviewId, updated_at: new Date().toISOString() })
      .eq("series_id", id)
      .eq("status", "pending")
      .in("id", body.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (body.action === "reorder") {
    // ids is the full desired pending order; write positions 0..n-1.
    for (let i = 0; i < body.ids.length; i++) {
      const { error } = await svc
        .from("queued_questions")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("series_id", id)
        .eq("id", body.ids[i]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pin") {
    // Pin = re-write positions from the freshly-read pending order with the
    // pinned id first. Small table — per-row updates are fine at queue sizes.
    const { data: pending, error: listErr } = await svc
      .from("queued_questions")
      .select("id")
      .eq("series_id", id)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const order = [body.id, ...(pending ?? []).map((r) => r.id).filter((x) => x !== body.id)];
    for (let i = 0; i < order.length; i++) {
      const { error } = await svc
        .from("queued_questions")
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq("series_id", id)
        .eq("id", order[i]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // remove — body is narrowed to the remove variant here.
  const { error } = await svc
    .from("queued_questions")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("series_id", id)
    .eq("id", body.id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `src/app/api/interviews/[id]/queue/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/db/queries";
import { serviceClient } from "@/db/service";
import { canInterviewSeries } from "@/server/interviews/access";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

// POST /api/interviews/[id]/queue — Flow's "+" button: save a proposed
// follow-up for later, stamped with the session it came from.
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const { user, supabase, organization, role } = await getViewer();
  if (!organization) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const svc = serviceClient();
  const { data: interview, error: ivErr } = await svc
    .from("interviews")
    .select("id, series_id, status, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (ivErr) return NextResponse.json({ error: ivErr.message }, { status: 500 });
  if (!interview || interview.organization_id !== organization.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (interview.status !== "in_progress") {
    return NextResponse.json({ error: "not_in_progress" }, { status: 409 });
  }

  const { data: series } = await svc
    .from("series")
    .select("id, subject_user_id")
    .eq("id", interview.series_id)
    .maybeSingle();
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canInterview = await canInterviewSeries(supabase, {
    userId: user.id,
    role,
    seriesSubjectUserId: series.subject_user_id,
    seriesId: series.id,
  });
  if (!canInterview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data: last } = await svc
    .from("queued_questions")
    .select("position")
    .eq("series_id", series.id)
    .eq("status", "pending")
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await svc
    .from("queued_questions")
    .insert({
      series_id: series.id,
      text: parsed.data.text,
      source: "flow",
      created_by: user.id,
      source_interview_id: id,
      position,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await svc
    .from("queued_questions")
    .select("id", { count: "exact", head: true })
    .eq("series_id", series.id)
    .eq("status", "pending");

  return NextResponse.json({ id: data.id, pendingCount: count ?? 0 });
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build` — Expected: clean. (Route logic is exercised end-to-end in manual QA; the auth pattern is copied from routes already covered by RLS.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): question queue routes (add, reorder, pin, remove, markAsked)" && git push
```

---

### Task 5: Question queue screen

**Files:**
- Create: `src/app/app/series/[id]/queue/page.tsx` (server component)
- Create: `src/app/app/series/[id]/queue/QueueList.tsx` (client component)

**Interfaces:**
- Consumes: `listPendingQueuedQuestions` (Task 4), queue APIs (Task 4), `listInterviewsForSeries`/`listMembers`/`getSeries`/`getViewer` (existing, `src/db/queries.ts`).
- Produces: route `/app/series/[id]/queue`. "Answer these now" links to `/app/series/[id]/interview?mode=quickfire` (Task 6 makes that param real).

**Deviation from mockup, on purpose:** reorder is via the ⋮ menu (Move up / Move down / Pin as next up / Remove) rather than drag-and-drop — no dnd library exists in this repo and touch-drag is real scope. The PATCH `reorder` API takes a full ordering, so drag can be layered on later without API changes.

- [ ] **Step 1: Create `page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  getSeries,
  getViewer,
  listInterviewsForSeries,
  listMembers,
  listPendingQueuedQuestions,
} from "@/db/queries";
import { QueueList, type QueueItem } from "./QueueList";

type Params = Promise<{ id: string }>;

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The question queue (mockup 1b): saved follow-ups from Flow sessions plus
 * member-added questions, in the order the next Quickfire session will ask
 * them. Anyone who can view the series sees it; management actions are
 * gated per-action in the API (admin for reorder/pin/remove).
 */
export default async function QueuePage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, role } = await getViewer();

  const series = await getSeries(supabase, id);
  if (!series) notFound();

  const [pending, sessions, members] = await Promise.all([
    listPendingQueuedQuestions(supabase, id),
    listInterviewsForSeries(supabase, id),
    listMembers(supabase),
  ]);

  const sessionNumberByInterview = new Map(sessions.map((s) => [s.id, s.sessionNumber] as const));
  const nameByUser = new Map(
    members.map((m) => [m.user_id, m.users?.display_name || m.users?.email || "a member"] as const),
  );

  const items: QueueItem[] = pending.map((q) => ({
    id: q.id,
    text: q.text,
    provenance:
      q.source === "flow" && q.source_interview_id
        ? `saved during Session ${sessionNumberByInterview.get(q.source_interview_id) ?? "?"} · ${relativeDay(q.created_at)}`
        : `queued by ${q.created_by ? nameByUser.get(q.created_by) ?? "a member" : "a member"} · ${relativeDay(q.created_at)}`,
  }));

  return (
    <div className="w-full">
      <div className="mb-2 text-[12.5px] text-faint">
        <Link href={`/app/series/${series.id}`} className="text-muted">
          {series.title}
        </Link>{" "}
        / Question queue
      </div>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px]">Question queue</h1>
          <div className="mt-0.5 text-[13.5px] text-muted">
            Saved follow-ups — the next Quickfire session asks these first.
          </div>
        </div>
        {items.length > 0 ? (
          <Link href={`/app/series/${series.id}/interview?mode=quickfire`}>
            <Button variant="primary">Answer these now</Button>
          </Link>
        ) : null}
      </div>
      <QueueList seriesId={series.id} initialItems={items} canManage={role === "admin"} />
    </div>
  );
}
```

(Verify `listInterviewsForSeries`'s returned shape at `src/db/queries.ts:391` — the realtime-token route's comment says it derives `sessionNumber`; use its actual field names. If it doesn't expose `sessionNumber`, derive it the same way that function's callers do.)

- [ ] **Step 2: Create `QueueList.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type QueueItem = { id: string; text: string; provenance: string };

/**
 * Client half of the queue screen: pending list with per-item ⋮ actions
 * (admin), plus the member "Add question" composer. Every action round-trips
 * the queue API then router.refresh()es — the server page is the source of
 * truth for order and provenance.
 */
export function QueueList({
  seriesId,
  initialItems,
  canManage,
}: {
  seriesId: string;
  initialItems: QueueItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/queue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Couldn't update the queue — try again.");
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= items.length) return;
    const order = [...items];
    [order[idx], order[next]] = [order[next], order[idx]];
    setItems(order);
    void patch({ action: "reorder", ids: order.map((i) => i.id) });
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      setDraft("");
      router.refresh();
    } catch {
      setError("Couldn't add that question — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2.5">
      {items.length === 0 ? (
        <Card className="px-[22px] py-6 text-[14px] text-muted">
          Nothing waiting. Follow-ups you save during Flow sessions land here — or add one below.
        </Card>
      ) : (
        items.map((item, idx) => (
          <Card
            key={item.id}
            className={`relative px-[18px] py-3.5 ${idx === 0 ? "border-green-deep/40 border-[1.5px]" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {idx === 0 ? (
                  <span className="mb-1.5 inline-block rounded-full bg-green-tint px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-green-deep">
                    Next up
                  </span>
                ) : null}
                <p className="font-serif text-[15.5px] leading-snug">{item.text}</p>
                <p className="mt-1 text-[11.5px] text-muted">{item.provenance}</p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  aria-label="Question actions"
                  onClick={() => setMenuFor((v) => (v === item.id ? null : item.id))}
                  className="shrink-0 px-1 text-[17px] leading-none text-faint hover:text-ink"
                  disabled={busy}
                >
                  ⋮
                </button>
              ) : null}
            </div>
            {menuFor === item.id ? (
              <div className="absolute right-3 top-10 z-10 flex w-44 flex-col rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                {idx !== 0 ? (
                  <MenuButton onClick={() => void patch({ action: "pin", id: item.id })}>Pin as next up</MenuButton>
                ) : null}
                {idx > 0 ? <MenuButton onClick={() => move(item.id, -1)}>Move up</MenuButton> : null}
                {idx < items.length - 1 ? (
                  <MenuButton onClick={() => move(item.id, 1)}>Move down</MenuButton>
                ) : null}
                <MenuButton onClick={() => void patch({ action: "remove", id: item.id })}>Remove</MenuButton>
              </div>
            ) : null}
          </Card>
        ))
      )}

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add a question for the next session…"
          disabled={busy}
        />
        <Button type="button" variant="primary" onClick={() => void add()} disabled={busy || !draft.trim()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-[12.5px] font-medium text-amber">{error}</p> : null}
    </div>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 text-left text-[13.5px] hover:bg-black/5"
    >
      {children}
    </button>
  );
}
```

(As in Task 3: before styling, check the theme tokens actually available — `green-tint`, `text-faint`, `text-ink`, `text-amber` — against `src/app/globals.css` and neighboring components, and substitute the closest existing classes. `Input`'s props: confirm it forwards `onKeyDown`; if not, use a plain `<input className={inputClasses}>` like `InterviewGuideForm` does for planned sessions.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build` — Expected: clean. Then `npm run dev`, visit a series' `/queue` route, add a question, pin/move/remove it as admin.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(queue): question queue screen with pin/reorder/remove and member add" && git push
```

---

### Task 6: Mode threading — startInterview, interview page, pre-talk picker

**Files:**
- Modify: `src/server/interviews/start.ts` (input + insert + resume)
- Test: `src/server/interviews/__tests__/start.test.ts`
- Modify: `src/app/app/series/[id]/interview/page.tsx`
- Modify: `src/app/app/series/[id]/interview/LiveInterview.tsx` (props + header badge only, in this task)

**Interfaces:**
- Consumes: `ConversationMode`, `series.conversation_mode`, `series.ask_mode_each_time`, `interviews.mode` (Task 1); `listPendingQueuedQuestions` (Task 4).
- Produces: `StartInterviewInput` gains `mode: ConversationMode`; `LiveInterviewProps` gains `mode: ConversationMode` and `pendingQueue: { id: string; text: string }[]`. URL contract: `/app/series/[id]/interview?mode=deep|flow|quickfire` (+ existing `handoff=1`). Tasks 7–9 rely on all of these.

- [ ] **Step 1: Extend start.test.ts (failing first)**

Add `mode: "deep" as const` to existing fixtures' input (they'll fail to compile until Step 2), plus:

```ts
it("stamps the requested mode on a new interview row", async () => {
  // follow the file's existing mock pattern for the insert path; assert the
  // inserted row includes mode: "flow" when input.mode is "flow"
});

it("updates mode when resuming an in-progress interview started in another mode", async () => {
  // existing-row path: expect an update call setting { mode: "quickfire" }
  // when the resumed row is found and input.mode is "quickfire"
});
```

Write these against the file's existing supabase-mock helpers (read the file first; reuse its builder exactly).

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- start` — Expected: compile failure/new tests FAIL.

- [ ] **Step 3: Implement in `start.ts`**

```ts
export type StartInterviewInput = {
  organizationId: string;
  seriesId: string;
  conductedBy: string;
  handoff: boolean;
  creditsRemaining: number;
  /** Mode this session should run in (picker choice or the series default). */
  mode: ConversationMode;
};
```

In the resume branch (`if (existingId)`), before returning, stamp the mode so a reconnect that chose differently (or a resumed session after the default changed) mints matching instructions:

```ts
const { error: modeErr } = await supabase
  .from("interviews")
  .update({ mode: input.mode })
  .eq("id", existingId);
if (modeErr) throw new Error(modeErr.message);
return { interviewId: existingId };
```

In the insert payload, add `mode: input.mode` (and the same in the 23505-race re-fetch path if it re-inserts — read the whole function; the race path only re-fetches, so no change there).

- [ ] **Step 4: Run tests**

Run: `npm run test` — Expected: ALL PASS.

- [ ] **Step 5: Interview page — mode param, picker, queue props**

In `interview/page.tsx`:

```ts
type Search = Promise<{ handoff?: string; mode?: string }>;

const MODES = ["deep", "flow", "quickfire"] as const;
function parseMode(raw: string | undefined): ConversationMode | null {
  return (MODES as readonly string[]).includes(raw ?? "") ? (raw as ConversationMode) : null;
}
```

After loading `series` and checking access:

```ts
const requestedMode = parseMode((await searchParams).mode);

// "Ask me each time" → a pre-talk chooser before any mic/session setup.
// An explicit ?mode= (picker choice, or the queue page's "Answer these now")
// bypasses it.
if (series.ask_mode_each_time && !requestedMode) {
  return <ModePicker seriesId={series.id} handoff={isHandoff} defaultMode={series.conversation_mode} />;
}

const mode: ConversationMode = requestedMode ?? series.conversation_mode;
```

Pass `mode` into `startInterview({ ..., mode })`. Load the queue and thread the new props:

```ts
const pendingQueue = (await listPendingQueuedQuestions(supabase, series.id)).map((q) => ({
  id: q.id,
  text: q.text,
}));
```

```tsx
<LiveInterview
  interviewId={interviewId}
  seriesId={series.id}
  seriesTitle={series.title}
  subjectName={series.subject_name}
  handoff={isHandoff}
  mode={mode}
  pendingQueue={pendingQueue}
/>
```

Add the picker component in the same file (server-rendered links — zero client JS):

```tsx
const MODE_CARDS: { mode: ConversationMode; title: string; blurb: string }[] = [
  { mode: "deep", title: "Deep dive", blurb: "A full guided conversation — follow the thread wherever it goes." },
  { mode: "flow", title: "Flow", blurb: "Answer, then choose where to go next. Save follow-ups for later." },
  { mode: "quickfire", title: "Quick fire", blurb: "One question after another from your queue and topics." },
];

function ModePicker({
  seriesId,
  handoff,
  defaultMode,
}: {
  seriesId: string;
  handoff: boolean;
  defaultMode: ConversationMode;
}) {
  const suffix = handoff ? "&handoff=1" : "";
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center font-serif text-[26px]">How do you want to talk today?</h1>
        <div className="mt-5 flex flex-col gap-3">
          {MODE_CARDS.map((c) => (
            <Link key={c.mode} href={`/app/series/${seriesId}/interview?mode=${c.mode}${suffix}`}>
              <Card
                className={`px-5 py-4 transition-colors hover:border-green-deep/50 ${
                  c.mode === defaultMode ? "border-green-deep/40 border-[1.5px]" : ""
                }`}
              >
                <div className="text-[15px] font-semibold">
                  {c.title}
                  {c.mode === defaultMode ? (
                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-green-deep">
                      default
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[13px] text-muted">{c.blurb}</div>
              </Card>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-center">
          <Link href={`/app/series/${seriesId}`} className="text-[13px] font-medium text-muted">
            Back to the series
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: LiveInterview props + header badge**

In `LiveInterview.tsx`, extend the props type and destructure:

```ts
type LiveInterviewProps = {
  interviewId: string;
  seriesId: string;
  seriesTitle: string;
  subjectName: string;
  handoff: boolean;
  mode: ConversationMode;
  pendingQueue: { id: string; text: string }[];
};
```

Header pill (mockup 2a shows `FLOW 05:12`): change the REC pill content to:

```tsx
{connected ? `${mode === "flow" ? "FLOW" : mode === "quickfire" ? "QUICKFIRE" : "REC"} ${formatElapsed(elapsedSec)}` : "connecting…"}
```

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit && npm run test && npm run build` — Expected: clean.

```bash
git add -A && git commit -m "feat(interview): thread mode through start, pre-talk picker, session badge" && git push
```

---

### Task 7: Realtime token route — mode, queue, tools

**Files:**
- Modify: `src/app/api/interviews/[id]/realtime-token/route.ts`

**Interfaces:**
- Consumes: `buildInterviewerInstructions` new signature (Task 2); `interviews.mode` (Task 6 stamps it).
- Produces: session minted with `tools` for flow/quickfire; response body unchanged (`{ clientSecret, model }`). Tool names/parameters exactly as below — Tasks 8–9 parse them.

- [ ] **Step 1: Load mode + queue**

Add `mode` to the interview select (line 32): `"id, series_id, status, hand_the_mic, organization_id, started_at, mode"`. Add `conversation_mode` to the series select (line 45). Add a queue fetch to the `Promise.all` block (line 70):

```ts
svc
  .from("queued_questions")
  .select("id, text")
  .eq("series_id", series.id)
  .eq("status", "pending")
  .order("position", { ascending: true })
  .order("created_at", { ascending: true }),
```

with the same error-check pattern as its siblings. Then:

```ts
// Null mode = an interview started before modes existed (or a legacy row):
// fall back to the series default, never crash.
const mode = interview.mode ?? series.conversation_mode;
const queuedQuestions = (queueRes.data ?? []).map((q) => q.text);
```

Pass both to `buildInterviewerInstructions({ ..., mode, queuedQuestions })`.

- [ ] **Step 2: Declare tools on the session**

Before the `clientSecrets.create` call:

```ts
// Realtime function tools per mode. Shapes verified against
// node_modules/openai/resources/realtime/realtime.d.ts (RealtimeFunctionTool):
// { type: "function", name, description, parameters } — parameters is a raw
// JSON-schema object.
const FLOW_TOOLS = [
  {
    type: "function" as const,
    name: "propose_followups",
    description:
      "Immediately after the subject finishes an answer, propose 2-3 short follow-up questions that " +
      "build on what they just said. The subject picks one on screen; stay silent until the result arrives.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          description: "Distinct, specific, one-sentence follow-up questions.",
        },
      },
      required: ["questions"],
    },
  },
];

const QUICKFIRE_TOOLS = [
  {
    type: "function" as const,
    name: "mark_question_asked",
    description:
      "Call after the subject finishes answering an item from the QUESTION LIST, before asking the next " +
      "one. index is the item's 1-based number in the list; total is the list length.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number" },
        total: { type: "number" },
      },
      required: ["index", "total"],
    },
  },
];

const tools = mode === "flow" ? FLOW_TOOLS : mode === "quickfire" ? QUICKFIRE_TOOLS : undefined;
```

In the `session` object passed to `client.realtime.clientSecrets.create`, add `...(tools ? { tools, tool_choice: "auto" } : {})` at the same level as `instructions`. **Verify the exact property names (`tools`, `tool_choice`) and the function-tool shape against the openai 6.34.0 realtime types before finalizing** — if the SDK type wants `tool_choice` nested or a different literal, follow the SDK.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build` — Expected: clean.

```bash
git add -A && git commit -m "feat(realtime): mode-aware instructions, queue injection, session tools" && git push
```

---

### Task 8: Flow mode live UI — cards, queue, toast, nudge, stop

**Files:**
- Modify: `src/app/app/series/[id]/interview/LiveInterview.tsx`

**Interfaces:**
- Consumes: `propose_followups` function-call events (Task 7), `POST /api/interviews/[id]/queue` (Task 4), `mode`/`pendingQueue` props (Task 6).
- Produces: complete Flow session UX (mockup 2a–2c; 2d is the existing recap, extended in Task 10).

- [ ] **Step 1: Extend the RealtimeEvent type + state**

```ts
type RealtimeEvent = {
  type: string;
  transcript?: string;
  delta?: string;
  response?: { usage?: RealtimeResponseUsage };
  item?: { type?: string; name?: string; call_id?: string; arguments?: string };
};
```

(Function calls surface as `response.output_item.done` with `item.type === "function_call"` — verify the event name and `item` fields against `node_modules/openai/resources/realtime/realtime.d.ts` before wiring.)

New state/refs:

```ts
type FollowupCard = { text: string; queued: boolean };
const [followups, setFollowups] = useState<FollowupCard[] | null>(null);
const [queueCount, setQueueCount] = useState(pendingQueue.length);
const [toast, setToast] = useState<string | null>(null);
const followupCallIdRef = useRef<string | null>(null);
const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const nudgedRef = useRef(false);
```

- [ ] **Step 2: Handle the function call in `attachDataChannel`**

Add a case:

```ts
case "response.output_item.done": {
  const item = event.item;
  if (mode === "flow" && item?.type === "function_call" && item.name === "propose_followups" && item.call_id) {
    let questions: string[] = [];
    try {
      const args = JSON.parse(item.arguments ?? "{}") as { questions?: unknown };
      if (Array.isArray(args.questions)) {
        questions = args.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
      }
    } catch {
      // Malformed args — treat as no proposal; conversation continues.
    }
    if (questions.length > 0) {
      followupCallIdRef.current = item.call_id;
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      nudgedRef.current = false;
      // Freeze the mic while the cards are up so VAD can't race the choice.
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      setFollowups(questions.slice(0, 3).map((text) => ({ text, queued: false })));
      setOrbState("listening");
    }
  }
  break;
}
```

(`mode` is a prop, stable for the component's life — adding it to `attachDataChannel`'s dependency array is fine.)

- [ ] **Step 3: Nudge fallback**

In the same handler, in the existing `conversation.item.input_audio_transcription.completed` case, after `addTurn`, add:

```ts
if (mode === "flow" && !pausedRef.current && !endingRef.current) {
  if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
  nudgeTimerRef.current = setTimeout(() => {
    // The model finished hearing an answer but never proposed follow-ups.
    // Nudge once; if it still doesn't, the session degrades to a normal
    // conversation — never block.
    if (followupCallIdRef.current || nudgedRef.current || endingRef.current) return;
    nudgedRef.current = true;
    const dc = dcRef.current;
    if (dc?.readyState === "open") {
      dc.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Call the propose_followups tool now with 2-3 follow-up questions to what the subject just said. Do not speak.",
          },
        }),
      );
    }
  }, 6000);
}
```

And in the `output_audio_buffer.started` case add: `if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);` (the model chose to speak — don't nudge over it). Clear the timer in `teardownMedia` too.

- [ ] **Step 4: Card actions**

```ts
const answerFollowup = useCallback((text: string) => {
  const dc = dcRef.current;
  const callId = followupCallIdRef.current;
  if (!dc || dc.readyState !== "open" || !callId) return;
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ chosen: text }) },
    }),
  );
  dc.send(JSON.stringify({ type: "response.create" }));
  followupCallIdRef.current = null;
  setFollowups(null);
  micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = true));
  setOrbState("thinking");
}, []);

const queueFollowup = useCallback(
  async (index: number, text: string) => {
    try {
      const res = await fetch(`/api/interviews/${interviewId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const { pendingCount } = (await res.json()) as { pendingCount: number };
      setQueueCount(pendingCount);
      setFollowups((prev) => prev?.map((c, i) => (i === index ? { ...c, queued: true } : c)) ?? null);
      setToast(`Saved for later — Queue · ${pendingCount}`);
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Couldn't save that one — try again.");
      setTimeout(() => setToast(null), 2500);
    }
  },
  [interviewId],
);
```

- [ ] **Step 5: Render the card stack + toast + flow footer**

In the center stage `<main>`, when `mode === "flow" && followups`, render INSTEAD of the current-question block (keep the transcript line):

```tsx
<div className="w-full max-w-md text-left">
  {toast ? (
    <div className="mx-auto mb-3 w-fit rounded-full border border-[oklch(0.72_0.08_165/0.45)] bg-[oklch(0.52_0.06_165/0.22)] px-4 py-2 text-[12.5px] font-semibold text-[oklch(0.85_0.05_165)]">
      {toast}
    </div>
  ) : null}
  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgba(240,237,230,0.5)]">
    Where next?
  </p>
  <div className="flex flex-col gap-2.5">
    {followups.map((card, i) => (
      <div
        key={card.text}
        className={`flex items-center gap-2.5 rounded-[13px] border px-3.5 py-3 ${
          card.queued
            ? "border-[rgba(240,237,230,0.18)] bg-[rgba(240,237,230,0.08)] opacity-45"
            : i === 0
              ? "border-[oklch(0.72_0.08_165/0.5)] bg-[oklch(0.52_0.06_165/0.18)]"
              : "border-[rgba(240,237,230,0.18)] bg-[rgba(240,237,230,0.08)]"
        }`}
      >
        <button
          type="button"
          onClick={() => answerFollowup(card.text)}
          disabled={card.queued}
          className={`min-w-0 flex-1 text-left font-serif text-[14.5px] leading-snug ${
            card.queued ? "line-through" : ""
          }`}
        >
          {card.text}
        </button>
        {card.queued ? (
          <span aria-hidden className="shrink-0 text-[15px]">✓</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => answerFollowup(card.text)}
              className="shrink-0 text-[12px] font-semibold text-[oklch(0.82_0.06_165)]"
            >
              Answer ›
            </button>
            <button
              type="button"
              aria-label="Save for later"
              onClick={() => void queueFollowup(i, card.text)}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(240,237,230,0.35)] text-[16px] text-[rgba(240,237,230,0.8)]"
            >
              +
            </button>
          </>
        )}
      </div>
    ))}
  </div>
  <p className="mt-2.5 text-center text-[12px] text-[rgba(240,237,230,0.5)]">tap to answer · + saves for later</p>
</div>
```

Footer, flow only: replace the "Skip question" `SessionButton` with a Queue chip, and relabel the end button (mockup: "Stop here" while cards are up):

```tsx
{mode === "flow" ? (
  <SessionButton label={`Queue · ${queueCount}`} glyph="≡" onClick={() => setDrawerOpen((v) => !v)} disabled={!connected || isEnding} />
) : (
  <SessionButton label="Skip question" glyph="→" onClick={skipQuestion} disabled={!connected || isPaused || isEnding} />
)}
```

and for the primary button label: `label={isEnding ? "Wrapping up…" : mode === "flow" && followups ? "Stop here" : "I'm done"}`.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit && npm run build` — Expected: clean. Manual QA (requires OpenAI credits): start a Flow session, answer once, confirm cards appear, + queues with toast, Answer resumes aloud, Stop here lands on the recap.

```bash
git add -A && git commit -m "feat(flow): follow-up cards, save-for-later queue, nudge fallback" && git push
```

---

### Task 9: Quickfire live UI — progress + markAsked

**Files:**
- Modify: `src/app/app/series/[id]/interview/LiveInterview.tsx`

**Interfaces:**
- Consumes: `mark_question_asked` function-call events (Task 7), `PATCH /api/series/[id]/queue` markAsked action (Task 4), `pendingQueue` prop (Task 6 — index→queue-id mapping: list items 1..pendingQueue.length are queue rows, in order).
- Produces: progress line "Question N of T" during quickfire; queue rows flipped to `asked` as the session covers them.

- [ ] **Step 1: State + handler**

```ts
const [quickfireProgress, setQuickfireProgress] = useState<{ index: number; total: number } | null>(null);
```

In the `response.output_item.done` case (added in Task 8), add a sibling branch:

```ts
if (mode === "quickfire" && item?.type === "function_call" && item.name === "mark_question_asked" && item.call_id) {
  let index = 0;
  let total = 0;
  try {
    const args = JSON.parse(item.arguments ?? "{}") as { index?: number; total?: number };
    index = typeof args.index === "number" ? args.index : 0;
    total = typeof args.total === "number" ? args.total : 0;
  } catch {
    // Malformed args — ack anyway so the model moves on.
  }
  if (index > 0) setQuickfireProgress({ index, total });

  // Ack the tool so the model continues to the next question.
  const dc = dcRef.current;
  if (dc?.readyState === "open") {
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify({ ok: true }) },
      }),
    );
    dc.send(JSON.stringify({ type: "response.create" }));
  }

  // Items 1..pendingQueue.length in the QUESTION LIST are queue rows, in
  // order (the token route builds the list queue-first from the same
  // position sort). Flip the matching row to asked — best-effort.
  const queueItem = index >= 1 && index <= pendingQueue.length ? pendingQueue[index - 1] : null;
  if (queueItem) {
    void fetch(`/api/series/${seriesId}/queue`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAsked", ids: [queueItem.id], interviewId }),
    }).catch(() => {
      // Unmarked rows stay pending and get re-asked next time — acceptable.
    });
  }
}
```

(`pendingQueue`, `seriesId`, `interviewId` are props — add to the callback's dependency array.)

- [ ] **Step 2: Render progress**

In the header (next to the mode pill) or directly under the current-question text, when `mode === "quickfire" && quickfireProgress`:

```tsx
<p className="mt-2 text-[12px] font-medium tabular-nums text-[rgba(247,245,240,0.55)]">
  Question {Math.min(quickfireProgress.index + 1, quickfireProgress.total)} of {quickfireProgress.total}
</p>
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build` — Expected: clean. Manual QA: queue 2 questions, start via "Answer these now", confirm both get asked first, progress ticks, and the queue screen shows them gone after the session.

```bash
git add -A && git commit -m "feat(quickfire): progress indicator + queue markAsked from live session" && git push
```

---

### Task 10: Recap queue banner + full verification

**Files:**
- Modify: `src/app/app/interviews/[id]/recap/page.tsx`

**Interfaces:**
- Consumes: pending-count query (pattern from Task 3), `series.id` already loaded in the page.

- [ ] **Step 1: Banner on the recap**

In `RecapPage`, alongside the existing `Promise.all`, fetch the pending count (same head-count query as Task 3 Step 3, using `series.id`). Render, after the "Saved today"/facts section and before the closing actions:

```tsx
{queueCount > 0 ? (
  <Card className="border-[1.5px] border-green-deep/35 bg-green-tint/40 px-[18px] py-3.5">
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">
          {queueCount === 1 ? "1 question in your queue" : `${queueCount} questions in your queue`}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">They&apos;ll open the next session.</div>
      </div>
      <Link
        href={`/app/series/${series.id}/queue`}
        className="shrink-0 text-[12.5px] font-semibold text-green-deep"
      >
        Review ›
      </Link>
    </div>
  </Card>
) : null}
```

(Match the Card/token classes actually used in this file — read its existing markup first.)

- [ ] **Step 2: Full verification**

Run, in order:

```bash
rm -rf .next
npm run test        # expected: all pass
npx tsc --noEmit    # expected: clean
npm run build       # expected: build succeeds
```

Manual QA checklist (needs a dev login + OpenAI credits — flag to Nick if credits are out, per the voice-stack memory):
1. Settings: switch Default mode between all three, toggle Ask me each time, Save → reload shows persisted values.
2. Queue screen: add, pin, move, remove; count matches settings card.
3. Ask-each-time ON → Talk shows the picker; OFF → straight into default mode; `?mode=` bypasses the picker.
4. Deep session: behaves exactly as before (no tools declared).
5. Flow session: cards after an answer, + toast + count bump, Answer asked aloud, nudge path (wait ~6s if the model stalls), Stop here → recap with queue banner.
6. Quickfire session: queue questions first, progress ticks, rows flip to asked.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(recap): queue banner + conversation modes complete" && git push
```
