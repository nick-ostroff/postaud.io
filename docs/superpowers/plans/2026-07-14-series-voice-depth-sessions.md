# Series Voice, Depth & Planned Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a series owner choose the interviewer's voice and persona, set how deep the questions go, and optionally declare how many sessions the series is planned to run — all three steering the live Realtime system prompt.

**Architecture:** Four additive columns on `series` (`voice`, `interviewer_name`, `depth`, `planned_sessions`), all defaulted to reproduce today's behavior exactly. A new client-safe persona registry (`src/lib/voices.ts`) is the single source of truth for the six voice/name/blurb triples and is imported by both the wizard and the API validation. `buildInterviewerInstructions()` grows a persona name, a DEPTH section, and a session-of-N line. The Realtime token route stops hardcoding `voice: "marin"` and reads the series' voice instead.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (raw SQL migrations, no ORM), zod, vitest, Tailwind, OpenAI Realtime (`gpt-realtime`) + OpenAI TTS (`gpt-4o-mini-tts`) for sample clips.

**Spec:** `docs/superpowers/specs/2026-07-14-series-voice-depth-sessions-design.md`

## Global Constraints

- **Every default must reproduce current behavior.** `voice='marin'`, `interviewer_name='Anna'`, `depth='balanced'`, `planned_sessions=null`. An existing series must produce a byte-identical prompt except for the new DEPTH section, and `balanced` is written to match today's implicit behavior. No backfill.
- **`marin` is always "Anna".** Non-negotiable — existing series' interviewer must not be renamed.
- **`voice` is `text`, not a Postgres enum**, so adding a voice later needs no migration. Validation lives at the zod boundary.
- **`depth` IS a Postgres enum** (`series_depth`), mirroring how `series_tone` is done.
- **The interviewer's name is interpolated, never hardcoded.** After Task 4, the string `"Anna"` must not appear as a literal in `interviewer-prompt.ts`, and after Task 8 it must not appear in `Wizard.tsx` Guide-step copy. It remains legitimately present in `src/lib/voices.ts` (the registry) and in Basics-step/QuickCreate copy, which are out of scope.
- **No hard enforcement.** Depth and planned-sessions are prompt directives only. Nothing blocks a session beyond the target; nothing truncates a question.
- **Tests:** `npx vitest run <path>` — vitest 4, tests live in `__tests__/` beside the source. Test files use flat `it()` blocks, no `describe` wrapper (match `src/server/ai/__tests__/interviewer-prompt.test.ts`).
- **Commit after every task.** Per the repo's global rule: `git add -A && git commit -m '<msg>' && git push`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0011_series_voice_depth.sql` | **Create.** The four columns + `series_depth` enum. |
| `src/db/types.ts` | **Modify.** `SeriesDepth` union (line ~18); `series` Row/Insert/Update (lines 160–211). |
| `src/lib/voices.ts` | **Create.** Persona registry. Client-safe — no server imports, no env access. Single source of truth for voice ids, names, blurbs, sample paths. |
| `src/lib/__tests__/voices.test.ts` | **Create.** Registry invariants. |
| `scripts/generate-voice-samples.ts` | **Create.** One-off TTS generator. Not part of the build. |
| `public/voices/*.mp3` | **Create.** Six committed sample clips. |
| `src/server/ai/interviewer-prompt.ts` | **Modify.** Persona name, DEPTH section, session-of-N line. |
| `src/server/ai/__tests__/interviewer-prompt.test.ts` | **Modify.** Cover all three. |
| `src/app/api/series/route.ts` | **Modify.** `createSeriesSchema` gains four fields. |
| `src/app/api/series/[id]/route.ts` | **Modify.** Patch schema gains the same four, all optional. |
| `src/server/series/create.ts` | **Modify.** `CreateSeriesInput` + the insert. |
| `src/app/api/interviews/[id]/realtime-token/route.ts` | **Modify.** Select new columns, compute session number, use the series' voice. |
| `src/components/series/VoicePicker.tsx` | **Create.** Card grid + shared single-clip audio preview. |
| `src/app/app/series/new/Wizard.tsx` | **Modify.** Guide step controls, state, payload, review summary. |
| `src/app/app/series/new/QuickCreate.tsx` | **Modify.** Send defaults. |
| `src/app/app/series/[id]/page.tsx` | **Modify.** "N of M" session count. |

---

### Task 1: Migration + DB types

**Files:**
- Create: `supabase/migrations/0011_series_voice_depth.sql`
- Modify: `src/db/types.ts:18` (unions), `src/db/types.ts:160-211` (series Row/Insert/Update)

**Interfaces:**
- Consumes: nothing.
- Produces: `SeriesDepth = "light" | "balanced" | "deep"` exported from `@/db/types`. `series` rows gain `voice: string`, `interviewer_name: string`, `depth: SeriesDepth`, `planned_sessions: number | null` (Row); all optional in Insert/Update.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_series_voice_depth.sql`:

```sql
-- 0011_series_voice_depth.sql
-- Per-series interviewer voice + persona, question depth, and an optional
-- planned-session target. All four defaults reproduce the pre-migration
-- behavior exactly (voice was hardcoded 'marin'/"Anna"; depth 'balanced'
-- matches the prompt as it stood), so no backfill is needed.

create type series_depth as enum ('light', 'balanced', 'deep');

alter table series
  add column voice            text         not null default 'marin',
  add column interviewer_name text         not null default 'Anna',
  add column depth            series_depth not null default 'balanced',
  add column planned_sessions int          null check (planned_sessions between 1 and 50);
```

- [ ] **Step 2: Apply it to the linked Supabase project**

Use the Supabase MCP tool `apply_migration` with `name: "series_voice_depth"` and the SQL above. (The `supabase` CLI is not installed locally; `npx supabase` would need a fresh install and a manual link.)

Then verify with the MCP `execute_sql` tool:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'series'
  and column_name in ('voice','interviewer_name','depth','planned_sessions')
order by column_name;
```

Expected: 4 rows — `depth` (USER-DEFINED, `'balanced'::series_depth`, NO), `interviewer_name` (text, `'Anna'::text`, NO), `planned_sessions` (integer, null, YES), `voice` (text, `'marin'::text`, NO).

- [ ] **Step 3: Confirm existing series read back as the defaults**

Via MCP `execute_sql`:

```sql
select voice, interviewer_name, depth, planned_sessions from series limit 5;
```

