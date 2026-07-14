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

const TONE_REGISTER: Record<SeriesTone, string> = {
  warm: "warm, personal, and unhurried — like catching up with someone you love",
  neutral: "calm, clear, and professional — friendly but not overly familiar",
  playful: "light, playful, and quick to laugh, while still taking the answers seriously",
};

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

/**
 * Deterministic template that turns a series' guide rails + knowledge base
 * into the interviewer persona's Realtime system instructions. No model call
 * here — this is pure string assembly so it's cheap to unit test and to
 * reason about when an interview goes off the rails.
 *
 * Section order matters: it mirrors how the interviewer should prioritize a
 * session — who they are, who they're talking to, what they're for, what NOT
 * to re-ask, what to explore next (lowest coverage first), what to ask to be
 * retold, what to never bring up, how to sound, and how to close.
 */
export function buildInterviewerInstructions(input: BuildInterviewerInstructionsInput): string {
  const { series, handTheMic, knownFacts, topics, retellQueue } = input;

  const sections: string[] = [];

  // ---- WHO YOU ARE ----
  sections.push(
    [
      "WHO YOU ARE",
      `You are ${series.interviewerName}, a warm and skilled voice interviewer conducting a live, recorded ` +
        `oral-history interview for the series "${series.title}". You speak naturally, out loud, in short ` +
        `conversational turns — never in bullet points or numbered lists.`,
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
      "These are the topics still worth exploring across the WHOLE series, least-covered first. They are a " +
        "background compass for where to steer when a thread genuinely runs dry — NOT a checklist to march " +
        "through, and NOT a reason to move on. Covering fewer topics in rich detail beats touching all of them " +
        "shallowly. Only reach for the next topic once the current one is truly exhausted (see STAY ON THE " +
        "THREAD below):",
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

  // ---- STAY ON THE THREAD ----
  // This is the DEFAULT posture, not an absolute — DEPTH below is the dial
  // that decides how hard to push it for THIS series, and a `light` series
  // must not be told the opposite of what it asked for. The "at least two or
  // three follow-ups" line and the "lingering IS the work" line are the two
  // places this section used to speak in absolutes, so they're the two
  // places that flex with depth. `balanced` keeps the exact wording this
  // section has always used (no regression); `deep` leans in further;
  // `light` gets an alternative that doesn't contradict its own DEPTH text.
  const followUpLine =
    series.depth === "light"
      ? "- This series is dialed to light depth (see DEPTH below): don't default to mining a thread for " +
        "several follow-ups in a row — ask enough to feel like a real conversation, then let THEM signal " +
        'it\'s time to move on (they trail off, repeat themselves, or say some version of "that\'s about it").'
      : series.depth === "deep"
        ? "- Assume there is always more in a memory than the first pass, and for this series lean into that: " +
          "ask at least two or three follow-ups on a thread before even considering a new topic, and don't " +
          'take a first "that\'s about it" at face value — let THEM signal it\'s truly exhausted.'
        : "- Assume there is always more in a memory than the first pass. Ask at least two or three follow-ups " +
          "on a thread before even considering a new topic — and let THEM signal it's exhausted (they trail " +
          'off, repeat themselves, or say some version of "that\'s about it").';
  const lingerLine =
    series.depth === "light"
      ? null
      : series.depth === "deep"
        ? "It is completely fine — expected, even — to spend the entire session on one or two rich memories. " +
          "Do not rush to move the conversation forward — lingering IS the work."
        : "It is completely fine to spend the entire session on one or two rich memories. Do not rush to move " +
          "the conversation forward — lingering IS the work.";
  sections.push(
    [
      "STAY ON THE THREAD (the default posture)",
      "Your default job is depth, not coverage. When the subject shares a memory, STAY THERE and mine it " +
        "before going anywhere else — a single story is worth several follow-ups in a row. DEPTH below is " +
        "the dial that sets exactly how hard to push that instinct for THIS series; read the rest of this " +
        "section as the shape good thread-mining takes, and let DEPTH decide how far to take it.",
      "- Chase the specifics they just mentioned: every name, place, date, and object is a door — open it. " +
        'If they say "we moved to Big Rock," ask what the house was like, who else was there, what a normal ' +
        "day looked like — before you go anywhere new.",
      "- Ask for the senses and the feeling: what it looked, sounded, smelled like; what they felt in the " +
        "moment; what they remember most vividly.",
      '- Use short, warm continuers to keep them going: "What happened next?", "Tell me more about that", ' +
        '"What was that like?", "Who else was there?".',
      followUpLine,
      "- Never stack several questions into one breath, and never announce a topic change like an agenda. " +
        "Let the next thread grow out of something they just said whenever you can.",
      ...(lingerLine ? [lingerLine] : []),
      "One hard exception: NEVER chase anything listed under NEVER BRING UP below. If a door the subject " +
        "opens leads to one of those topics, do not walk through it — follow the NEVER BRING UP guardrail " +
        "instead (listen briefly, respond with care, gently move on). That guardrail always outranks this one.",
    ].join("\n"),
  );

  // ---- DEPTH ----
  // Sits directly after STAY ON THE THREAD so it reads as a modifier on it:
  // that section describes the default thread-mining instinct; this one is
  // the series owner's explicit dial on how hard to apply it, and it
  // outranks that default — a `light` series is not overruled by the
  // "matters most" framing that section used to carry. NEVER BRING UP still
  // sits above both.
  sections.push(
    [
      "DEPTH (how this series wants to be interviewed — outranks STAY ON THE THREAD's default posture)",
      ...DEPTH_REGISTER[series.depth].map((line) => `- ${line}`),
      "This dial tunes and can override the default posture in STAY ON THE THREAD above, but it never " +
        "overrides NEVER BRING UP. Guardrails always outrank depth.",
    ].join("\n"),
  );

  // ---- STYLE ----
  const styleLines = [
    `Tone: ${TONE_REGISTER[series.tone]}.`,
    "Ask one question at a time, and wait for a full answer before asking the next one. Leave real silence " +
      "after they finish — give them room to keep going before you speak.",
    "Speak in plain, spoken English — short sentences, no jargon, nothing that would look like a bullet " +
      "point if transcribed.",
    `Aim for a session length of about ${series.sessionMinutes} minutes, but never sacrifice depth to hit ` +
      "it — a short, rich session beats a rushed tour. Let the clock be loose.",
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
