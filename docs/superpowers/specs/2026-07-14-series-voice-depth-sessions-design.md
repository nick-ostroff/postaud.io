# Series wizard: voice, depth, and planned sessions

**Date:** 2026-07-14
**Status:** Approved, ready for implementation plan

## Problem

The New Series wizard's Guide step exposes only opening prompt, must-cover topics, don't-bring-up topics, tone, and session length. Three things a series owner wants to control are missing:

1. **Who they're talking to.** The interviewer voice is hardcoded to OpenAI's `marin` at `src/app/api/interviews/[id]/realtime-token/route.ts:148`. Every series gets the same voice and the same name ("Anna"), with no way to preview or change either.
2. **How deep the questions go.** Nothing steers question length, number of follow-ups per thread, or how fast the interviewer moves between topics.
3. **How much runway there is.** Sessions are open-ended. The interviewer has no sense of "this is session 2 of 6, budget accordingly."

All three are additive to the existing model. No behavior changes for existing series.

## Non-goals

- Replacing OpenAI Realtime with ElevenLabs. Realtime cannot use third-party voices; swapping would mean re-architecting the live session as STT → LLM → TTS, adding latency and a new API key. Not worth it for voice variety.
- Hard-enforcing question length or turn count. A live model can only be steered by its system prompt. These are prompt-level directives, not runtime constraints — same as the existing `session_minutes`, which is prompt text and not a timer.
- Hard-capping the number of sessions. `planned_sessions` is a target, not a gate.
- Scheduling or calendaring sessions.

## Design

### 1. Interviewer voice + persona

Six OpenAI Realtime voices ship as fixed personas. Choosing a voice chooses its name and character — there is no separate name field, so a male voice can never end up called "Anna."

Persona registry lives in a new `src/lib/voices.ts` (client-safe, imported by both the wizard and the prompt builder):

```ts
export type VoiceId = "marin" | "cedar" | "sage" | "coral" | "echo" | "alloy";

export type VoicePersona = {
  id: VoiceId;          // OpenAI Realtime voice id
  name: string;         // interviewer's name, e.g. "Anna"
  blurb: string;        // one line of character, shown in the picker
  sample: string;       // /voices/<id>.mp3
};

export const VOICES: VoicePersona[] = [ /* the six below */ ];
export const DEFAULT_VOICE: VoiceId = "marin"; // Anna — preserves current behavior
```

The six personas:

| Voice id | Name | Blurb |
|---|---|---|
| `marin` (default) | Anna | Warm and unhurried. Lets a silence sit. |
| `cedar` | Ellis | Dry and curious. Asks the question you were avoiding. |
| `sage` | Nora | Calm and precise. Good with hard subjects. |
| `coral` | Vivian | Bright and quick. Keeps a conversation moving. |
| `echo` | Gil | Steady and plain-spoken. No performance. |
| `alloy` | Reese | Neutral and easy. Gets out of the way. |

`marin` must remain "Anna" so existing series are unchanged. Blurb copy may be tuned once the samples are generated and heard, but the id-to-name mapping is fixed by this table.

**Sample clips.** OpenAI does not serve preview clips for Realtime voices. A one-off script (`scripts/generate-voice-samples.ts`, run manually, not part of the build) calls the OpenAI TTS API once per voice with a fixed script — an interviewer-flavored line such as *"Tell me about the house you grew up in. Start anywhere — the front door, a smell, a room."* — and writes `public/voices/<id>.mp3`. The mp3s are committed. Previews are therefore static assets with zero runtime API cost.

**Picker UI.** A card grid in Guide, each card showing the persona name, blurb, and a play/pause button driving a single shared `<Audio>` element (one clip at a time; selecting a new sample stops the previous). New component `src/components/series/VoicePicker.tsx`. The only prior-art playback pattern in the app is the raw `<audio controls>` at `src/app/app/memories/[factId]/page.tsx:49`; this is a custom control, not that.

### 2. Depth

One enum, `series_depth`, with three values. It expands in the system prompt into rules covering question length, follow-ups per thread, and topic pacing together — rather than three independent sliders that could be set to contradictory combinations ("brief questions, exhaust every thread").

| Value | Prompt directives |
|---|---|
| `light` | Short, simple questions. One or two follow-ups per thread, then move on. Prioritize covering ground over exhausting any single story. |
| `balanced` (default) | Current behavior. Three or four follow-ups per thread before moving on. Depth over coverage when a story is alive. |
| `deep` | Richer, more specific questions. Stay on a thread until it is genuinely exhausted, even if that means only two or three topics in a session. Ask for sensory detail and specifics. |

`balanced` reproduces today's prompt behavior, so defaulting existing series to it is a no-op.

Rendered as a new `DEPTH` section in `buildInterviewerInstructions()`, adjacent to the existing STAY ON THE THREAD section at `src/server/ai/interviewer-prompt.ts:143`.

