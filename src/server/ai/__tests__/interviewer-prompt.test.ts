import { describe, it, expect } from "vitest";
import { buildInterviewerInstructions } from "../interviewer-prompt";
const base = { series: { title: "Dad's Story", subjectName: "Henk", subjectRelationship: "father",
  goal: "Capture Dad's whole life", openingPrompt: "Start warm: Rotterdam first", dontBringUp: ["Pieter's accident"],
  tone: "warm" as const, sessionMinutes: 20, interviewerName: "Anna", depth: "balanced" as const,
  plannedSessions: null }, handTheMic: false, sessionNumber: 1,
  knownFacts: [{ topic: "Meeting Jan", statement: "Met Jan, spring 1975, on the Hoek van Holland ferry." }],
  topics: [{ name: "Health & habits", coverageScore: 0, mustCover: true, suggested: false }], retellQueue: [],
  mode: "deep" as const, queuedQuestions: [] as string[] };
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
it("each of light/balanced/deep produces different instructions (single collapses into balanced under mode: deep — see conversation modes)", () => {
  const of = (depth: "light" | "balanced" | "deep") =>
    buildInterviewerInstructions({ ...base, series: { ...base.series, depth } });
  expect(new Set([of("light"), of("balanced"), of("deep")]).size).toBe(3);
});
it("quickfire mode swaps thread-mining for a one-question-one-answer posture", () => {
  const p = buildInterviewerInstructions({ ...base, mode: "quickfire", series: { ...base.series, depth: "single" } });
  expect(p).toContain("ONE QUESTION, ONE ANSWER");
  expect(p).not.toContain("STAY ON THE THREAD");
  expect(p.toLowerCase()).toContain("no follow-ups");
});
it("quickfire mode carries none of the conversational mining instructions", () => {
  const p = buildInterviewerInstructions({ ...base, mode: "quickfire", series: { ...base.series, depth: "single" } });
  expect(p).not.toContain("lingering IS the work");
  expect(p).not.toContain("follow-ups on a thread");
  expect(p).not.toContain("mine it before");
});
it("single depth still keeps the NEVER BRING UP guardrail supreme", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, depth: "single" } });
  expect(p).toContain("NEVER BRING UP");
  expect(p).toContain("Guardrails always outrank depth.");
  expect(p).toContain("Pieter's accident");
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
it("light depth does not carry unconditional lingering instructions that contradict it", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, depth: "light" } });
  expect(p).not.toContain("lingering IS the work");
  expect(p).not.toContain("fine to spend the entire session on one or two rich memories");
  expect(p).not.toContain("Ask at least two or three follow-ups on a thread before even considering a new topic");
});
it("balanced depth still reproduces today's stay-on-the-thread language (no regression)", () => {
  const p = buildInterviewerInstructions(base); // base.series.depth === "balanced"
  expect(p).toContain("lingering IS the work");
  expect(p).toContain("fine to spend the entire session on one or two rich memories");
  expect(p).toContain("Ask at least two or three follow-ups on a thread before even considering a new topic");
});
it("DEPTH states its precedence over STAY ON THE THREAD, but never over NEVER BRING UP", () => {
  const p = buildInterviewerInstructions(base);
  expect(p).toMatch(/DEPTH[\s\S]*outrank[\s\S]*STAY ON THE THREAD/i);
  expect(p).toContain("Guardrails always outrank depth.");
});
it("balanced STAY ON THE THREAD section is byte-identical to the pre-feature prompt", () => {
  const p = buildInterviewerInstructions(base); // base.series.depth === "balanced"
  const section = p.split("\n\n").find((s) => s.startsWith("STAY ON THE THREAD"));
  expect(section).toBe(
    [
      "STAY ON THE THREAD (this matters most)",
      "Your job is depth, not coverage. When the subject shares a memory, STAY THERE and mine it before " +
        "going anywhere else. A single story is worth several follow-ups in a row:",
      "- Chase the specifics they just mentioned: every name, place, date, and object is a door — open it. " +
        'If they say "we moved to Big Rock," ask what the house was like, who else was there, what a normal ' +
        "day looked like — before you go anywhere new.",
      "- Ask for the senses and the feeling: what it looked, sounded, smelled like; what they felt in the " +
        "moment; what they remember most vividly.",
      '- Use short, warm continuers to keep them going: "What happened next?", "Tell me more about that", ' +
        '"What was that like?", "Who else was there?".',
      "- Assume there is always more in a memory than the first pass. Ask at least two or three follow-ups on " +
        "a thread before even considering a new topic — and let THEM signal it's exhausted (they trail off, " +
        'repeat themselves, or say some version of "that\'s about it").',
      "- Never stack several questions into one breath, and never announce a topic change like an agenda. " +
        "Let the next thread grow out of something they just said whenever you can.",
      "It is completely fine to spend the entire session on one or two rich memories. Do not rush to move the " +
        "conversation forward — lingering IS the work.",
      "One hard exception: NEVER chase anything listed under NEVER BRING UP below. If a door the subject " +
        "opens leads to one of those topics, do not walk through it — follow the NEVER BRING UP guardrail " +
        "instead (listen briefly, respond with care, gently move on). That guardrail always outranks this one.",
    ].join("\n"),
  );
});
it("balanced EXPLORE NEXT section is byte-identical to the pre-feature prompt", () => {
  const p = buildInterviewerInstructions(base); // base.series.depth === "balanced"
  const section = p.split("\n\n").find((s) => s.startsWith("EXPLORE NEXT"));
  expect(section).toBe(
    [
      "EXPLORE NEXT (lowest coverage first)",
      "These are the topics still worth exploring across the WHOLE series, least-covered first. They are a " +
        "background compass for where to steer when a thread genuinely runs dry — NOT a checklist to march " +
        "through, and NOT a reason to move on. Covering fewer topics in rich detail beats touching all of them " +
        "shallowly. Only reach for the next topic once the current one is truly exhausted (see STAY ON THE " +
        "THREAD below):",
      "- Health & habits (coverage: 0%) [must cover]",
    ].join("\n"),
  );
});
it("light depth's EXPLORE NEXT no longer fights its own DEPTH dial", () => {
  const p = buildInterviewerInstructions({ ...base, series: { ...base.series, depth: "light" } });
  expect(p).not.toContain("NOT a checklist to march through");
  expect(p).not.toContain("Only reach for the next topic once the current one is truly exhausted");
});

describe("conversation modes", () => {
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
