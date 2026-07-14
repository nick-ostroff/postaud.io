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
