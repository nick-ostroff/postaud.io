"use client";

import { useEffect, useRef, useState } from "react";
import { VOICES } from "@/lib/voices";
import type { VoiceId } from "@/lib/voices";

/**
 * Picks the interviewer's voice — and with it, their name. One shared <audio>
 * element rather than one per card, so starting a sample always stops the
 * previous one; six clips playing over each other is the obvious failure mode
 * of a grid of independent players.
 *
 * Selecting a card and previewing it are deliberately separate actions: you
 * can listen to all six without committing to any of them. That promise has
 * to hold for keyboard and screen-reader users too, which is why each card
 * is a plain container — a native <input type="radio"> (wrapped in a
 * <label>) carries the selection semantics, and the play <button> is a
 * sibling of that label rather than a descendant of it. Nesting a focusable
 * button inside a `role="radio"` element is an ARIA violation, and it used
 * to pollute the radio's accessible name with the button's own label; a
 * native radio group sidesteps both problems (and gets arrow-key navigation
 * between options for free) instead of patching around them.
 */
export function VoicePicker({
  value,
  onChange,
}: {
  value: VoiceId;
  onChange: (id: VoiceId) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<VoiceId | null>(null);
  // Bumped on every toggle() call and captured per-call so a play() promise
  // that settles late (because a newer toggle() already changed what should
  // be playing) can recognize it's stale and no-op instead of clobbering
  // state a more recent call already set.
  const tokenRef = useRef(0);

  // Stop the preview if the picker unmounts mid-clip (e.g. the user clicks
  // Back out of the Guide step) — an <audio> element that's been removed from
  // the tree can otherwise keep playing to the end.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  function toggle(id: VoiceId, sample: string) {
    const el = audioRef.current;
    if (!el) return;
    if (playing === id) {
      // Invalidate any play() still in flight for this id before pausing,
      // so its handler can't re-assert "playing" after we've just stopped it.
      tokenRef.current += 1;
      el.pause();
      setPlaying(null);
      return;
    }
    const token = ++tokenRef.current;
    // Set optimistically, before play() even resolves. Two things depend on
    // this: (1) a second Play press on this same card while the first is
    // still loading now sees `playing === id` immediately and takes the
    // stop branch above, instead of racing a second play() that would
    // restart the clip; (2) the UI reflects "which card is loading/playing"
    // without waiting on a network-bound promise.
    setPlaying(id);
    el.src = sample;
    el.currentTime = 0;
    void el.play().catch(() => {
      // Autoplay blocked or the file is missing — fail quiet, but only
      // clear state if nothing newer has since taken over the audio
      // element (a stale rejection must not stomp a fresh play).
      if (tokenRef.current === token) setPlaying(null);
    });
  }

  return (
    <div>
      <fieldset className="m-0 grid grid-cols-1 gap-2.5 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Interviewer voice</legend>
        {VOICES.map((v) => {
          const selected = v.id === value;
          const isPlaying = playing === v.id;
          return (
            <div
              key={v.id}
              className={
                "relative rounded-card border px-3.5 py-3 transition-colors focus-within:border-green " +
                (selected
                  ? "border-green bg-green-tint"
                  : "border-line-strong bg-card hover:border-green")
              }
            >
              <label className="block cursor-pointer pr-9">
                <input
                  type="radio"
                  name="voice"
                  value={v.id}
                  checked={selected}
                  onChange={() => onChange(v.id)}
                  className="sr-only"
                />
                <span className="text-[14px] font-semibold text-ink">{v.name}</span>
                <div className="mt-1 text-xs leading-snug text-ink-soft">{v.blurb}</div>
              </label>
              <button
                type="button"
                aria-label={isPlaying ? `Stop ${v.name}'s sample` : `Play ${v.name}'s sample`}
                onClick={() => toggle(v.id, v.sample)}
                className="absolute right-3.5 top-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-[11px] text-muted hover:border-green hover:text-green-deep"
              >
                {isPlaying ? "■" : "▶"}
              </button>
            </div>
          );
        })}
      </fieldset>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}