Expected: every existing row is `marin` / `Anna` / `balanced` / `null`. (If the table is empty, that's fine — the column defaults were already verified in Step 2.)

- [ ] **Step 4: Add the `SeriesDepth` union to `src/db/types.ts`**

After the `SeriesTone` line (currently line 18):

```ts
export type SeriesTone = "warm" | "neutral" | "playful"
export type SeriesDepth = "light" | "balanced" | "deep"
```

- [ ] **Step 5: Add the four columns to the `series` table types**

In `src/db/types.ts`, add to `series.Row` (after `session_minutes: number`, line 173):

```ts
          session_minutes: number
          voice: string
          interviewer_name: string
          depth: SeriesDepth
          planned_sessions: number | null
```

Add to `series.Insert` (after `session_minutes?: number`, line 190):

```ts
          session_minutes?: number
          voice?: string
          interviewer_name?: string
          depth?: SeriesDepth
          planned_sessions?: number | null
```

Add to `series.Update` (after `session_minutes?: number`, line 207) — identical to the Insert block:

```ts
          session_minutes?: number
          voice?: string
          interviewer_name?: string
          depth?: SeriesDepth
          planned_sessions?: number | null
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors. (Nothing consumes the new fields yet; this only proves the type file is well-formed.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m 'feat(series): add voice, interviewer_name, depth, planned_sessions columns' && git push
```

---

### Task 2: Voice persona registry

**Files:**
- Create: `src/lib/voices.ts`
- Test: `src/lib/__tests__/voices.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type VoiceId`, `type VoicePersona = { id, name, blurb, sample }`, `const VOICES: VoicePersona[]`, `const VOICE_IDS: [VoiceId, ...VoiceId[]]` (a tuple, so `z.enum()` can take it directly), `const DEFAULT_VOICE: VoiceId = "marin"`, `const DEFAULT_INTERVIEWER_NAME = "Anna"`, `function personaFor(id: string): VoicePersona` (falls back to the default persona for an unknown id).

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/voices.test.ts`:

```ts
import { it, expect } from "vitest";
import { VOICES, VOICE_IDS, DEFAULT_VOICE, DEFAULT_INTERVIEWER_NAME, personaFor } from "../voices";

it("ships six personas with unique ids and names", () => {
  expect(VOICES).toHaveLength(6);
  expect(new Set(VOICES.map((v) => v.id)).size).toBe(6);
  expect(new Set(VOICES.map((v) => v.name)).size).toBe(6);
});

it("keeps marin as Anna — existing series must not be renamed", () => {
  expect(DEFAULT_VOICE).toBe("marin");
  expect(DEFAULT_INTERVIEWER_NAME).toBe("Anna");
  expect(personaFor("marin").name).toBe("Anna");
});

it("points every persona at its own sample clip", () => {
  for (const v of VOICES) expect(v.sample).toBe(`/voices/${v.id}.mp3`);
});

it("exposes ids as a tuple that covers every persona", () => {
  expect([...VOICE_IDS].sort()).toEqual(VOICES.map((v) => v.id).sort());
});

it("falls back to the default persona for an unknown voice id", () => {
  expect(personaFor("not-a-voice").id).toBe(DEFAULT_VOICE);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/__tests__/voices.test.ts`
Expected: FAIL — `Failed to resolve import "../voices"`.

- [ ] **Step 3: Write the registry**

Create `src/lib/voices.ts`:

```ts
/**
 * The interviewer personas a series can be given. Each OpenAI Realtime voice
 * ships with a fixed name and character blurb — picking the voice picks the
 * name, so a male voice can never end up being called "Anna".
 *
 * Client-safe on purpose: the wizard's picker, the API's zod validation, and
 * the prompt builder all read from this one list. No server imports here.
 *
 * `marin`/"Anna" is the default and MUST stay so — every series created before
 * the voice column existed reads back as marin, and renaming their interviewer
 * mid-series would be a bug, not a feature.
 */
export type VoiceId = "marin" | "cedar" | "sage" | "coral" | "echo" | "alloy";

export type VoicePersona = {
  /** OpenAI Realtime voice id — passed straight through to the session config. */
  id: VoiceId;
  /** The interviewer's name. Interpolated into the system prompt and the UI. */
  name: string;
  /** One line of character, shown under the name in the picker. */
  blurb: string;
  /** Static sample clip, generated by scripts/generate-voice-samples.ts. */
  sample: string;
};

export const VOICES: VoicePersona[] = [
  { id: "marin", name: "Anna", blurb: "Warm and unhurried. Lets a silence sit.", sample: "/voices/marin.mp3" },
  { id: "cedar", name: "Ellis", blurb: "Dry and curious. Asks the question you were avoiding.", sample: "/voices/cedar.mp3" },
  { id: "sage", name: "Nora", blurb: "Calm and precise. Good with hard subjects.", sample: "/voices/sage.mp3" },
  { id: "coral", name: "Vivian", blurb: "Bright and quick. Keeps a conversation moving.", sample: "/voices/coral.mp3" },
  { id: "echo", name: "Gil", blurb: "Steady and plain-spoken. No performance.", sample: "/voices/echo.mp3" },
  { id: "alloy", name: "Reese", blurb: "Neutral and easy. Gets out of the way.", sample: "/voices/alloy.mp3" },
];

export const DEFAULT_VOICE: VoiceId = "marin";
export const DEFAULT_INTERVIEWER_NAME = "Anna";

/** Tuple form for `z.enum(VOICE_IDS)` — zod needs a non-empty literal tuple. */
export const VOICE_IDS = VOICES.map((v) => v.id) as [VoiceId, ...VoiceId[]];

/**
 * Resolve a stored voice id back to its persona. Falls back to the default
 * rather than throwing: a series row could carry a voice we've since retired,
 * and a retired voice should degrade to Anna, not 500 an interview.
 */
export function personaFor(id: string): VoicePersona {
  return VOICES.find((v) => v.id === id) ?? VOICES.find((v) => v.id === DEFAULT_VOICE)!;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/lib/__tests__/voices.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m 'feat(voices): add interviewer persona registry' && git push
```

---

### Task 3: Voice sample clips

**Files:**
- Create: `scripts/generate-voice-samples.ts`
- Create: `public/voices/marin.mp3`, `cedar.mp3`, `sage.mp3`, `coral.mp3`, `echo.mp3`, `alloy.mp3`

**Interfaces:**
- Consumes: `VOICES` from `src/lib/voices.ts` (Task 2).
- Produces: six static mp3s at the paths `VOICES[].sample` already points at. Nothing imports the script.

OpenAI does not serve preview clips for Realtime voices, so we generate them once with the TTS API and commit the results. This is a one-off developer script, deliberately not wired into the build — it costs an API call per voice and the output is deterministic enough to check in.

- [ ] **Step 1: Write the generator script**

Create `scripts/generate-voice-samples.ts`:

```ts
/**
 * One-off: generates the voice-picker sample clips into public/voices/.
 * Run manually after changing VOICES, never as part of the build:
 *
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-voice-samples.ts
 *
 * The clips are committed to the repo so the picker costs nothing at runtime.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { VOICES } from "../src/lib/voices";

/** Interviewer-flavored so the sample previews the job, not just the timbre. */
const SCRIPT =
  "Tell me about the house you grew up in. Start anywhere — the front door, a smell, a room you remember.";

const OUT_DIR = path.join(process.cwd(), "public", "voices");

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const client = new OpenAI({ apiKey });

  await mkdir(OUT_DIR, { recursive: true });

  for (const voice of VOICES) {
    const res = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice.id,
      input: SCRIPT,
      instructions: `You are ${voice.name}, an oral-history interviewer. ${voice.blurb} Speak the line the way you would to someone you are about to interview: unhurried, curious, and human.`,
      response_format: "mp3",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const out = path.join(OUT_DIR, `${voice.id}.mp3`);
    await writeFile(out, buf);
    console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB) — ${voice.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/generate-voice-samples.ts`

(`OPENAI_API_KEY` is already in `.env.local`; if the script does not see it, prefix the command with `set -a && source .env.local && set +a &&`.)

Expected: six `wrote public/voices/<id>.mp3 … — <Name>` lines, each file roughly 40–120 KB.

If `tsx` is not installed, run `npx tsx@latest scripts/generate-voice-samples.ts` — do NOT add tsx as a project dependency for a script that runs once.

- [ ] **Step 3: Verify the files exist and are real audio**

Run: `ls -la public/voices/ && file public/voices/marin.mp3`
Expected: six `.mp3` files, non-zero size; `file` reports MPEG audio (e.g. "Audio file with ID3 version…" or "MPEG ADTS, layer III").

- [ ] **Step 4: Listen to at least two of them**

Run: `afplay public/voices/marin.mp3 && afplay public/voices/echo.mp3`
Expected: two clearly different voices reading the same line. This is a human check — the blurbs in `voices.ts` are a promise to the user, and if a voice does not match its blurb, adjust the blurb in `src/lib/voices.ts` now (not the name — names are fixed by the spec).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m 'feat(voices): generate and commit persona sample clips' && git push
```

---

### Task 4: Prompt builder — persona name, depth, session pacing

**Files:**
- Modify: `src/server/ai/interviewer-prompt.ts`
- Test: `src/server/ai/__tests__/interviewer-prompt.test.ts`

**Interfaces:**
- Consumes: `SeriesDepth` from `@/db/types` (Task 1).
- Produces: `InterviewerSeriesInput` gains `interviewerName: string`, `depth: SeriesDepth`, `plannedSessions?: number | null`. `BuildInterviewerInstructionsInput` gains `sessionNumber?: number | null`. Callers (Task 6) must pass `interviewerName` and `depth` — they are required, not optional, so a caller that forgets them fails to compile rather than silently reverting to Anna.

- [ ] **Step 1: Write the failing tests**

Replace `src/server/ai/__tests__/interviewer-prompt.test.ts` entirely:

```ts
import { it, expect } from "vitest";
import { buildInterviewerInstructions } from "../interviewer-prompt";
const base = { series: { title: "Dad's Story", subjectName: "Henk", subjectRelationship: "father",
  goal: "Capture Dad's whole life", openingPrompt: "Start warm: Rotterdam first", dontBringUp: ["Pieter's accident"],
  tone: "warm" as const, sessionMinutes: 20, interviewerName: "Anna", depth: "balanced" as const,
  plannedSessions: null }, handTheMic: false, sessionNumber: 1,
  knownFacts: [{ topic: "Meeting Jan", statement: "Met Jan, spring 1975, on the Hoek van Holland ferry." }],
  topics: [{ name: "Health & habits", coverageScore: 0, mustCover: true, suggested: false }], retellQueue: [] };
it("bakes in the guide rails", () => {
  const p = buildInterviewerInstructions(base);
  for (const s of ["Anna", "Henk", "Rotterdam first", "Pieter's accident", "never", "one question",
                   "Hoek van Holland", "Health & habits", "20 minutes"]) expect(p).toContain(s);
});
it("hand-the-mic changes the register", () => {
  const p = buildInterviewerInstructions({ ...base, handTheMic: true });
  expect(p.toLowerCase()).toContain("slower");
});
it("uses the series' interviewer name, not a hardcoded Anna", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, interviewerName: "Ellis" } });
  expect(p).toContain("You are Ellis,");
  expect(p).not.toContain("Anna");
});
it("light depth tells it to keep moving", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, depth: "light" } });
  expect(p).toContain("DEPTH");
  expect(p.toLowerCase()).toContain("one or two follow-ups");
});
it("deep depth tells it to exhaust the thread", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, depth: "deep" } });
  expect(p.toLowerCase()).toContain("until it is genuinely exhausted");
});
it("each depth produces different instructions", () => {
  const of = (depth: "light" | "balanced" | "deep") =>
    buildInterviewerInstructions({ ...base, series: { ...base.series, depth } });
  expect(new Set([of("light"), of("balanced"), of("deep")]).size).toBe(3);
});
it("paces across the planned sessions when a target is set", () => {
  const p = buildInterviewerInstructions({
    ...base, sessionNumber: 2, series: { ...base.series, plannedSessions: 6 },
  });
  expect(p).toContain("This is session 2 of 6");
});
it("says nothing about session count when the series is open-ended", () => {
  expect(buildInterviewerInstructions(base)).not.toContain("This is session");
});
it("says nothing about session count when the session number is unknown", () => {
  const p = buildInterviewerInstructions({
    ...base, sessionNumber: null, series: { ...base.series, plannedSessions: 6 },
  });
  expect(p).not.toContain("This is session");
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/server/ai/__tests__/interviewer-prompt.test.ts`
Expected: FAIL — the new-field tests fail (`expected … to contain "DEPTH"`, `"You are Ellis,"`, etc.). The two pre-existing tests still pass.

- [ ] **Step 3: Extend the input types**

In `src/server/ai/interviewer-prompt.ts`, change the import on line 1 and the two input types (lines 3–28):

```ts
import type { SeriesDepth, SeriesTone } from "@/db/types";

export type InterviewerSeriesInput = {
  title: string;
  subjectName: string;
  subjectRelationship?: string | null;
  goal: string;
  openingPrompt?: string | null;
  dontBringUp: string[];
  tone: SeriesTone;
  sessionMinutes: number;
  /** The interviewer's persona name — comes from the series' chosen voice. */
  interviewerName: string;
  depth: SeriesDepth;
  /** Optional target; null means the series is open-ended. */
  plannedSessions?: number | null;
};

export type InterviewerKnownFact = { topic: string; statement: string };
export type InterviewerTopic = {
  name: string;
  coverageScore: number;
  mustCover: boolean;
  suggested: boolean;
};

export type BuildInterviewerInstructionsInput = {
  series: InterviewerSeriesInput;
  handTheMic: boolean;
  knownFacts: InterviewerKnownFact[];
  topics: InterviewerTopic[];
  retellQueue: string[];
  /** 1-based index of the session being conducted; null if it can't be derived. */
  sessionNumber?: number | null;
};
```

- [ ] **Step 4: Add the depth register beside the tone register**

In the same file, directly after the `TONE_REGISTER` map (ends line 34):

```ts
/**
 * Depth is the one dial that governs question length, follow-up count, and
 * how fast the interviewer moves between topics. It's a single enum rather
 * than three sliders so it can't be set to an incoherent combination ("brief
 * questions, exhaust every thread"). `balanced` reproduces the behavior that
 * was implicit before the dial existed.
 */
const DEPTH_REGISTER: Record<SeriesDepth, string[]> = {
  light: [
    "Keep your questions short and simple — a sentence, not a paragraph.",
    "Ask one or two follow-ups on a thread, then move on. Do not mine a memory to exhaustion.",
    "Prioritize covering ground: it is fine to touch many topics lightly in a single session.",
  ],
  balanced: [
    "Keep your questions conversational — a sentence or two at most.",
    "Ask three or four follow-ups on a thread before considering a new topic.",
    "Favor depth when a story is clearly alive, and move on once it has genuinely run dry.",
  ],
  deep: [
    "Ask rich, specific questions that show you were listening closely.",
    "Stay on a thread until it is genuinely exhausted, even if that means only two or three topics all session.",
    "Push for sensory detail, names, dates, and the feeling in the moment — the specifics are the point.",
  ],
};
```

- [ ] **Step 5: Use the persona name in WHO YOU ARE**

Replace the WHO YOU ARE block (lines 52–60):

```ts
  // ---- WHO YOU ARE ----
  sections.push(
    [
      "WHO YOU ARE",
      `You are ${series.interviewerName}, a warm and skilled voice interviewer conducting a live, recorded ` +
        `oral-history interview for the series "${series.title}". You speak naturally, out loud, in short ` +
        `conversational turns — never in bullet points or numbered lists.`,
    ].join("\n"),
  );
```

- [ ] **Step 6: Add the session-of-N line to THE GOAL**

Replace the THE GOAL block (lines 70–75):

```ts
  // ---- THE GOAL ----
  const goalLines = [`Goal for this series: ${series.goal}`];
  if (series.openingPrompt) {
    goalLines.push(`Opening prompt for this session: "${series.openingPrompt}" — start from there.`);
  }
  // Only pace against a target when we know BOTH where we are and where we're
  // headed. An open-ended series (the default) gets no pacing pressure at all.
  if (series.plannedSessions && input.sessionNumber) {
    goalLines.push(
      `This is session ${input.sessionNumber} of ${series.plannedSessions} planned for this series. Budget ` +
        `your must-cover topics across the sessions that remain. On the final session, aim to close the loop ` +
        `rather than open new threads.`,
    );
  }
  sections.push(["THE GOAL", ...goalLines].join("\n"));
```

- [ ] **Step 7: Add the DEPTH section**

Insert a new section immediately after the STAY ON THE THREAD `sections.push(...)` call (which ends on line 167) and before the STYLE section:

```ts
  // ---- DEPTH ----
  // Sits directly after STAY ON THE THREAD so it reads as a modifier on it:
  // that section says "go deep"; this one says how deep, for THIS series.
  sections.push(
    [
      "DEPTH (how this series wants to be interviewed)",
      ...DEPTH_REGISTER[series.depth].map((line) => `- ${line}`),
      "This dial never overrides NEVER BRING UP. Guardrails always outrank depth.",
    ].join("\n"),
  );
```

- [ ] **Step 8: Update the hand-the-mic style line to use the persona name**

The STYLE block's hand-the-mic line (lines 179–184) already interpolates `series.subjectName` and needs no change. Verify no literal `"Anna"` remains:

Run: `grep -n 'Anna' src/server/ai/interviewer-prompt.ts`
Expected: no output (exit 1). If anything matches, replace it with `${series.interviewerName}`.

- [ ] **Step 9: Run the tests and make sure they pass**

Run: `npx vitest run src/server/ai/__tests__/interviewer-prompt.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m 'feat(prompt): persona name, depth register, and session pacing' && git push
```

---

### Task 5: API validation + write path

**Files:**
- Modify: `src/app/api/series/route.ts:12-27`
- Modify: `src/app/api/series/[id]/route.ts:6-42`
- Modify: `src/server/series/create.ts:7-22` (input type), `:139-156` (insert)
- Test: `src/app/api/series/__tests__/schema.test.ts` (create)

**Interfaces:**
- Consumes: `VOICE_IDS`, `DEFAULT_VOICE`, `DEFAULT_INTERVIEWER_NAME` from `@/lib/voices` (Task 2); `SeriesDepth` from `@/db/types` (Task 1).
- Produces: `createSeriesSchema` exported from `src/app/api/series/route.ts` (it is currently module-private — export it so it can be tested). `CreateSeriesInput` gains `voice: VoiceId`, `interviewerName: string`, `depth: SeriesDepth`, `plannedSessions?: number | null`.

The wizard sends `voice` and `interviewerName` together (the registry is the source of truth at write time), but the server does not trust the client's name: it re-derives it from the voice via `personaFor()`. That keeps a hand-rolled API call from creating a series where the voice and the name disagree.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/series/__tests__/schema.test.ts`:

```ts
import { it, expect } from "vitest";
import { createSeriesSchema } from "../route";

const valid = {
  title: "Dad's Story",
  goal: "Capture his whole life",
  subjectKind: "self" as const,
  subjectName: "Henk",
  mustCover: [],
  dontBringUp: [],
  tone: "warm" as const,
  sessionMinutes: 20 as const,
  access: [],
};

it("defaults voice, name, and depth so old clients keep working", () => {
  const parsed = createSeriesSchema.parse(valid);
  expect(parsed.voice).toBe("marin");
  expect(parsed.interviewerName).toBe("Anna");
  expect(parsed.depth).toBe("balanced");
  expect(parsed.plannedSessions).toBeNull();
});

it("accepts a known voice and depth", () => {
  const parsed = createSeriesSchema.parse({ ...valid, voice: "cedar", depth: "deep", plannedSessions: 6 });
  expect(parsed.voice).toBe("cedar");
  expect(parsed.depth).toBe("deep");
  expect(parsed.plannedSessions).toBe(6);
});

it("rejects an unknown voice", () => {
  expect(createSeriesSchema.safeParse({ ...valid, voice: "scarlett" }).success).toBe(false);
});

it("rejects an out-of-range planned session count", () => {
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 0 }).success).toBe(false);
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 51 }).success).toBe(false);
  expect(createSeriesSchema.safeParse({ ...valid, plannedSessions: 2.5 }).success).toBe(false);
});

it("treats a null planned session count as open-ended", () => {
  expect(createSeriesSchema.parse({ ...valid, plannedSessions: null }).plannedSessions).toBeNull();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/app/api/series/__tests__/schema.test.ts`
Expected: FAIL — `createSeriesSchema` is not exported (`does not provide an export named 'createSeriesSchema'`).

- [ ] **Step 3: Extend and export the create schema**

In `src/app/api/series/route.ts`, add the import and replace the schema (lines 12–27):

```ts
import { VOICE_IDS, DEFAULT_VOICE, DEFAULT_INTERVIEWER_NAME } from "@/lib/voices";

export const createSeriesSchema = z.object({
  title: z.string().trim().min(1, "Give the series a title."),
  goal: z.string().trim().min(1, "Say what the interviewer should learn."),
  subjectKind: z.enum(["member", "self", "person", "organization"]),
  subjectUserId: z.string().uuid().optional(),
  subjectName: z.string().trim().min(1, "This series needs a subject name."),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  mustCover: z.array(z.string().trim().min(1)).default([]),
  dontBringUp: z.array(z.string().trim().min(1)).default([]),
  tone: z.enum(["warm", "neutral", "playful"]),
  sessionMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]),
  voice: z.enum(VOICE_IDS).default(DEFAULT_VOICE),
  // Accepted for symmetry with the wizard's payload, but never trusted —
  // createSeries() re-derives the name from the voice so the two can't disagree.
  interviewerName: z.string().trim().min(1).default(DEFAULT_INTERVIEWER_NAME),
  depth: z.enum(["light", "balanced", "deep"]).default("balanced"),
  plannedSessions: z.number().int().min(1).max(50).nullable().default(null),
  access: z.array(accessEntrySchema).default([]),
  inviteSubjectEmail: z.string().email().optional(),
  questionPlan: z.array(z.string().trim().min(1)).optional(),
});
```

- [ ] **Step 4: Run the schema tests and make sure they pass**

Run: `npx vitest run src/app/api/series/__tests__/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Extend `CreateSeriesInput` and the insert**

In `src/server/series/create.ts`, update the imports (line 4) and the input type (lines 7–22):

```ts
import type { Database, SeriesDepth, SeriesTone, SubjectKind } from "@/db/types";
import { personaFor, DEFAULT_VOICE } from "@/lib/voices";
import { InviteMemberError, inviteMember } from "@/server/members/invite";

export type CreateSeriesInput = {
  title: string;
  goal: string;
  subjectKind: SubjectKind;
  subjectUserId?: string;
  subjectName: string;
  subjectRelationship?: string;
  openingPrompt?: string;
  mustCover: string[];
  dontBringUp: string[];
  tone: SeriesTone;
  sessionMinutes: 10 | 20 | 45;
  voice?: string;
  depth?: SeriesDepth;
  plannedSessions?: number | null;
  access: { userId: string; canView: boolean; canInterview: boolean }[];
  inviteSubjectEmail?: string;
  questionPlan?: string[];
};
```

Then replace the `series` insert (lines 139–156) — note `interviewer_name` is derived from the voice, never taken from the caller:

```ts
  // The persona registry is the source of truth: the name always follows the
  // voice, so a hand-rolled API call can't create a series whose male voice
  // introduces itself as Anna.
  const persona = personaFor(input.voice ?? DEFAULT_VOICE);

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .insert({
      organization_id: orgId,
      title: input.title.trim(),
      subject_kind: input.subjectKind,
      subject_user_id: subjectUserId,
      subject_name: subjectName,
      subject_relationship: input.subjectRelationship?.trim() || null,
      goal: input.goal.trim(),
      opening_prompt: input.openingPrompt?.trim() || null,
      dont_bring_up: input.dontBringUp,
      tone: input.tone,
      session_minutes: input.sessionMinutes,
      voice: persona.id,
      interviewer_name: persona.name,
      depth: input.depth ?? "balanced",
      planned_sessions: input.plannedSessions ?? null,
      created_by: createdBy,
    })
    .select("id")
    .single();
```

- [ ] **Step 6: Extend the PATCH schema**

In `src/app/api/series/[id]/route.ts`, add the import and extend the schema (lines 6–14):

```ts
import { personaFor, VOICE_IDS } from "@/lib/voices";

const updateSeriesSchema = z.object({
  title: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).optional(),
  subjectRelationship: z.string().trim().optional(),
  openingPrompt: z.string().trim().optional(),
  dontBringUp: z.array(z.string().trim().min(1)).optional(),
  tone: z.enum(["warm", "neutral", "playful"]).optional(),
  sessionMinutes: z.union([z.literal(10), z.literal(20), z.literal(45)]).optional(),
  voice: z.enum(VOICE_IDS).optional(),
  depth: z.enum(["light", "balanced", "deep"]).optional(),
  plannedSessions: z.number().int().min(1).max(50).nullable().optional(),
});
```

And extend the update mapping (lines 34–42):

```ts
  const { title, goal, subjectRelationship, openingPrompt, dontBringUp, tone, sessionMinutes, voice, depth, plannedSessions } =
    parsed.data;
  const update: TablesUpdate<"series"> = {};
  if (title !== undefined) update.title = title;
  if (goal !== undefined) update.goal = goal;
  if (subjectRelationship !== undefined) update.subject_relationship = subjectRelationship;
  if (openingPrompt !== undefined) update.opening_prompt = openingPrompt;
  if (dontBringUp !== undefined) update.dont_bring_up = dontBringUp;
  if (tone !== undefined) update.tone = tone;
  if (sessionMinutes !== undefined) update.session_minutes = sessionMinutes;
  // Changing the voice re-derives the name with it — the two never drift apart.
  if (voice !== undefined) {
    const persona = personaFor(voice);
    update.voice = persona.id;
    update.interviewer_name = persona.name;
  }
  if (depth !== undefined) update.depth = depth;
  if (plannedSessions !== undefined) update.planned_sessions = plannedSessions;
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc PASS. Vitest: all tests pass. Task 6's route change hasn't landed, so `realtime-token` still passes the old prompt input shape — if `tsc` errors on `interviewer-prompt`'s now-required `interviewerName`/`depth`, that is expected and Task 6 fixes it; do NOT paper over it here, just proceed to Task 6 and re-run tsc there.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m 'feat(api): validate and persist voice, depth, and planned sessions' && git push
```

---

### Task 6: Realtime token route — use the series' voice

**Files:**
- Modify: `src/app/api/interviews/[id]/realtime-token/route.ts:41-151`

**Interfaces:**
- Consumes: `personaFor` from `@/lib/voices` (Task 2); the extended `buildInterviewerInstructions` input (Task 4); the new series columns (Task 1).
- Produces: nothing new. This is the task that makes the whole feature actually take effect in a live interview.

- [ ] **Step 1: Select the new columns**

In `src/app/api/interviews/[id]/realtime-token/route.ts`, replace the series select (lines 41–47):

```ts
  const { data: series, error: seriesErr } = await svc
    .from("series")
    .select(
      "id, subject_user_id, title, subject_name, subject_relationship, goal, opening_prompt, dont_bring_up, tone, session_minutes, voice, interviewer_name, depth, planned_sessions",
    )
    .eq("id", interview.series_id)
    .maybeSingle();
```

- [ ] **Step 2: Derive the current session number**

Add to the `Promise.all` at line 69 a fourth query, and destructure it. Replace lines 69–88 with:

```ts
  const [topicsRes, activeFactsRes, retellFactsRes, priorRes] = await Promise.all([
    svc
      .from("topics")
      .select("id, name, coverage_score, must_cover, suggested")
      .eq("series_id", series.id)
      .order("coverage_score", { ascending: true }),
    svc
      .from("facts")
      .select("statement, topic_id, created_at")
      .eq("series_id", series.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(KNOWN_FACTS_LIMIT),
    svc
      .from("facts")
      .select("statement, created_at")
      .eq("series_id", series.id)
      .eq("status", "retell_queued")
      .order("created_at", { ascending: false }),
    // Session number, derived the same way `listSeriesSessions` does it
    // (src/db/queries.ts:414): order by started_at, 1-based. Only needed when
    // the series has a planned-session target to pace against — but it's one
    // indexed count, so we always fetch it rather than branch the Promise.all.
    svc
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id)
      .lt("started_at", interview.started_at),
  ]);
  if (topicsRes.error) {
    return NextResponse.json({ error: topicsRes.error.message }, { status: 500 });
  }
  if (activeFactsRes.error) {
    return NextResponse.json({ error: activeFactsRes.error.message }, { status: 500 });
  }
  if (retellFactsRes.error) {
    return NextResponse.json({ error: retellFactsRes.error.message }, { status: 500 });
  }
  // A failed count shouldn't kill the interview — degrade to "unknown session
  // number", which just drops the pacing line from the prompt.
  const sessionNumber = priorRes.error ? null : (priorRes.count ?? 0) + 1;
```

This requires `started_at` on the interview row. Update the interview select (line 31):

```ts
    .select("id, series_id, status, hand_the_mic, organization_id, started_at")
```

- [ ] **Step 3: Pass the new fields into the prompt builder**

Replace the `buildInterviewerInstructions` call (lines 115–130):

```ts
  const persona = personaFor(series.voice);

  const instructions = buildInterviewerInstructions({
    series: {
      title: series.title,
      subjectName: series.subject_name,
      subjectRelationship: series.subject_relationship,
      goal: series.goal,
      openingPrompt: series.opening_prompt,
      dontBringUp,
      tone: series.tone,
      sessionMinutes: series.session_minutes,
      // Prefer the stored name (it's what the series was created with) and
      // fall back to the registry only if the column is somehow empty.
      interviewerName: series.interviewer_name || persona.name,
      depth: series.depth,
      plannedSessions: series.planned_sessions,
    },
    handTheMic: interview.hand_the_mic,
    knownFacts,
    topics,
    retellQueue,
    sessionNumber,
  });
```

- [ ] **Step 4: Use the series' voice instead of the hardcoded one**

Replace the hardcoded output voice (line 148):

```ts
          output: { voice: persona.id },
```

And add the import at the top of the file, after the `openaiClient` import (line 6):

```ts
import { personaFor } from "@/lib/voices";
```

- [ ] **Step 5: Verify nothing hardcodes marin anymore**

Run: `grep -rn '"marin"' src/app src/server`
Expected: no output (exit 1). `marin` should now appear only in `src/lib/voices.ts` and the migration.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both PASS. This is the first point at which the whole server side compiles against the new required prompt fields.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m 'feat(realtime): use the series voice, persona, and session pacing' && git push
```

---

### Task 7: VoicePicker component

**Files:**
- Create: `src/components/series/VoicePicker.tsx`

**Interfaces:**
- Consumes: `VOICES`, `VoiceId` from `@/lib/voices` (Task 2); the sample mp3s (Task 3).
- Produces: `<VoicePicker value={VoiceId} onChange={(id: VoiceId) => void} />`. Owns its own preview `<audio>`; plays one clip at a time.

- [ ] **Step 1: Write the component**

Create `src/components/series/VoicePicker.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { VOICES } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";

/**
 * Picks the interviewer's voice — and with it, their name. One shared <audio>
 * element rather than one per card, so starting a sample always stops the
 * previous one; six clips playing over each other is the obvious failure mode
 * of a grid of independent players.
 *
 * Selecting a card and previewing it are deliberately separate actions: you
 * can listen to all six without committing to any of them.
 */
export function VoicePicker({
  value,
  onChange,
}: {
  value: VoiceId;
  onChange: (id: VoiceId) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<VoiceId | null>(null);

  // Stop the preview if the picker unmounts mid-clip (e.g. the user clicks
  // Back out of the Guide step) — an <audio> element that's been removed from
  // the tree can otherwise keep playing to the end.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  function toggle(id: VoiceId, sample: string) {
    const el = audioRef.current;
    if (!el) return;
    if (playing === id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = sample;
    el.currentTime = 0;
    void el.play().then(
      () => setPlaying(id),
      () => setPlaying(null), // autoplay blocked or the file is missing — fail quiet
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {VOICES.map((v) => {
          const selected = v.id === value;
          const isPlaying = playing === v.id;
          return (
            <div
              key={v.id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onClick={() => onChange(v.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(v.id);
                }
              }}
              className={
                "cursor-pointer rounded-card border px-3.5 py-3 transition-colors " +
                (selected
                  ? "border-green bg-green-tint"
                  : "border-line-strong bg-card hover:border-green")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">{v.name}</span>
                <button
                  type="button"
                  aria-label={isPlaying ? `Stop ${v.name}'s sample` : `Play ${v.name}'s sample`}
                  onClick={(e) => {
                    e.stopPropagation(); // previewing is not picking
                    toggle(v.id, v.sample);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-[11px] text-muted hover:border-green hover:text-green-deep"
                >
                  {isPlaying ? "■" : "▶"}
                </button>
              </div>
              <div className="mt-1 text-xs leading-snug text-muted">{v.blurb}</div>
            </div>
          );
        })}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/series/VoicePicker.tsx`
Expected: both PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m 'feat(ui): add the voice picker with sample previews' && git push
```

---

### Task 8: Wire the Guide step

**Files:**
- Modify: `src/app/app/series/new/Wizard.tsx`
- Modify: `src/app/app/series/new/QuickCreate.tsx:43-54`

**Interfaces:**
- Consumes: `VoicePicker` (Task 7); `VOICES`, `DEFAULT_VOICE`, `personaFor`, `VoiceId` from `@/lib/voices` (Task 2); the extended `createSeriesSchema` (Task 5).
- Produces: nothing downstream.

The wizard's Guide-step copy currently hardcodes "Anna" in three field hints. Those become the selected persona's name, so the wizard stays coherent as the voice changes.

- [ ] **Step 1: Add the imports and the depth options**

In `src/app/app/series/new/Wizard.tsx`, add to the imports (after line 12):

```ts
import type { MemberRole, SeriesDepth, SeriesTone, SubjectKind } from "@/db/types";
import { DEFAULT_VOICE, personaFor } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";
import { VoicePicker } from "@/components/series/VoicePicker";
```

And after `LENGTH_OPTIONS` (ends line 62):

```ts
const DEPTH_OPTIONS: { value: SeriesDepth; label: string }[] = [
  { value: "light", label: "Light touch" },
  { value: "balanced", label: "Balanced" },
  { value: "deep", label: "Go deep" },
];

const DEPTH_LABELS: Record<SeriesDepth, string> = {
  light: "Light touch",
  balanced: "Balanced",
  deep: "Go deep",
};
```

- [ ] **Step 2: Add the state**

In the Step 3 state block (after line 144, `const [sessionMinutes, ...]`):

```ts
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [depth, setDepth] = useState<SeriesDepth>("balanced");
  const [plannedSessions, setPlannedSessions] = useState<string>("");
```

`plannedSessions` is held as a string so the field can be genuinely empty (open-ended) rather than snapping to 0 — it is parsed once, at submit.

Then, just below the `pickedMember` derivation (after line 158), add:

```ts
  // The persona is derived, never stored separately — the name always follows
  // the voice, and the Guide copy reads back whichever one is selected.
  const persona = personaFor(voice);
```

- [ ] **Step 3: Render the new controls in Step 3**

Replace the whole Step 3 block (lines 516–558):

```tsx
        {step === 3 && (
          <div>
            <Field label="Who should do the interviewing?" hint="Pick a voice — the name comes with it. Press ▶ to hear each one.">
              <VoicePicker value={voice} onChange={setVoice} />
            </Field>

            <Field label="Opening prompt" hint={`How ${persona.name} should open the very first session.`}>
              <input
                className={inputClasses}
                value={openingPrompt}
                onChange={(e) => setOpeningPrompt(e.target.value)}
                placeholder="Start warm — ask about the easy stuff before the hard stories."
              />
            </Field>

            <Field label={`Topics ${persona.name} must cover`}>
              <ChipEditor items={mustCover} onChange={setMustCover} placeholder="＋ Add a topic" />
            </Field>

            <Field label="Don't bring up">
              <ChipEditor items={dontBringUp} onChange={setDontBringUp} placeholder="＋ Add" tone="amber" />
              <div className="mt-[5px] text-xs text-faint">
                {persona.name} will never raise these; if they come up she&apos;ll listen, then gently move on.
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tone">
                <Segmented name="tone" options={TONE_OPTIONS} value={tone} onChange={(v) => setTone(v as SeriesTone)} />
              </Field>
              <Field label="Session length">
                <Segmented
                  name="session-length"
                  options={LENGTH_OPTIONS}
                  value={String(sessionMinutes)}
                  onChange={(v) => setSessionMinutes(Number(v) as 10 | 20 | 45)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Depth" hint="How long the questions run, and how hard each thread gets mined.">
                <Segmented
                  name="depth"
                  options={DEPTH_OPTIONS}
                  value={depth}
                  onChange={(v) => setDepth(v as SeriesDepth)}
                />
              </Field>
              <Field label="Planned sessions (optional)" hint="Leave blank for open-ended. Setting it lets the interviewer pace the topics.">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={`${inputClasses} max-w-[140px]`}
                  value={plannedSessions}
                  onChange={(e) => setPlannedSessions(e.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>

            <WizardActions onBack={() => setStep(2)}>
              <Button type="button" variant="primary" onClick={() => setStep(4)}>
                Continue
              </Button>
            </WizardActions>
          </div>
        )}
```

Note the third hint keeps "she'll" — every persona in the registry that the copy could name is referred to neutrally elsewhere, but this one line reads awkwardly for Gil/Ellis/Reese. Rewrite it to avoid the pronoun entirely:

```tsx
                {persona.name} will never raise these — if they come up, the answer gets heard, then the
                conversation moves gently on.
```

- [ ] **Step 4: Add the fields to the payload**

In `buildPayload()` (lines 247–269), add after `sessionMinutes,`:

```ts
      sessionMinutes,
      voice,
      interviewerName: persona.name,
      depth,
      plannedSessions: plannedSessions.trim() ? Number(plannedSessions) : null,
```

- [ ] **Step 5: Show them in the Review summary**

Replace the Guide `<KV>` block (lines 633–638):

```tsx
              <KV k="Guide" edit={() => setStep(3)}>
                {persona.name} · {TONE_LABELS[tone]} tone · {DEPTH_LABELS[depth]}
                <br />
                {sessionMinutes}-minute sessions ·{" "}
                {plannedSessions.trim() ? `${plannedSessions.trim()} planned` : "open-ended"}
                <br />
                {mustCover.length} must-cover topic{mustCover.length === 1 ? "" : "s"} · {dontBringUp.length} thing
                {dontBringUp.length === 1 ? "" : "s"} {persona.name} won&apos;t raise
              </KV>
```

- [ ] **Step 6: Use the persona name in the Step 4 copy**

Replace the drafted-session paragraph (lines 564–568):

```tsx
                <h3 className="serif text-[18px]">{persona.name} drafted the first session</h3>
                <p className="mt-1 text-[13px] text-muted">
                  Reorder, edit, or remove anything — this is a starting point. {persona.name} improvises follow-ups
                  from whatever {subjectName || "they"} say.
                </p>
```

- [ ] **Step 7: Send defaults from QuickCreate**

In `src/app/app/series/new/QuickCreate.tsx`, add to the payload (after `sessionMinutes: 20,`, line 52):

```ts
      tone: "warm",
      sessionMinutes: 20,
      voice: DEFAULT_VOICE,
      interviewerName: DEFAULT_INTERVIEWER_NAME,
      depth: "balanced",
      plannedSessions: null,
      access: [],
```

And the import (after line 11):

```ts
import { DEFAULT_INTERVIEWER_NAME, DEFAULT_VOICE } from "@/lib/voices";
```

(The schema defaults these anyway — sending them explicitly keeps QuickCreate's payload readable as the full contract rather than relying on server-side defaulting.)

- [ ] **Step 8: Verify no stray hardcoded Anna in the Guide step**

Run: `grep -n 'Anna' src/app/app/series/new/Wizard.tsx`
Expected: exactly two matches, both on the Basics step and both fine to leave — line ~48 (`DEFAULT_GOAL_PLACEHOLDER`) and line ~422 (`"What do you want Anna to learn?"`). If any match falls inside the Step 3 or Step 4 blocks, replace it with `{persona.name}`.

Note: those two Basics-step strings mention Anna before the voice has been chosen (the picker lives on Step 3). That is a deliberate accepted wart — rewording them to be persona-neutral is a copy change, out of scope here. Flag it to the user at the end rather than fixing it silently.

- [ ] **Step 9: Typecheck, lint, and run the full suite**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m 'feat(wizard): voice picker, depth dial, and planned sessions in the Guide step' && git push
```

---

### Task 9: Show session progress on the series page

**Files:**
- Modify: `src/app/app/series/[id]/page.tsx:158-164`

**Interfaces:**
- Consumes: `series.planned_sessions` (Task 1). The page's series query uses `select("*")` (`src/db/queries.ts:125,133`), so the field is already on the object with no query change.
- Produces: nothing.

- [ ] **Step 1: Show "N of M" when a target is set**

Replace the Sessions card header (lines 158–164):

```tsx
          <Card className="px-[22px] py-5">
            <div className="flex items-center justify-between">
              <h3>Sessions</h3>
              <span className="text-[12.5px] text-faint">
                {series.planned_sessions
                  ? `${sessions.length} of ${series.planned_sessions} planned`
                  : sessions.length === 0
                    ? "none yet"
                    : `${sessions.length} so far`}
              </span>
            </div>
```

The count is deliberately not clamped: a series that runs past its target reads "7 of 6 planned", which is the honest thing to show — the target paces the interviewer, it does not cap the series.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If `series` is not the variable name in scope on that page, use whatever the surrounding JSX already reads fields off — check line 100-155 for the actual binding before editing.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m 'feat(series): show session progress against the planned target' && git push
```

---

### Task 10: End-to-end verification

**Files:** none — this task changes nothing. It is the gate that proves the feature works, and it covers the one thing unit tests cannot: that the voice you pick is the voice you hear.

- [ ] **Step 1: Clear the build cache and start the dev server**

Run: `rm -rf .next && npm run dev`
Expected: server up on http://localhost:3000 with no build errors.

- [ ] **Step 2: Create a series with a non-default voice**

In the browser, go to `/app/series/new`. Fill in Basics, skip Assign, and on Guide:
- Pick **Gil** (`echo`) — deliberately not the default, and a clearly different voice from Anna.
- Press ▶ on two or three cards. Expected: one clip at a time; starting a second stops the first.
- Set Depth to **Go deep**.
- Set Planned sessions to **3**.

Expected on Review: the Guide summary reads `Gil · Warm tone · Go deep` / `20-minute sessions · 3 planned`, and the heading reads "Gil drafted the first session".

- [ ] **Step 3: Confirm what was persisted**

Via the Supabase MCP `execute_sql` tool:

```sql
select title, voice, interviewer_name, depth, planned_sessions
from series order by created_at desc limit 1;
```

Expected: `echo` / `Gil` / `deep` / `3`.

- [ ] **Step 4: Start the interview and listen**

Click "Create & start first interview". When the session connects:
- Expected: the voice is **Gil**, not Anna — audibly the voice sampled in Step 2.
- Expected: the interviewer introduces itself as Gil if it says a name at all.
- Expected: questions run long and stay on one thread (that's `deep`).

This is the check the whole feature rests on. If the voice is still Anna, the token route is not reading the column — re-check Task 6 Step 4.

- [ ] **Step 5: Confirm the prompt the model actually received**

Add a temporary `console.log(instructions)` at `src/app/api/interviews/[id]/realtime-token/route.ts` just before the `try {` block, reload the interview page, and read the dev-server output.

Expected: `WHO YOU ARE / You are Gil,`, a `DEPTH (how this series wants to be interviewed)` section carrying the three `deep` lines, and `This is session 1 of 3 planned for this series.` in THE GOAL.

**Remove the `console.log` before committing** — it dumps the full knowledge base to the server log on every reconnect.

- [ ] **Step 6: Confirm an existing series is untouched**

Open a series created before this work and start an interview.
Expected: the voice is Anna, the prompt says `You are Anna,`, there is no `This is session` line, and the DEPTH section carries the `balanced` lines. This proves the defaults reproduce prior behavior.

- [ ] **Step 7: Full suite, clean build, commit**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`
Expected: all PASS.

```bash
git add -A && git commit -m 'chore: verify voice, depth, and planned-session flow end to end' && git push
```

---

## Self-Review Notes

Checked against the spec:

- **Voice + persona registry** → Task 2. **Sample clips** → Task 3. **Picker UI** → Task 7, wired in Task 8.
- **Depth dial → prompt** → Task 4 (`DEPTH_REGISTER`), UI in Task 8. All three of the user's original asks (question length, follow-up count, pacing) are folded into the three `DEPTH_REGISTER` lines per value, as the spec specifies.
- **Planned sessions** → column in Task 1, prompt line in Task 4, session-number derivation in Task 6, UI input in Task 8, progress display in Task 9.
- **Data model** → Task 1, matching the spec's SQL exactly.
- **Every spec touch-point row** has a task: `voices.ts` (2), generator + mp3s (3), `VoicePicker` (7), `types.ts` (1), both zod schemas (5), `create.ts` (5), realtime-token (6), `interviewer-prompt.ts` (4), `Wizard.tsx` (8), `QuickCreate.tsx` (8), series page (9).
- **Spec's testing section** → Task 4 (prompt units), Task 5 (zod units), Task 1 Step 3 (migration read-back), Task 10 (manual voice check).

Type consistency: `personaFor()`, `VOICE_IDS`, `DEFAULT_VOICE`, `DEFAULT_INTERVIEWER_NAME` are named identically in Tasks 2, 5, 6, 7, and 8. `SeriesDepth` is defined in Task 1 and consumed in 4, 5, 8. `plannedSessions` (camel, API/TS) vs `planned_sessions` (snake, DB) is used consistently on the correct side of each boundary.

One deliberate wart, flagged rather than fixed: the Basics step and QuickCreate still say "Anna" in copy shown before a voice is picked (Task 8, Step 8). Out of scope; raise with the user.
