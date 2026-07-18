"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";
import { Segmented } from "@/components/ui/Segmented";
import type { MemberRole, SeriesDepth, SeriesTone, SubjectKind } from "@/db/types";
import { DEFAULT_VOICE, personaFor } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";
import { VoicePicker } from "@/components/series/VoicePicker";
import { ChipEditor, RadioCard, StepsIndicator, WizardField, inputClasses, textareaClasses } from "./formkit";
import type { MemberOption } from "./formkit";

type AccessLevel = "view" | "interview" | "none";
type SubjectChoice = "self" | "new" | `member:${string}`;

const TEMPLATES = [
  {
    id: "life_story",
    label: "Life story",
    description: "A whole life, told over many sessions — childhood to now.",
    goalPlaceholder:
      "Capture their whole life for the family who'll want to know it — childhood, work, the turning points.",
    mustCover: ["Childhood", "Family & how they met", "Work life", "A turning point"],
  },
  {
    id: "recipes",
    label: "Family recipes & traditions",
    description: "The dishes, the rituals, and the stories behind them.",
    goalPlaceholder:
      "Capture the recipes and the stories behind them — who taught them, what the kitchen was like.",
    mustCover: ["A signature dish", "Who taught them to cook", "Holiday traditions", "The kitchen growing up"],
  },
  {
    id: "company",
    label: "Company history",
    description: "How the business was really built — for founders and teams.",
    goalPlaceholder:
      "Capture how the business was really built — the early days, the hard calls, what they'd do differently.",
    mustCover: ["The founding story", "The hardest year", "A pivotal decision", "What they're proudest of"],
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

const DEFAULT_GOAL_PLACEHOLDER = "A sentence or two is plenty — this shapes every question Anna asks.";

const TONE_OPTIONS: { value: SeriesTone; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "playful", label: "Playful" },
];

const TONE_LABELS: Record<SeriesTone, string> = { warm: "Warm", neutral: "Neutral", playful: "Playful" };

const LENGTH_OPTIONS = [
  { value: "10", label: "10 min" },
  { value: "20", label: "20 min" },
  { value: "45", label: "45 min" },
];

const DEPTH_OPTIONS: { value: SeriesDepth; label: string }[] = [
  { value: "single", label: "Single Q&A" },
  { value: "light", label: "Light touch" },
  { value: "balanced", label: "Balanced" },
  { value: "deep", label: "Go deep" },
];

const DEPTH_LABELS: Record<SeriesDepth, string> = {
  single: "Single Q&A",
  light: "Light touch",
  balanced: "Balanced",
  deep: "Go deep",
};

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  already_member: "Already a member of this workspace.",
  in_other_workspace: "That email already belongs to another postaud.io workspace.",
};

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function WizardActions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
      ) : (
        <span />
      )}
      <div className="ml-auto flex items-center gap-2.5">{children}</div>
    </div>
  );
}

