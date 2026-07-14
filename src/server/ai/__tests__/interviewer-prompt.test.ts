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
