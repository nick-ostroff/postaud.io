import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

export const AUDIO_BUCKET = "interview-audio";
/** Matches the brief's "60-min expiry" for a fact's playback link. */
export const SIGNED_URL_EXPIRY_SEC = 60 * 60;

export type FactAudio = { url: string; startSec: number };

/**
 * Signs a short-lived playback URL for a fact's source-interview recording,
 * seeked to the fact's own recorded offset. Returns null when there's
 * nothing to play — no uploaded audio for the source interview, or no
 * recorded offset for this fact — which callers (the review-detail page and
 * the audio-url route) use as the "don't render a player" / 404 signal.
 * Shared by both so the bucket name + expiry stay in one place.
 */
export async function signFactAudio(
  svc: SupabaseClient<Database>,
  fact: { audioPath: string | null; audioOffsetSec: number | null },
): Promise<FactAudio | null> {
  if (!fact.audioPath || fact.audioOffsetSec == null) return null;

  const { data, error } = await svc.storage.from(AUDIO_BUCKET).createSignedUrl(fact.audioPath, SIGNED_URL_EXPIRY_SEC);
  if (error || !data) return null;

  return { url: data.signedUrl, startSec: fact.audioOffsetSec };
}