function KV({ k, edit, children }: { k: string; edit?: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-line py-2.5 last:border-b-0">
      <div className="mb-0.5 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        <span>{k}</span>
        {edit && (
          <button
            type="button"
            onClick={edit}
            className="text-[11px] font-semibold normal-case tracking-normal text-green-deep hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      <div className="text-[13px] leading-snug text-ink-soft">{children}</div>
    </div>
  );
}

export function Wizard({
  members: initialMembers,
  viewer,
}: {
  members: MemberOption[];
  viewer: { userId: string; name: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — Basics
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [title, setTitle] = useState("");
  const [subjectChoice, setSubjectChoice] = useState<SubjectChoice>("self");
  const [subjectKindNew, setSubjectKindNew] = useState<"person" | "organization">("person");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [inviteSubjectEmail, setInviteSubjectEmail] = useState("");
  const [subjectRelationship, setSubjectRelationship] = useState("");
  const [goal, setGoal] = useState("");
  const [goalPlaceholder, setGoalPlaceholder] = useState(DEFAULT_GOAL_PLACEHOLDER);

  // Photo (optional) — cropped client-side, held as a webp Blob and uploaded
  // to the new series right after it's created (the row must exist first).
  const photoInput = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null); // pending crop
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null); // cropped, ready to upload
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Step 2 — Assign
  const [members, setMembers] = useState<MemberOption[]>(initialMembers);
  const [access, setAccess] = useState<Record<string, AccessLevel>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("interviewer");
  const [inviteState, setInviteState] = useState<"idle" | "submitting" | "error">("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Step 3 — Guide
  const [openingPrompt, setOpeningPrompt] = useState("");
  const [mustCover, setMustCover] = useState<string[]>([]);
  const [dontBringUp, setDontBringUp] = useState<string[]>([]);
  const [tone, setTone] = useState<SeriesTone>("warm");
  const [sessionMinutes, setSessionMinutes] = useState<10 | 20 | 45>(20);
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [depth, setDepth] = useState<SeriesDepth>("balanced");
  const [plannedSessions, setPlannedSessions] = useState<string>("");

  // Step 4 — Review
  const [questionPlan, setQuestionPlan] = useState<string[]>([]);
  const [questionPlanLoaded, setQuestionPlanLoaded] = useState(false);
  // Derived (not its own state) so the fetch effect doesn't need a
  // synchronous setState call at the top of its body.
  const questionPlanLoading = step === 4 && !questionPlanLoaded;

  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pickedMember = subjectChoice.startsWith("member:")
    ? members.find((m) => m.userId === subjectChoice.slice("member:".length))
    : undefined;

  // The persona is derived, never stored separately — the name always follows
  // the voice, and the Guide copy reads back whichever one is selected.
  const persona = personaFor(voice);

  const uiSubjectKind: "self" | "member" | "person" | "organization" =
    subjectChoice === "self" ? "self" : subjectChoice === "new" ? subjectKindNew : "member";

  const subjectName =
    subjectChoice === "self" ? viewer.name : subjectChoice === "new" ? newSubjectName : (pickedMember?.name ?? "");

  const subjectValid =
    subjectChoice === "self" ||
    (subjectChoice === "new" && newSubjectName.trim().length > 0) ||
    (subjectChoice.startsWith("member:") && !!pickedMember);

  const canContinueStep1 = title.trim().length > 0 && goal.trim().length > 0 && subjectValid;

  // Keeps `plannedSessions` state limited to "" (open-ended) or an integer
  // 1-50 at all times, so an out-of-range value can never survive to submit
  // and 400 at the end of step 4 — after the question-plan LLM call has
  // already run and burned a model call.
  function handlePlannedSessionsChange(raw: string) {
    if (raw.trim() === "") {
      setPlannedSessions("");
      return;
    }
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return; // not a number yet (e.g. a bare "-") — ignore the keystroke
    setPlannedSessions(String(Math.min(50, Math.max(1, n))));
  }

  function selectTemplate(id: TemplateId) {
    setTemplate(id);
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setGoalPlaceholder(tpl.goalPlaceholder);
    setMustCover((prev) => (prev.length === 0 ? [...tpl.mustCover] : prev));
  }

  function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-picking the same file
    if (chosen) setPhotoFile(chosen);
  }

  function onPhotoCropped(blob: Blob) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(blob);
    setPhotoPreview(URL.createObjectURL(blob));
    setPhotoFile(null);
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null);
    setPhotoPreview(null);
  }

  const accessCandidates = members.filter(
    (m) => m.userId !== viewer.userId && !(subjectChoice.startsWith("member:") && m.userId === pickedMember?.userId),
  );

  async function addInvite() {
    if (!inviteEmail.trim()) return;
    setInviteState("submitting");
    setInviteError(null);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setInviteState("error");
        setInviteError((body?.error && INVITE_ERROR_MESSAGES[body.error]) ?? body?.error ?? "Could not send invite.");
        return;
      }
      const newMember: MemberOption = { userId: body.userId, name: inviteEmail.trim(), email: inviteEmail.trim(), pending: true };
      setMembers((prev) => [...prev, newMember]);
      setAccess((prev) => ({ ...prev, [newMember.userId]: "interview" }));
      setInviteEmail("");
      setInviteState("idle");
    } catch (err) {
      setInviteState("error");
      setInviteError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  useEffect(() => {
    if (step !== 4 || questionPlanLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/series/question-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            subjectName,
            subjectRelationship: subjectChoice === "self" ? undefined : subjectRelationship.trim() || undefined,
            goal,
            openingPrompt: openingPrompt.trim() || undefined,
            mustCover,
            tone,
          }),
        });
        if (!res.ok) throw new Error(`question-plan ${res.status}`);
        const body = await res.json();
        if (!cancelled) setQuestionPlan(Array.isArray(body?.questions) ? body.questions : []);
      } catch {
        // Task 6 hasn't landed yet (404) or the model call failed (500) —
        // degrade to an empty, fully-editable list rather than blocking the wizard.
        if (!cancelled) setQuestionPlan([]);
      } finally {
        if (!cancelled) setQuestionPlanLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, questionPlanLoaded]);

  function buildPayload() {
    const inviteEmailTrimmed =
      subjectChoice === "new" && subjectKindNew === "person" ? inviteSubjectEmail.trim() : "";
    const subjectKind: SubjectKind = inviteEmailTrimmed ? "member" : uiSubjectKind;
    return {
      title: title.trim(),
      goal: goal.trim(),
      subjectKind,
      subjectUserId: subjectChoice.startsWith("member:") ? pickedMember?.userId : undefined,
      subjectName: subjectName.trim(),
      subjectRelationship: subjectChoice === "self" ? undefined : subjectRelationship.trim() || undefined,
      openingPrompt: openingPrompt.trim() || undefined,
      mustCover,
      dontBringUp,
      tone,
      sessionMinutes,
      voice,
      depth,
      plannedSessions: (() => {
        const n = Number(plannedSessions);
        return plannedSessions.trim() && !Number.isNaN(n) ? n : null;
      })(),
      access: Object.entries(access)
        .filter(([, level]) => level !== "none")
        .map(([userId, level]) => ({ userId, canView: true, canInterview: level === "interview" })),
      inviteSubjectEmail: inviteEmailTrimmed || undefined,
      questionPlan: questionPlan.map((q) => q.trim()).filter(Boolean),
    };
  }

  async function submit(startInterview: boolean) {
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitState("error");
        setSubmitError(body?.message ?? body?.error ?? "Could not create series.");
        return;
      }
      // Series exists now — upload the photo (if any) before leaving. Kept
      // non-blocking: a failed upload shouldn't strand a created series; the
      // photo can be added later from the detail page.
      if (photoBlob) {
        try {
          await fetch(`/api/series/${body.id}/photo`, {
            method: "POST",
            headers: { "Content-Type": "image/webp" },
            body: photoBlob,
          });
        } catch {
          /* non-blocking */
        }
      }
      router.push(startInterview ? `/app/series/${body.id}/interview` : `/app/series/${body.id}`);
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const grantedAccess = Object.entries(access).filter(([, level]) => level !== "none");
  const interviewNames = grantedAccess
    .filter(([, level]) => level === "interview")
    .map(([id]) => members.find((m) => m.userId === id)?.name)
    .filter((n): n is string => !!n);
  const viewNames = grantedAccess
    .filter(([, level]) => level === "view")
    .map(([id]) => members.find((m) => m.userId === id)?.name)
    .filter((n): n is string => !!n);
  const accessSummary =
    [
      interviewNames.length ? `${joinNames(interviewNames)} can interview` : null,
      viewNames.length ? `${joinNames(viewNames)} can view` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Just you, for now.";

  return (
    <div className="w-full">
      <div className="mb-1 text-[13px] text-ink-soft">Home / New series</div>
      <div className="mb-5">
        <h1 className="text-[26px]">New series</h1>
        <div className="mt-[3px] text-[13.5px] text-ink-soft">Four quick steps — Anna handles the rest.</div>
      </div>

      <StepsIndicator step={step} />

      <div className={step === 4 ? "w-full" : "max-w-3xl"}>
        {step === 1 && (
          <div>
            <WizardField
              label="Start from a template"
              hint="Only pre-fills the goal placeholder and suggests a few must-cover topics — change anything you like."
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <RadioCard
                    key={t.id}
                    title={t.label}
                    description={t.description}
                    selected={template === t.id}
                    onClick={() => selectTemplate(t.id)}
                  />
                ))}
              </div>
            </WizardField>

            <WizardField label="Series title">
              <input
                className={inputClasses}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should we call it?"
              />
            </WizardField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <WizardField
                label="Who is this about?"
                hint="Pick a member — or someone without an account; you can hand them the mic in person."
              >
                <select
                  className={inputClasses}
                  value={subjectChoice}
                  onChange={(e) => setSubjectChoice(e.target.value as SubjectChoice)}
                >
                  <option value="self">Myself</option>
                  {members.map((m) => (
                    <option key={m.userId} value={`member:${m.userId}`}>
                      {m.name}
                      {m.pending ? " · invited" : ""}
                    </option>
                  ))}
                  <option value="new">Someone without an account…</option>
                </select>
              </WizardField>
              <WizardField label="Your relationship">
                <input
                  className={inputClasses}
                  value={subjectChoice === "self" ? "" : subjectRelationship}
                  onChange={(e) => setSubjectRelationship(e.target.value)}
                  disabled={subjectChoice === "self"}
                  placeholder={subjectChoice === "self" ? "—" : 'e.g. "My father", "Our founder"'}
                />
              </WizardField>
            </div>

            <WizardField
              label="Photo"
              hint="Optional — shown in the series avatar. You can add or change it later."
            >
              <div className="flex items-center gap-3.5">
                <Avatar name={subjectName || "?"} size="lg" tone="plain" src={photoPreview} />
                <Button type="button" variant="secondary" onClick={() => photoInput.current?.click()}>
                  {photoPreview ? "Change photo" : "Add photo"}
                </Button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="text-[12.5px] font-medium text-muted hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPhotoPick} />
            </WizardField>

            {photoFile && (
              <ImageCropperModal
                file={photoFile}
                title="Crop photo"
                onCancel={() => setPhotoFile(null)}
                onCropped={onPhotoCropped}
              />
            )}

            {subjectChoice === "new" && (
              <Card className="mb-[18px] px-4 py-4">
                <div className="mb-3">
                  <Segmented
                    name="subject-kind"
                    options={[
                      { value: "person", label: "An individual" },
                      { value: "organization", label: "An organization" },
                    ]}
                    value={subjectKindNew}
                    onChange={(v) => {
                      const kind = v as "person" | "organization";
                      setSubjectKindNew(kind);
                      if (kind === "organization") setInviteSubjectEmail("");
                    }}
                  />
                </div>
                <WizardField label="Their name">
                  <input
                    className={inputClasses}
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder={subjectKindNew === "organization" ? "The family bakery" : "Full name"}
                  />
                </WizardField>
                {subjectKindNew === "person" && (
                  <WizardField
                    label="Invite them by email (optional)"
                    hint="Sends an invite so they can sign in and join their own sessions later."
                  >
                    <input
                      type="email"
                      className={inputClasses}
                      value={inviteSubjectEmail}
                      onChange={(e) => setInviteSubjectEmail(e.target.value)}
                      placeholder="name@email.com"
                    />
                  </WizardField>
                )}
              </Card>
            )}

            <WizardField label="What do you want Anna to learn?" hint="This goal shapes every question Anna asks. Plain words work best.">
              <textarea
                className={textareaClasses}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={goalPlaceholder}
              />
            </WizardField>

            <WizardActions>
              <Button type="button" variant="primary" disabled={!canContinueStep1} onClick={() => setStep(2)}>
                Continue
              </Button>
            </WizardActions>
          </div>
        )}

        {step === 2 && (
          <div>
            <WizardField label="Series owner" hint="The owner runs the guide, the topic queue, and access.">
              <div className="flex max-w-[340px] items-center gap-2.5 rounded-sm border border-line-strong bg-card px-[13px] py-2.5">
                <Avatar name={viewer.name} />
                <span className="text-[14px] text-ink">
                  {viewer.name} <span className="text-[12.5px] text-muted">· you</span>
                </span>
              </div>
            </WizardField>

            <WizardField label="Who else can be part of this?">
              <Card className="px-4">
                {accessCandidates.length === 0 && (
                  <div className="py-4 text-[13px] text-ink-soft">No other members yet — invite someone below.</div>
                )}
                {accessCandidates.map((m) => (
                  <div key={m.userId} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
                    <Avatar name={m.name} tone="warm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{m.name}</div>
                      <div className="truncate text-xs text-ink-soft">
                        {m.email}
                        {m.pending ? " · invited" : ""}
                      </div>
                    </div>
                    <Segmented
                      name={m.userId}
                      options={[
                        { value: "view", label: "Can view" },
                        { value: "interview", label: "Can interview" },
                        { value: "none", label: "No access" },
                      ]}
                      value={access[m.userId] ?? "none"}
                      onChange={(v) => setAccess((prev) => ({ ...prev, [m.userId]: v as AccessLevel }))}
                    />
                  </div>
                ))}
              </Card>
              {subjectChoice.startsWith("member:") && pickedMember && (
                <div className="mt-2 text-xs text-ink-soft">
                  {pickedMember.name} is the subject of this series — they can always join their own sessions.
                </div>
              )}
            </WizardField>

            <div className="mt-1 flex flex-wrap items-center gap-2.5 rounded-card border border-dashed border-line-strong px-4 py-3.5">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Invite someone new — name@email.com"
                className={`${inputClasses} max-w-[320px] flex-1`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className={`${inputClasses} w-[160px]`}
              >
                <option value="interviewer">Interviewer</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="button" onClick={addInvite} disabled={!inviteEmail.trim() || inviteState === "submitting"}>
                {inviteState === "submitting" ? "Sending…" : "Invite"}
              </Button>
            </div>
            {inviteError && <div className="mt-2 text-xs font-medium text-amber">{inviteError}</div>}

            <WizardActions onBack={() => setStep(1)}>
              <Button type="button" variant="primary" onClick={() => setStep(3)}>
                Continue
              </Button>
            </WizardActions>
          </div>
        )}

        {step === 3 && (
          <div>
            <WizardField label="Who should do the interviewing?" hint="Pick a voice — the name comes with it. Press ▶ to hear each one.">
              <VoicePicker value={voice} onChange={setVoice} />
            </WizardField>

            <WizardField label="Opening prompt" hint={`How ${persona.name} should open the very first session.`}>
              <input
                className={inputClasses}
                value={openingPrompt}
                onChange={(e) => setOpeningPrompt(e.target.value)}
                placeholder="Start warm — ask about the easy stuff before the hard stories."
              />
            </WizardField>

            <WizardField label={`Topics ${persona.name} must cover`}>
              <ChipEditor items={mustCover} onChange={setMustCover} placeholder="＋ Add a topic" />
            </WizardField>

            <WizardField label="Don't bring up">
              <ChipEditor items={dontBringUp} onChange={setDontBringUp} placeholder="＋ Add" tone="amber" />
              <div className="mt-[5px] text-xs text-ink-soft">
                {persona.name} will never raise these — if they come up, the answer gets heard, then the
                conversation moves gently on.
              </div>
            </WizardField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <WizardField label="Tone">
                <Segmented name="tone" options={TONE_OPTIONS} value={tone} onChange={(v) => setTone(v as SeriesTone)} />
              </WizardField>
              <WizardField label="Session length">
                <Segmented
                  name="session-length"
                  options={LENGTH_OPTIONS}
                  value={String(sessionMinutes)}
                  onChange={(v) => setSessionMinutes(Number(v) as 10 | 20 | 45)}
                />
              </WizardField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <WizardField
                label="Depth"
                hint={
                  depth === "single"
                    ? `One question, one answer — ${persona.name} collects each answer and moves on, no follow-ups. A simple way to gather information.`
                    : "How long the questions run, and how hard each thread gets mined. Single Q&A skips follow-ups entirely."
                }
              >
                <Segmented
                  name="depth"
                  options={DEPTH_OPTIONS}
                  value={depth}
                  onChange={(v) => setDepth(v as SeriesDepth)}
                />
              </WizardField>
              <WizardField label="Planned sessions (optional)" hint="Leave blank for open-ended. Setting it lets the interviewer pace the topics.">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={`${inputClasses} max-w-[140px]`}
                  value={plannedSessions}
                  onChange={(e) => handlePlannedSessionsChange(e.target.value)}
                  placeholder="—"
                />
              </WizardField>
            </div>

            <WizardActions onBack={() => setStep(2)}>
              <Button type="button" variant="primary" onClick={() => setStep(4)}>
                Continue
              </Button>
            </WizardActions>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Card className="px-5 py-5">
                <h3 className="serif text-[18px]">{persona.name} drafted the first session</h3>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {depth === "single"
                    ? `Reorder, edit, or remove anything — this is the list ${persona.name} will work through, one question and one answer at a time, with no follow-ups.`
                    : `Reorder, edit, or remove anything — this is a starting point. ${persona.name} improvises follow-ups from whatever ${subjectName || "they"} say.`}
                </p>

                <div className="mt-3">
                  {questionPlanLoading && <div className="py-4 text-[13px] text-ink-soft">Drafting the first session…</div>}
                  {!questionPlanLoading && questionPlan.length === 0 && (
                    <div className="py-3 text-[13px] text-ink-soft">No questions yet — add your own below.</div>
                  )}
                  {questionPlan.map((q, i) => (
                    <div key={i} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                      <span className="text-faint" aria-hidden>
                        ⋮⋮
                      </span>
                      <input
                        value={q}
                        onChange={(e) =>
                          setQuestionPlan((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                        }
                        className="serif flex-1 border-0 bg-transparent text-[15px] leading-snug text-ink-soft focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setQuestionPlan((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove question"
                        className="text-faint hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setQuestionPlan((prev) => [...prev, ""])}
                  className="mt-3 block w-full rounded-card border border-dashed border-line-strong py-3 text-center text-[13px] font-semibold text-ink-soft hover:border-green hover:text-green-deep"
                >
                  ＋ Add a question
                </button>
              </Card>

              <WizardActions onBack={() => setStep(3)}>
                <Button type="button" onClick={() => submit(false)} disabled={submitState === "submitting"}>
                  {submitState === "submitting" ? "Creating…" : "Create series"}
                </Button>
                <Button type="button" variant="primary" onClick={() => submit(true)} disabled={submitState === "submitting"}>
                  Create &amp; start first interview
                </Button>
              </WizardActions>
              {submitError && <div className="mt-2 text-xs font-medium text-amber">{submitError}</div>}
            </div>

            <Card className="h-fit px-5 py-5">
              <h3 className="serif text-[18px]">Ready to go</h3>
              <KV k="Basics" edit={() => setStep(1)}>
                {template ? `${TEMPLATES.find((t) => t.id === template)?.label} · ` : ""}
                <b>{title || "Untitled series"}</b>
                <br />
                {subjectName || "—"}
                {subjectRelationship ? ` · ${subjectRelationship}` : ""}
              </KV>
              <KV k="Goal">{goal || "—"}</KV>
              <KV k="Assign" edit={() => setStep(2)}>
                Owner: {viewer.name} (you)
                <br />
                {accessSummary}
              </KV>
              <KV k="Guide" edit={() => setStep(3)}>
                {persona.name} · {TONE_LABELS[tone]} tone · {DEPTH_LABELS[depth]}
                <br />
                {sessionMinutes}-minute sessions ·{" "}
                {plannedSessions.trim() ? `${plannedSessions.trim()} planned` : "open-ended"}
                <br />
                {mustCover.length} must-cover topic{mustCover.length === 1 ? "" : "s"} · {dontBringUp.length} thing
                {dontBringUp.length === 1 ? "" : "s"} {persona.name} won&apos;t raise
              </KV>
              {inviteSubjectEmail.trim() && subjectChoice === "new" && (
                <div className="mt-2">
                  <Badge tone="muted">Will invite {inviteSubjectEmail.trim()}</Badge>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
