"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChipEditor } from "@/app/app/series/new/formkit";
import { VoicePicker } from "@/components/series/VoicePicker";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, inputClasses } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import type { ConversationMode, SeriesTone } from "@/db/types";
import { personaFor } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";

const TONE_OPTIONS: { value: SeriesTone; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "playful", label: "Playful" },
];

const LENGTH_OPTIONS = [
  { value: "10", label: "10 min" },
  { value: "20", label: "20 min" },
  { value: "45", label: "45 min" },
];

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

/**
 * The guide-rail settings on the series settings page: voice, opening prompt,
 * don't-bring-up, tone, session length, conversation mode,
 * planned sessions. Saves only
 * what changed via PATCH /api/series/[id]; picking a new voice also renames
 * the interviewer server-side (the persona name travels with the voice).
 * Must-cover topics are absent on purpose — they live in the topic queue on
 * the series page.
 */
export function InterviewGuideForm({
  seriesId,
  initialVoice,
  initialOpeningPrompt,
  initialDontBringUp,
  initialTone,
  initialSessionMinutes,
  initialConversationMode,
  initialQuickfireQueueOnly,
  initialPlannedSessions,
}: {
  seriesId: string;
  initialVoice: VoiceId;
  initialOpeningPrompt: string;
  initialDontBringUp: string[];
  initialTone: SeriesTone;
  initialSessionMinutes: 10 | 20 | 45;
  initialConversationMode: ConversationMode;
  initialQuickfireQueueOnly: boolean;
  initialPlannedSessions: number | null;
}) {
  const router = useRouter();
  const [voice, setVoice] = useState<VoiceId>(initialVoice);
  const [openingPrompt, setOpeningPrompt] = useState(initialOpeningPrompt);
  const [dontBringUp, setDontBringUp] = useState<string[]>(initialDontBringUp);
  const [tone, setTone] = useState<SeriesTone>(initialTone);
  const [sessionMinutes, setSessionMinutes] = useState<10 | 20 | 45>(initialSessionMinutes);
  const [conversationMode, setConversationMode] = useState<ConversationMode>(initialConversationMode);
  const [quickfireQueueOnly, setQuickfireQueueOnly] = useState(initialQuickfireQueueOnly);
  const [plannedSessions, setPlannedSessions] = useState(initialPlannedSessions == null ? "" : String(initialPlannedSessions));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persona = personaFor(voice);
  const chipsChanged = JSON.stringify(dontBringUp) !== JSON.stringify(initialDontBringUp);
  const plannedParsed = plannedSessions.trim() === "" ? null : Number(plannedSessions);
  const plannedValid = plannedParsed == null || (Number.isInteger(plannedParsed) && plannedParsed >= 1 && plannedParsed <= 50);
  const plannedChanged = plannedParsed !== initialPlannedSessions;

  const dirty =
    voice !== initialVoice ||
    openingPrompt.trim() !== initialOpeningPrompt ||
    chipsChanged ||
    tone !== initialTone ||
    sessionMinutes !== initialSessionMinutes ||
    conversationMode !== initialConversationMode ||
    quickfireQueueOnly !== initialQuickfireQueueOnly ||
    plannedChanged;

  async function save() {
    const patch: Record<string, unknown> = {};
    if (voice !== initialVoice) patch.voice = voice;
    if (openingPrompt.trim() !== initialOpeningPrompt) patch.openingPrompt = openingPrompt.trim();
    if (chipsChanged) patch.dontBringUp = dontBringUp;
    if (tone !== initialTone) patch.tone = tone;
    if (sessionMinutes !== initialSessionMinutes) patch.sessionMinutes = sessionMinutes;
    if (conversationMode !== initialConversationMode) patch.conversationMode = conversationMode;
    if (quickfireQueueOnly !== initialQuickfireQueueOnly) patch.quickfireQueueOnly = quickfireQueueOnly;
    if (plannedChanged) patch.plannedSessions = plannedParsed;
    if (Object.keys(patch).length === 0 || !plannedValid) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setError("Couldn't save — try again.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  function touch() {
    setSaved(false);
  }

  return (
    <div className="mt-3">
      <Field label="Interviewer" hint="Pick a voice — the name comes with it. Changes apply from the next session.">
        <VoicePicker
          value={voice}
          onChange={(id) => {
            setVoice(id);
            touch();
          }}
        />
      </Field>

      <div className="max-w-3xl">
        <Field label="Opening prompt" hint={`How ${persona.name} should open the next session.`}>
          <Input
            value={openingPrompt}
            onChange={(e) => {
              setOpeningPrompt(e.target.value);
              touch();
            }}
            placeholder="Start warm — ask about the easy stuff before the hard stories."
            disabled={busy}
          />
        </Field>

        <Field
          label="Don't bring up"
          hint={`${persona.name} will never raise these — if they come up, the answer gets heard, then the conversation moves gently on.`}
        >
          <ChipEditor
            items={dontBringUp}
            onChange={(next) => {
              setDontBringUp(next);
              touch();
            }}
            placeholder="＋ Add"
            tone="amber"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Tone">
          <Segmented
            name="tone"
            options={TONE_OPTIONS}
            value={tone}
            onChange={(v) => {
              setTone(v as SeriesTone);
              touch();
            }}
          />
        </Field>
        <Field label="Session length">
          <Segmented
            name="session-length"
            options={LENGTH_OPTIONS}
            value={String(sessionMinutes)}
            onChange={(v) => {
              setSessionMinutes(Number(v) as 10 | 20 | 45);
              touch();
            }}
          />
        </Field>
        {/* Three options make this the widest dial — full row so it never
            collides with its neighbor. */}
        <div className="sm:col-span-2">
          <Field label="Conversation mode" hint={MODE_HINTS[conversationMode]}>
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
              <div className="min-w-0 flex-1">
                <div className="text-[14px]">Just my questions</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  Quick fire asks only your queue, then wraps up — no topic fallback.
                </div>
              </div>
              <ToggleSwitch
                checked={quickfireQueueOnly}
                onToggle={() => {
                  setQuickfireQueueOnly((v) => !v);
                  touch();
                }}
              />
            </div>
          </Field>
        </div>
        <Field label="Planned sessions" hint="Leave blank for open-ended — setting it lets the interviewer pace the topics.">
          <input
            type="number"
            min={1}
            max={50}
            className={`${inputClasses} max-w-[140px]`}
            value={plannedSessions}
            onChange={(e) => {
              setPlannedSessions(e.target.value);
              touch();
            }}
            placeholder="—"
            disabled={busy}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={busy || !dirty || !plannedValid}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {!plannedValid && <span className="text-[12.5px] font-medium text-amber">Planned sessions must be 1–50.</span>}
        {saved && !dirty && <span className="text-[12.5px] font-medium text-green-deep">Saved</span>}
        {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
      </div>
    </div>
  );
}

/** The pill switch used by the mode card's boolean rows. */
function ToggleSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-green-deep" : "bg-ink/20"
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${
          checked ? "right-[3px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
