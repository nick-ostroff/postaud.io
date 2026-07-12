import type { SeriesTone } from "@/db/types";

export type InterviewerSeriesInput = {
  title: string;
  subjectName: string;
  subjectRelationship?: string | null;
  goal: string;
  openingPrompt?: string | null;
  dontBringUp: string[];
  tone: SeriesTone;
  sessionMinutes: number;
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
};

const TONE_REGISTER: Record<SeriesTone, string> = {
  warm: "warm, personal, and unhurried — like catching up with someone you love",
  neutral: "calm, clear, and professional — friendly but not overly familiar",
  playful: "light, playful, and quick to laugh, while still taking the answers seriously",
};

/**
 * Deterministic template that turns a series' guide rails + knowledge base
 * into Anna's Realtime system instructions. No model call here — this is
 * pure string assembly so it's cheap to unit test and to reason about when
 * an interview goes off the rails.
 *
 * Section order matters: it mirrors how Anna should prioritize a session —
 * who she is, who she's talking to, what she's for, what NOT to re-ask,
 * what to explore next (lowest coverage first), what to ask to be retold,
 * what to never bring up, how to sound, and how to close.
 */
export function buildInterviewerInstructions(input: BuildInterviewerInstructionsInput): string {
  const { series, handTheMic, knownFacts, topics, retellQueue } = input;

  const sections: string[] = [];

  // ---- WHO YOU ARE ----
  sections.push(
    [
      "WHO YOU ARE",
      `You are Anna, a warm and skilled voice interviewer conducting a live, recorded oral-history ` +
        `interview for the series "${series.title}". You speak naturally, out loud, in short conversational ` +
        `turns — never in bullet points or numbered lists.`,
    ].join("\n"),
  );

  // ---- THE SUBJECT ----
  const relationship = series.subjectRelationship ? `, the caller's ${series.subjectRelationship}` : "";
  const subjectLine = handTheMic
    ? `You are interviewing ${series.subjectName}${relationship}. ${series.subjectName} is holding the ` +
      `microphone themselves this session — address them directly, by name.`
    : `You are interviewing ${series.subjectName}${relationship}.`;
  sections.push(["THE SUBJECT", subjectLine].join("\n"));

  // ---- THE GOAL ----
  const goalLines = [`Goal for this series: ${series.goal}`];
  if (series.openingPrompt) {
    goalLines.push(`Opening prompt for this session: "${series.openingPrompt}" — start from there.`);
  }
  sections.push(["THE GOAL", ...goalLines].join("\n"));

  // ---- WHAT YOU ALREADY KNOW (never re-ask) ----
  const knownLines =
    knownFacts.length > 0
      ? knownFacts.map((f) => `- [${f.topic}] ${f.statement}`)
      : ["- Nothing has been captured yet for this series — everything is new ground."];
  sections.push(
    [
      "WHAT YOU ALREADY KNOW (never re-ask)",
      "This is the facts digest already on record. Never re-ask about anything listed here — treat it as " +
        "settled and, if it's useful, build on it naturally instead:",
      ...knownLines,
    ].join("\n"),
  );

  // ---- EXPLORE NEXT (lowest coverage first) ----
  const sortedTopics = [...topics].sort((a, b) => {
    if (a.coverageScore !== b.coverageScore) return a.coverageScore - b.coverageScore;
    if (a.mustCover !== b.mustCover) return a.mustCover ? -1 : 1;
    return 0;
  });
  const topicLines =
    sortedTopics.length > 0
      ? sortedTopics.map((t) => {
          const pct = Math.round(t.coverageScore * 100);
          const tag = t.mustCover ? " [must cover]" : "";
          return `- ${t.name} (coverage: ${pct}%)${tag}`;
        })
      : ["- No topics are queued — follow the goal and let the conversation breathe."];
  sections.push(
    [
      "EXPLORE NEXT (lowest coverage first)",
      "Prioritize the least-covered topics below, most urgent first. Weave them in naturally rather than " +
        "reading them as a checklist:",
      ...topicLines,
    ].join("\n"),
  );

  // ---- RETELL REQUESTS ----
  const retellLines =
    retellQueue.length > 0
      ? [
          "The subject glossed over something below in an earlier session that's worth hearing again in " +
            "more detail. Ask them to retell it, in their own words, when it fits naturally:",
          ...retellQueue.map((r) => `- ${r}`),
        ]
      : ["There is nothing queued to be retold this session."];
  sections.push(["RETELL REQUESTS", ...retellLines].join("\n"));

  // ---- NEVER BRING UP ----
  const dontBringUpLines =
    series.dontBringUp.length > 0
      ? series.dontBringUp.map((d) => `- ${d}`)
      : ["- Nothing has been flagged as off-limits for this series."];
  sections.push(
    [
      "NEVER BRING UP",
      "Never initiate any of the following topics yourself:",
      ...dontBringUpLines,
      "If the subject brings one of these up on their own, listen briefly, respond with care, then gently " +
        "guide the conversation back — never press for more, and never volunteer these topics unprompted.",
    ].join("\n"),
  );

  // ---- STYLE ----
  const styleLines = [
    `Tone: ${TONE_REGISTER[series.tone]}.`,
    "Ask one question at a time, and wait for a full answer before asking the next one.",
    "Follow up naturally on what the subject just said rather than jumping to the next scripted topic — " +
      "curiosity first, checklist second.",
    "Speak in plain, spoken English — short sentences, no jargon, nothing that would look like a bullet " +
      "point if transcribed.",
    `Aim for a session length of about ${series.sessionMinutes} minutes — pace yourself accordingly.`,
  ];
  if (handTheMic) {
    styleLines.push(
      `${series.subjectName} is speaking for themselves this session. Speak slower, use simpler phrasing, ` +
        "and leave generous room for pauses — don't rush to fill silence.",
    );
  }
  sections.push(["STYLE", ...styleLines].join("\n"));

  // ---- ENDING ----
  sections.push(
    [
      "ENDING",
      "As the session length approaches, begin steering toward a close. Thank the subject warmly for what " +
        "they shared, reflect back one specific detail that stood out, and end on an easy, unhurried note — " +
        "never cut off abruptly.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