### 3. Planned sessions

`planned_sessions int null`. Blank means open-ended, which is the current and default behavior.

When set, and when the current session number is known, the prompt gains a line in the GOAL section:

> This is session {n} of {planned}. Budget your must-cover topics across the sessions that remain. On the final session, aim to close the loop rather than open new threads.

Session number is already derived (`sessionNumber: idx + 1` at `src/db/queries.ts:414`) by ordering the series' interviews by `started_at`; the realtime-token route computes the same way for the current interview. Nothing blocks starting a session beyond the target — the series page simply shows "Session 7 of 6" and the prompt line reads naturally past the target ("aim to close the loop").

The series page shows "Session {n} of {planned}" where the session number is displayed today.

### 4. Existing `goal` field

Unchanged, and stays on the Basics step. It answers "what is this series for." The Depth dial is the depth control; `goal` is not overloaded to carry it.

## Data model

One migration, `supabase/migrations/0011_series_voice_depth.sql`:

```sql
create type series_depth as enum ('light', 'balanced', 'deep');

alter table series
  add column voice            text            not null default 'marin',
  add column interviewer_name text            not null default 'Anna',
  add column depth            series_depth    not null default 'balanced',
  add column planned_sessions int             null check (planned_sessions between 1 and 50);
```

`voice` and `interviewer_name` are both persisted rather than deriving the name from the voice id at read time. The persona registry is the source of truth at write time (the wizard sends both), but storing the name means a series' interviewer keeps its identity even if the registry copy is later edited or a voice is retired.

`voice` is `text`, not an enum, so adding a voice does not require a migration. Validation is a zod enum over `VoiceId` at the API boundary.

Defaults reproduce current behavior exactly, so the migration needs no backfill.

## Touch points

| File | Change |
|---|---|
| `supabase/migrations/0011_series_voice_depth.sql` | new — the migration above |
| `src/lib/voices.ts` | new — persona registry, `VoiceId`, `DEFAULT_VOICE` |
| `scripts/generate-voice-samples.ts` | new — one-off TTS sample generator |
| `public/voices/*.mp3` | new — six committed sample clips |
| `src/components/series/VoicePicker.tsx` | new — card grid + shared audio preview |
| `src/db/types.ts` | `series` Row/Insert/Update (lines 160–211); add `SeriesDepth` union |
| `src/app/api/series/route.ts` | `createSeriesSchema` — add `voice`, `interviewerName`, `depth`, `plannedSessions` |
| `src/app/api/series/[id]/route.ts` | patch schema — same four fields, all optional |
| `src/server/series/create.ts` | insert the four columns (around line 141–154) |
| `src/app/api/interviews/[id]/realtime-token/route.ts` | select the new columns; replace hardcoded `voice: "marin"` at line 148; compute current session number and pass to the prompt builder |
| `src/server/ai/interviewer-prompt.ts` | `InterviewerSeriesInput` gains `interviewerName`, `depth`, `plannedSessions`, `sessionNumber`; WHO YOU ARE uses the persona name instead of hardcoded "Anna"; new DEPTH section; session-of-N line in GOAL |
| `src/app/app/series/new/Wizard.tsx` | Guide step (lines 516–558) — voice picker, depth segmented control, planned-sessions input; add to state + `buildPayload()` |
| `src/app/app/series/new/QuickCreate.tsx` | send defaults (`marin` / `Anna` / `balanced` / null) alongside its existing hardcoded tone + session length |
| `src/app/app/series/[id]/page.tsx` | show "Session {n} of {planned}" when `planned_sessions` is set |

The wizard's Guide-step copy currently hardcodes "Anna" in field hints ("How Anna should open the very first session", "Topics Anna must cover", "Anna will never raise these…"). These become interpolated from the selected persona so the wizard stays coherent as the voice changes.

## Testing

- **Unit, `interviewer-prompt.ts`** (existing test patterns apply): each depth value produces its distinct directives; persona name appears in place of "Anna"; the session-of-N line appears only when `plannedSessions` is set and is absent when null.
- **Unit, zod schemas**: an unknown voice id is rejected; `plannedSessions` accepts null and rejects 0 / 51.
- **Migration**: an existing series row reads back as `marin` / `Anna` / `balanced` / `null` — i.e. current behavior.
- **Manual**: create a series with a non-default voice, start an interview, confirm the voice heard matches the pick and the interviewer introduces itself by the persona name. This is the one thing unit tests cannot cover.

## Risks

- **Sample clips drift from the live voice.** The TTS API and the Realtime API use the same voice ids, but the delivery is not guaranteed identical. Mitigation: samples are illustrative of character, not a contract; the persona blurb carries the expectation.
- **Prompt bloat.** The instructions are rebuilt on every token mint and already run long. The depth section is a few lines; acceptable, but worth watching if more prompt sections accumulate.
