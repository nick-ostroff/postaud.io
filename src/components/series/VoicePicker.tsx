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
 * can listen to all six without committing to any of them.
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
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = sample;
    el.currentTime = 0;
    void el.play().then(
      () => setPlaying(id),
      () => setPlaying(null), // autoplay blocked or the file is missing — fail quiet
    );
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Interviewer voice"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {VOICES.map((v) => {
          const selected = v.id === value;
          const isPlaying = playing === v.id;
          return (
            <div
              key={v.id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onClick={() => onChange(v.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(v.id);
                }
              }}
              className={
                "cursor-pointer rounded-card border px-3.5 py-3 transition-colors " +
                (selected
                  ? "border-green bg-green-tint"
                  : "border-line-strong bg-card hover:border-green")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">{v.name}</span>
                <button
                  type="button"
                  aria-label={isPlaying ? `Stop ${v.name}'s sample` : `Play ${v.name}'s sample`}
                  onClick={(e) => {
                    e.stopPropagation(); // previewing is not picking
                    toggle(v.id, v.sample);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-[11px] text-muted hover:border-green hover:text-green-deep"
                >
                  {isPlaying ? "■" : "▶"}
                </button>
              </div>
              <div className="mt-1 text-xs leading-snug text-muted">{v.blurb}</div>
            </div>
          );
        })}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />
    </div>
  );
}
