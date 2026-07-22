"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChipEditor } from "@/app/app/series/new/formkit";
import { VoicePicker } from "@/components/series/VoicePicker";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, inputClasses } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import type { ConversationMode } from "@/db/types";
import { personaFor } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";

const LENGTH_OPTIONS = [
  { value: "10", label: "10 min" },
  { value: "20", label: "20 min" },
  { value: "45", label: "45 min" },
  { value: "unlimited", label: "Unlimited" },
];

const MODE_OPTIONS: { value: ConversationMode; label: string }[] = [
  { value: "flow", label: "Flow" },
  { value: "quickfire", label: "Quick fire" },
];

const MODE_HINTS: Record<string, string> = {
  flow: "Answer, then choose where to go next. Save follow-ups for later.",
  quickfire: "One question after another from your queue and topics.",
};

/**
 * The guide-rail settings on the series settings page: voice, opening prompt,
 * don't-bring-up, conversation type (Flow/Quick fire), total conversation
 * length (across ALL sessions; unlimited = no clock), and total sessions
 * (blank = unlimited). Saves only what changed via PATCH /api/series/[id];
 * picking a new voice also renames the interviewer server-side (the persona
 * name travels with the voice). Must-cover topics are absent on purpose —
 * they live in the topic queue on the series page.
 */
export function InterviewGuideForm({
  seriesId,
  initialVoice,
  initialOpeningPrompt,
  initialDontBringUp,
  initialTotalMinutes,
  initialConversationMode,
  initialPlannedSessions,
}: {
  seriesId: string;
  initialVoice: VoiceId;
  initialOpeningPrompt: string;
  initialDontBringUp: string[];
  initialTotalMinutes: number | null;
  initialConversationMode: ConversationMode;
  initialPlannedSessions: number | null;
}) {
  const router = useRouter();
  const [voice, setVoice] = useState<VoiceId>(initialVoice);
  const [openingPrompt, setOpeningPrompt] = useState(initialOpeningPrompt);
  const [dontBringUp, setDontBringUp] = useState<string[]>(initialDontBringUp);
  const [totalMinutes, setTotalMinutes] = useState<number | null>(initialTotalMinutes);
  const [conversationMode, setConversationMode] = useState<ConversationMode>(initialConversationMode);
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
    totalMinutes !== initialTotalMinutes ||
    conversationMode !== initialConversationMode ||
    plannedChanged;

  async function save() {
    const patch: Record<string, unknown> = {};
    if (voice !== initialVoice) patch.voice = voice;
    if (openingPrompt.trim() !== initialOpeningPrompt) patch.openingPrompt = openingPrompt.trim();
    if (chipsChanged) patch.dontBringUp = dontBringUp;
    if (totalMinutes !== initialTotalMinutes) patch.totalMinutes = totalMinutes;
    if (conversationMode !== initialConversationMode) patch.conversationMode = conversationMode;
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
        <Field label="Conversation type" hint={MODE_HINTS[conversationMode] ?? MODE_HINTS.flow}>
          <Segmented
            name="conversation-mode"
            options={MODE_OPTIONS}
            value={conversationMode === "deep" ? "flow" : conversationMode}
            onChange={(v) => {
              setConversationMode(v as ConversationMode);
              touch();
            }}
          />
        </Field>
        <Field
          label="Total conversation length"
          hint="Total talk time across every session — the series wraps up once it's used."
        >
          <Segmented
            name="total-minutes"
            options={LENGTH_OPTIONS}
            value={totalMinutes == null ? "unlimited" : String(totalMinutes)}
            onChange={(v) => {
              setTotalMinutes(v === "unlimited" ? null : Number(v));
              touch();
            }}
          />
        </Field>
        <Field label="Total sessions" hint="Leave blank for unlimited — the series ends after the last one.">
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
            placeholder="∞"
            disabled={busy}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={busy || !dirty || !plannedValid}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {!plannedValid && <span className="text-[12.5px] font-medium text-amber">Total sessions must be 1–50.</span>}
        {saved && !dirty && <span className="text-[12.5px] font-medium text-green-deep">Saved</span>}
        {error && <span className="text-[12.5px] font-medium text-amber">{error}</span>}
      </div>
    </div>
  );
}
