"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TranscriptBatch, type TranscriptTurn } from "@/lib/transcript-batch";

type LiveInterviewProps = {
  interviewId: string;
  seriesId: string;
  seriesTitle: string;
  subjectName: string;
  handoff: boolean;
};

/** Orb / conversation state driven by Realtime data-channel events. */
type OrbState = "connecting" | "speaking" | "listening" | "thinking" | "paused";

type SessionError = "mic_denied" | "connect_failed" | null;

const FLUSH_INTERVAL_MS = 5000;

/** Minimal shape of the Realtime server events we consume (verified against openai@6.34.0 types). */
type RealtimeEvent = {
  type: string;
  transcript?: string;
  delta?: string;
};

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The live voice session ("Stage" direction, mockup #1a / mobile #1d).
 * Owns the whole WebRTC lifecycle: mint token → peer connection with the mic →
 * OpenAI Realtime over SDP → remote audio to a hidden autoplay element, while
 * a data channel streams transcript events into a TranscriptBatch that flushes
 * to the messages route every 5s and on teardown. A MediaRecorder runs on the
 * mic stream for the whole session; its single webm blob uploads at the end.
 */
export function LiveInterview({
  interviewId,
  seriesId,
  seriesTitle,
  subjectName,
  handoff,
}: LiveInterviewProps) {
  const router = useRouter();

  const [orbState, setOrbState] = useState<OrbState>("connecting");
  const [sessionError, setSessionError] = useState<SessionError>(null);
  const [connected, setConnected] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [liveLine, setLiveLine] = useState("");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Session plumbing lives in refs — none of it should re-render the stage.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const batchRef = useRef<TranscriptBatch>(new TranscriptBatch());
  const startedAtRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const endingRef = useRef(false);

  /** Flush unsent transcript turns to the messages route (at-least-once). */
  const flushTranscript = useCallback(async () => {
    const batch = batchRef.current;
    if (!batch.hasPending()) return;
    const snapshot = batch.pending();
    try {
      const res = await fetch(`/api/interviews/${interviewId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: snapshot }),
      });
      if (res.ok) batch.markSent(snapshot);
      // Non-OK: leave the turns buffered; next flush retries the same seqs
      // (server upserts on (interview_id, seq) with ignoreDuplicates).
    } catch {
      // Network hiccup — turns stay pending for the next flush.
    }
  }, [interviewId]);

  /** Record a finished turn: into the batch (for the server) + local state (for the drawer). */
  const addTurn = useCallback((role: "interviewer" | "subject", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const tOffsetSec = (Date.now() - startedAtRef.current) / 1000;
    const turn = batchRef.current.add(role, trimmed, tOffsetSec);
    setTurns((prev) => [...prev, turn]);
  }, []);

  /**
   * Wire the 'oai-events' data channel. Event names verified against
   * openai@6.34.0 (node_modules/openai/resources/realtime/realtime.d.ts):
   * - conversation.item.input_audio_transcription.completed → subject turn (.transcript)
   * - conversation.item.input_audio_transcription.delta → live subject line (.delta)
   * - response.output_audio_transcript.done → Anna's finished line (.transcript)
   * - input_audio_buffer.speech_started / speech_stopped → listening/thinking
   * - output_audio_buffer.started / stopped → speaking/listening
   */
  const attachDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dc.onmessage = (msg: MessageEvent) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(msg.data as string) as RealtimeEvent;
        } catch {
          return;
        }
        switch (event.type) {
          case "conversation.item.input_audio_transcription.delta":
            if (event.delta) setLiveLine((prev) => (prev + event.delta).slice(-280));
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (event.transcript) addTurn("subject", event.transcript);
            setLiveLine("");
            break;
          case "response.output_audio_transcript.done":
            if (event.transcript) {
              addTurn("interviewer", event.transcript);
              setCurrentQuestion(event.transcript.trim());
            }
            break;
          case "input_audio_buffer.speech_started":
            if (!pausedRef.current) setOrbState("listening");
            break;
          case "input_audio_buffer.speech_stopped":
            if (!pausedRef.current) setOrbState("thinking");
            break;
          case "output_audio_buffer.started":
            if (!pausedRef.current) setOrbState("speaking");
            break;
          case "output_audio_buffer.stopped":
            if (!pausedRef.current) setOrbState("listening");
            break;
        }
      };
    },
    [addTurn],
  );

  /** Stop every media resource. Safe to call repeatedly. */
  const teardownMedia = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // already stopped
      }
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  // ---- session lifecycle: connect on mount (and on "Try again") ----
  useEffect(() => {
    let cancelled = false;
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    async function connect() {
      // 1. Mic first — permission denial is its own friendly card.
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setSessionError("mic_denied");
        return;
      }
      if (cancelled) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = mic;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      // 2. Session recording — one webm blob, uploaded at teardown.
      try {
        const recorder = new MediaRecorder(mic, { mimeType: "audio/webm;codecs=opus" });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch {
        // Recording is best-effort; the live session still works without it.
      }

      // 3. Remote audio → hidden autoplay element.
      pc.ontrack = (event) => {
        if (audioElRef.current) audioElRef.current.srcObject = event.streams[0];
      };

      // 4. Data channel for Realtime events (wired up in a separate handler).
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      attachDataChannel(dc);

      // 5. Token mint → SDP offer/answer with OpenAI.
      try {
        const tokenRes = await fetch(`/api/interviews/${interviewId}/realtime-token`, {
          method: "POST",
        });
        if (!tokenRes.ok) throw new Error("token_mint_failed");
        const { clientSecret, model } = (await tokenRes.json()) as {
          clientSecret: string;
          model: string;
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
            body: offer.sdp,
          },
        );
        if (!sdpRes.ok) throw new Error("sdp_exchange_failed");
        const answerSdp = await sdpRes.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        startedAtRef.current = Date.now();
        if (!cancelled) {
          setConnected(true);
          setOrbState("listening");
        }
      } catch {
        if (!cancelled) setSessionError("connect_failed");
      }
    }

    void connect();

    return () => {
      cancelled = true;
      teardownMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, retryNonce]);

  // ---- elapsed timer ----
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [connected]);

  // ---- periodic transcript flush ----
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => void flushTranscript(), FLUSH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [connected, flushTranscript]);

  // ---- controls ----
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      setOrbState(next ? "paused" : "listening");
      return next;
    });
  }, []);

  const skipQuestion = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "The subject wants to move on — gently move to the next topic.",
        },
      }),
    );
    setOrbState("thinking");
  }, []);

  /** Stop the recorder and resolve with the session's single webm blob. */
  const stopRecorder = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(
          recordedChunksRef.current.length
            ? new Blob(recordedChunksRef.current, { type: "audio/webm" })
            : null,
        );
        return;
      }
      rec.onstop = () => {
        resolve(
          recordedChunksRef.current.length
            ? new Blob(recordedChunksRef.current, { type: "audio/webm" })
            : null,
        );
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);

  const uploadAudio = useCallback(
    async (blob: Blob): Promise<void> => {
      const post = () =>
        fetch(`/api/interviews/${interviewId}/audio`, {
          method: "POST",
          headers: { "Content-Type": "audio/webm" },
          body: blob,
        });
      try {
        const res = await post();
        if (!res.ok) await post(); // one retry — audio is best-effort
      } catch {
        try {
          await post();
        } catch {
          // Give up quietly; the transcript is the primary record.
        }
      }
    },
    [interviewId],
  );

  /** "I'm done for today" — orderly teardown, then hand off to the recap. */
  const endSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setIsEnding(true);
    setEndError(null);

    const durationSec = Math.floor((Date.now() - startedAtRef.current) / 1000);

    try {
      const blob = await stopRecorder();
      dcRef.current?.close();
      pcRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());

      await flushTranscript();
      if (blob) await uploadAudio(blob);

      const res = await fetch(`/api/interviews/${interviewId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSec }),
      });
      if (!res.ok) throw new Error("complete_failed");
      const { recapUrl } = (await res.json()) as { recapUrl: string };
      router.push(recapUrl);
    } catch {
      endingRef.current = false;
      setIsEnding(false);
      setEndError("We couldn't wrap up just now. Your words are safe — try again.");
    }
  }, [flushTranscript, interviewId, router, stopRecorder, uploadAudio]);

  // ---- error cards ----
  if (sessionError === "mic_denied") {
    return (
      <SessionCard
        title="Anna can't hear you yet"
        body={`To talk with Anna, your browser needs permission to use the microphone. Allow it in the address bar, then try again.`}
        actionLabel="Try again"
        onAction={() => {
          setSessionError(null);
          setRetryNonce((n) => n + 1);
        }}
        seriesId={seriesId}
      />
    );
  }
  if (sessionError === "connect_failed") {
    return (
      <SessionCard
        title="The line didn't connect"
        body="Something got in the way of starting the conversation. Nothing is lost — the session will pick up where it left off."
        actionLabel="Try again"
        onAction={() => {
          setSessionError(null);
          setRetryNonce((n) => n + 1);
        }}
        seriesId={seriesId}
      />
    );
  }

  // ---- the stage ----
  const orbClass =
    orbState === "speaking"
      ? "orb is-speaking"
      : orbState === "listening"
        ? "orb is-listening"
        : orbState === "paused"
          ? "orb is-paused"
          : "orb is-thinking";

  return (
    <div className="dark-session fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* hidden sink for Anna's voice */}
      <audio ref={audioElRef} autoPlay className="hidden" />

      {/* top bar */}
      <header className="flex items-center justify-between px-6 py-4 text-[13px]">
        <div className="min-w-0">
          <span className="block truncate font-semibold text-[#F7F5F0]">{seriesTitle}</span>
          {handoff ? (
            <span className="text-[12px] text-[rgba(247,245,240,0.55)]">
              Talking with {subjectName}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[rgba(247,245,240,0.7)]">
          {connected ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[oklch(0.72_0.08_165)]" />
              recording
            </span>
          ) : null}
          <span className="tabular-nums">{formatElapsed(elapsedSec)}</span>
        </div>
      </header>

      {/* center stage */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <div className={orbClass} aria-hidden />
        <div className="max-w-2xl">
          {connected ? (
            <p className="font-serif text-[clamp(20px,3.2vw,30px)] leading-snug text-[#F7F5F0]">
              {currentQuestion ??
                (handoff
                  ? `Hi ${subjectName} — I'm Anna. Whenever you're ready, just say hello.`
                  : "Anna is listening — say hello whenever you're ready.")}
            </p>
          ) : (
            <p className="font-serif text-xl text-[rgba(247,245,240,0.7)]">
              Connecting to Anna…
            </p>
          )}
          <p
            className="spoken mt-5 min-h-6 text-[15px] text-[rgba(247,245,240,0.55)]"
            style={{
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0, black 18%, black 100%)",
              maskImage: "linear-gradient(90deg, transparent 0, black 18%, black 100%)",
            }}
            aria-live="polite"
          >
            {liveLine}
          </p>
        </div>
        {endError ? <p className="text-[13px] text-[oklch(0.7_0.1_50)]">{endError}</p> : null}
      </main>

      {/* controls */}
      <footer className="flex flex-col items-center gap-4 pb-8">
        <div className="flex items-center gap-6">
          <SessionButton
            label={isPaused ? "Resume" : "Pause"}
            glyph={isPaused ? "▶" : "⏸"}
            onClick={togglePause}
            disabled={!connected || isEnding}
          />
          <SessionButton
            label="Skip question"
            glyph="→"
            onClick={skipQuestion}
            disabled={!connected || isPaused || isEnding}
          />
          <SessionButton
            label={isEnding ? "Wrapping up…" : "I'm done for today"}
            glyph="✓"
            onClick={() => void endSession()}
            disabled={!connected || isEnding}
            primary
          />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="text-[12px] font-medium text-[rgba(247,245,240,0.55)] hover:text-[rgba(247,245,240,0.85)]"
        >
          {drawerOpen ? "Hide transcript" : `Transcript so far${turns.length ? ` (${turns.length})` : ""}`}
        </button>
        {drawerOpen ? (
          <div className="max-h-48 w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(247,245,240,0.12)] bg-[rgba(247,245,240,0.04)] px-5 py-4 text-left">
            {turns.length === 0 ? (
              <p className="text-[13px] text-[rgba(247,245,240,0.55)]">
                Nothing captured yet — it&apos;ll appear here as you talk.
              </p>
            ) : (
              turns.map((t) => (
                <p
                  key={t.seq}
                  className={
                    t.role === "subject"
                      ? "spoken mb-2 text-[14.5px] text-[rgba(247,245,240,0.85)]"
                      : "mb-2 text-[13.5px] text-[rgba(247,245,240,0.6)]"
                  }
                >
                  {t.role === "interviewer" ? "Anna — " : ""}
                  {t.text}
                </p>
              ))
            )}
          </div>
        ) : null}
      </footer>
    </div>
  );
}

/** Round session-control button per the mockup's .session-btn. */
function SessionButton({
  label,
  glyph,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 text-[12px] font-semibold text-[rgba(247,245,240,0.85)] disabled:opacity-40"
    >
      <span
        className={
          primary
            ? "flex h-14 w-14 items-center justify-center rounded-full border border-[oklch(0.72_0.08_165/0.5)] bg-[oklch(0.72_0.08_165/0.16)] text-[19px] text-[oklch(0.72_0.08_165)]"
            : "flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(247,245,240,0.12)] bg-[rgba(247,245,240,0.06)] text-[19px]"
        }
        aria-hidden
      >
        {glyph}
      </span>
      {label}
    </button>
  );
}

/** Full-screen dark card for mic-denied / connect-failed states. */
function SessionCard({
  title,
  body,
  actionLabel,
  onAction,
  seriesId,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  seriesId: string;
}) {
  return (
    <div className="dark-session fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-[rgba(247,245,240,0.12)] bg-[rgba(247,245,240,0.04)] px-8 py-9 text-center">
        <h1 className="font-serif text-2xl text-[#F7F5F0]">{title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[rgba(247,245,240,0.65)]">{body}</p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onAction}
            className="rounded-full bg-[oklch(0.52_0.06_165)] px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[oklch(0.4_0.06_165)]"
          >
            {actionLabel}
          </button>
          <a
            href={`/app/series/${seriesId}`}
            className="text-[13px] font-medium text-[rgba(247,245,240,0.55)] hover:text-[rgba(247,245,240,0.85)]"
          >
            Back to the series
          </a>
        </div>
      </div>
    </div>
  );
}
