"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationMode } from "@/db/types";
import { TranscriptBatch, type TranscriptTurn } from "@/lib/transcript-batch";

type LiveInterviewProps = {
  interviewId: string;
  seriesId: string;
  seriesTitle: string;
  subjectName: string;
  handoff: boolean;
  mode: ConversationMode;
  pendingQueue: { id: string; text: string }[];
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
  response?: { usage?: RealtimeResponseUsage };
  /**
   * Present on `response.output_item.done` (verified against openai@6.34.0's
   * `ResponseOutputItemDoneEvent.item: ConversationItem` in
   * node_modules/openai/resources/realtime/realtime.d.ts). For a function
   * call the item is a `RealtimeConversationItemFunctionCall`:
   * `{ type: "function_call", name, arguments, call_id? }` — `call_id` is
   * optional per the SDK type, so callers must still guard for it.
   */
  item?: { type?: string; name?: string; call_id?: string; arguments?: string };
};

/**
 * `event.response.usage` on a `response.done` event (verified against
 * openai@6.34.0's `RealtimeResponseUsage` in
 * node_modules/openai/resources/realtime/realtime.d.ts). Every field is
 * optional per the SDK types — a response can omit usage entirely, or omit
 * individual detail sub-fields — so accumulation must treat missing as 0
 * rather than guessing a value.
 */
type RealtimeResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    audio_tokens?: number;
    text_tokens?: number;
    cached_tokens?: number;
  };
  output_token_details?: {
    audio_tokens?: number;
    text_tokens?: number;
  };
};

/** Running sum of every `response.done` usage payload seen this session. */
type RealtimeUsageAccumulator = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioInputTokens: number;
  textInputTokens: number;
  cachedInputTokens: number;
  audioOutputTokens: number;
  textOutputTokens: number;
  /** Count of `response.done` events that actually carried a `usage` object — 0 means "post nothing". */
  responseCount: number;
  /** Every raw usage payload as received, kept verbatim for the audit trail. */
  rawUsages: RealtimeResponseUsage[];
};

function emptyUsageAccumulator(): RealtimeUsageAccumulator {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    audioInputTokens: 0,
    textInputTokens: 0,
    cachedInputTokens: 0,
    audioOutputTokens: 0,
    textOutputTokens: 0,
    responseCount: 0,
    rawUsages: [],
  };
}

/** One proposed follow-up question shown as a tappable card (Flow mode). */
type FollowupCard = { text: string; queued: boolean };

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
  mode,
  pendingQueue,
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

  // Flow mode: proposed follow-up cards, the save-for-later queue count, and
  // a transient toast for queue/error feedback.
  const [followups, setFollowups] = useState<FollowupCard[] | null>(null);
  const [queueCount, setQueueCount] = useState(pendingQueue.length);
  const [toast, setToast] = useState<string | null>(null);

  // Quickfire mode: "Question N of T" progress, driven by mark_question_asked.
  const [quickfireProgress, setQuickfireProgress] = useState<{ index: number; total: number } | null>(null);

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
  const usageRef = useRef<RealtimeUsageAccumulator>(emptyUsageAccumulator());
  const realtimeModelRef = useRef<string | null>(null);
  // The queue-row order the token route baked into the prompt at mint time —
  // the single source of truth for mapping mark_question_asked indices and the
  // flow opener back to rows. Refreshed on every mint/reconnect, so it self-
  // heals if the queue changed between page load and connect.
  const queueIdsRef = useRef<string[]>([]);
  // Flow mode: has the opener question (queue row 0, which the prompt tells the
  // model to open with) already been marked asked this session? One-shot guard.
  const flowOpenerMarkedRef = useRef(false);
  // Flow mode: the call_id awaiting a chosen follow-up, the nudge fallback
  // timer, and whether we've already nudged for the current turn.
  const followupCallIdRef = useRef<string | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgedRef = useRef(false);

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
   * - response.done → accumulates event.response.usage (exact token counts,
   *   never estimated — see RealtimeUsageAccumulator)
   * - response.output_item.done → Flow mode: item.type === "function_call"
   *   with item.name === "propose_followups" surfaces the follow-up cards.
   *   Quickfire mode: item.name === "mark_question_asked" updates the
   *   progress line and flips the matching queue row to asked.
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
            if (mode === "flow" && !pausedRef.current && !endingRef.current) {
              if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
              nudgeTimerRef.current = setTimeout(() => {
                // The model finished hearing an answer but never proposed
                // follow-ups. Nudge once; if it still doesn't, the session
                // degrades to a normal conversation — never block.
                if (followupCallIdRef.current || nudgedRef.current || endingRef.current) return;
                nudgedRef.current = true;
                const dc = dcRef.current;
                if (dc?.readyState === "open") {
                  dc.send(
                    JSON.stringify({
                      type: "response.create",
                      response: {
                        instructions:
                          "Call the propose_followups tool now with 2-3 follow-up questions to what the subject just said. Do not speak.",
                      },
                    }),
                  );
                }
              }, 6000);
            }
            break;
          case "response.output_audio_transcript.done":
            if (event.transcript) {
              addTurn("interviewer", event.transcript);
              setCurrentQuestion(event.transcript.trim());
            }
            // Flow opener: when the queue is non-empty the prompt instructs the
            // model to OPEN with queue row 0, but nothing else ever marks that
            // row asked (mark_question_asked is quickfire-only). On the model's
            // first spoken line this session, flip row 0 to asked — best-effort
            // and an approximation (we trust the prompt made the model open
            // with it; we can't verify the words matched). One-shot per session.
            if (
              mode === "flow" &&
              !flowOpenerMarkedRef.current &&
              queueIdsRef.current.length > 0 &&
              event.transcript
            ) {
              flowOpenerMarkedRef.current = true;
              void fetch(`/api/series/${seriesId}/queue`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "markAsked",
                  ids: [queueIdsRef.current[0]],
                  interviewId,
                }),
              }).catch(() => {
                // Unmarked row stays pending and reappears next session — acceptable.
              });
            }
            break;
          case "input_audio_buffer.speech_started":
            if (!pausedRef.current) setOrbState("listening");
            break;
          case "input_audio_buffer.speech_stopped":
            if (!pausedRef.current) setOrbState("thinking");
            break;
          case "output_audio_buffer.started":
            // The model chose to speak — don't nudge over it.
            if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
            if (!pausedRef.current) setOrbState("speaking");
            break;
          case "output_audio_buffer.stopped":
            if (!pausedRef.current) setOrbState("listening");
            break;
          case "response.done": {
            // Sum only what the event actually reports — missing fields add 0,
            // never a guessed value. `usage` itself can be absent (e.g. a
            // cancelled response), in which case we add nothing at all.
            const usage = event.response?.usage;
            if (usage) {
              const acc = usageRef.current;
              acc.inputTokens += usage.input_tokens ?? 0;
              acc.outputTokens += usage.output_tokens ?? 0;
              acc.totalTokens += usage.total_tokens ?? 0;
              acc.audioInputTokens += usage.input_token_details?.audio_tokens ?? 0;
              acc.textInputTokens += usage.input_token_details?.text_tokens ?? 0;
              acc.cachedInputTokens += usage.input_token_details?.cached_tokens ?? 0;
              acc.audioOutputTokens += usage.output_token_details?.audio_tokens ?? 0;
              acc.textOutputTokens += usage.output_token_details?.text_tokens ?? 0;
              acc.responseCount += 1;
              acc.rawUsages.push(usage);
            }
            break;
          }
          case "response.output_item.done": {
            const item = event.item;
            if (
              mode === "flow" &&
              item?.type === "function_call" &&
              item.name === "propose_followups" &&
              item.call_id
            ) {
              let questions: string[] = [];
              try {
                const args = JSON.parse(item.arguments ?? "{}") as { questions?: unknown };
                if (Array.isArray(args.questions)) {
                  questions = args.questions.filter(
                    (q): q is string => typeof q === "string" && q.trim().length > 0,
                  );
                }
              } catch {
                // Malformed args — treat as no proposal; conversation continues.
              }
              if (questions.length > 0) {
                // If a call_id was already pending (rare — the model replaced
                // its own proposal with a new one), the old call_id is
                // intentionally abandoned in favor of this newer call.
                followupCallIdRef.current = item.call_id;
                if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
                nudgedRef.current = false;
                // Freeze the mic while the cards are up so VAD can't race the choice.
                micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
                setFollowups(questions.slice(0, 3).map((text) => ({ text, queued: false })));
                if (!pausedRef.current) setOrbState("listening");
              } else {
                // Malformed args or an empty question set. The prompt told the
                // model to stay silent until the tool result arrives, so doing
                // nothing here would leave it silent forever — dead air. Return
                // an error output + response.create so it recovers (retries the
                // tool or just keeps the conversation going).
                const dc = dcRef.current;
                if (dc?.readyState === "open") {
                  dc.send(
                    JSON.stringify({
                      type: "conversation.item.create",
                      item: {
                        type: "function_call_output",
                        call_id: item.call_id,
                        output: JSON.stringify({ error: "invalid_proposal" }),
                      },
                    }),
                  );
                  dc.send(JSON.stringify({ type: "response.create" }));
                }
              }
            }
            if (
              mode === "quickfire" &&
              item?.type === "function_call" &&
              item.name === "mark_question_asked" &&
              item.call_id
            ) {
              let index = 0;
              let total = 0;
              try {
                const args = JSON.parse(item.arguments ?? "{}") as { index?: number; total?: number };
                index = typeof args.index === "number" ? args.index : 0;
                total = typeof args.total === "number" ? args.total : 0;
              } catch {
                // Malformed args — ack anyway so the model moves on.
              }
              if (index > 0 && total > 0) setQuickfireProgress({ index, total });

              // Ack the tool so the model continues to the next question.
              const dc = dcRef.current;
              if (dc?.readyState === "open") {
                dc.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: item.call_id,
                      output: JSON.stringify({ ok: true }),
                    },
                  }),
                );
                dc.send(JSON.stringify({ type: "response.create" }));
              }

              // Items 1..queueIdsRef.length in the QUESTION LIST are queue
              // rows, in order. queueIdsRef holds the exact order the token
              // route baked into the prompt at mint time — the same one shown
              // to the model — so it can't desync from an admin reorder between
              // page load and mint, and it self-heals on reconnect. Flip the
              // matching row to asked — best-effort.
              const queueId =
                index >= 1 && index <= queueIdsRef.current.length ? queueIdsRef.current[index - 1] : null;
              if (queueId) {
                void fetch(`/api/series/${seriesId}/queue`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "markAsked", ids: [queueId], interviewId }),
                }).catch(() => {
                  // Unmarked rows stay pending and get re-asked next time — acceptable.
                });
              }
            }
            break;
          }
        }
      };
    },
    [addTurn, mode, seriesId, interviewId],
  );

  /** Stop every media resource. Safe to call repeatedly. */
  const teardownMedia = useCallback(() => {
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
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

      // Dead-connection detector: a session that drops mid-interview should
      // surface the retry card, not an orb frozen on "listening".
      pc.onconnectionstatechange = () => {
        if (
          (pc.connectionState === "failed" || pc.connectionState === "closed") &&
          !cancelled &&
          !endingRef.current
        ) {
          setSessionError("connect_failed");
        }
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
        const { clientSecret, model, queueIds } = (await tokenRes.json()) as {
          clientSecret: string;
          model: string;
          queueIds?: string[];
        };
        realtimeModelRef.current = model;
        // The order the prompt's QUESTION LIST / flow opener was built from.
        // Refreshed on every mint (including reconnects), so index-based
        // mark-asked mapping tracks exactly what the model was shown.
        queueIdsRef.current = queueIds ?? [];

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

  // ---- best-effort flush when the tab is hidden or torn down mid-session ----
  useEffect(() => {
    if (!connected) return;
    const beacon = () => {
      const batch = batchRef.current;
      if (!batch.hasPending()) return;
      const snapshot = batch.pending();
      navigator.sendBeacon(
        `/api/interviews/${interviewId}/messages`,
        new Blob([JSON.stringify({ messages: snapshot })], { type: "application/json" }),
      );
      // Deliberately NOT marked sent: if the page survives (bfcache) the next
      // flush re-sends the same seqs and the server's unique index no-ops the
      // duplicates — strictly safer than trusting queued-for-delivery.
    };
    window.addEventListener("pagehide", beacon);
    return () => window.removeEventListener("pagehide", beacon);
  }, [connected, interviewId]);

  // ---- controls ----
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      // followupCallIdRef is non-null exactly when flow cards own the mic —
      // Resume must not re-enable it out from under a pending card choice,
      // regardless of whether the pause happened before or after the cards
      // arrived. answerFollowup re-enables the mic itself once a card is chosen.
      micStreamRef.current
        ?.getAudioTracks()
        .forEach((t) => (t.enabled = !next && followupCallIdRef.current === null));
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

  /** Flow mode: answer a proposed follow-up card aloud — resumes the model. */
  const answerFollowup = useCallback((text: string) => {
    const dc = dcRef.current;
    const callId = followupCallIdRef.current;
    if (!dc || dc.readyState !== "open" || !callId) return;
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ chosen: text }) },
      }),
    );
    dc.send(JSON.stringify({ type: "response.create" }));
    followupCallIdRef.current = null;
    setFollowups(null);
    // If the session was paused while the cards were up (a pause before the
    // cards even arrived is held by togglePause's followupCallIdRef guard),
    // answering a card must not silently re-open the mic or flip the orb off
    // "paused" — honor the pause until the user resumes.
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !pausedRef.current));
    if (!pausedRef.current) setOrbState("thinking");
  }, []);

  /** Flow mode: save a proposed follow-up for later instead of answering it now. */
  const queueFollowup = useCallback(
    async (index: number, text: string) => {
      try {
        const res = await fetch(`/api/interviews/${interviewId}/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error();
        const { pendingCount } = (await res.json()) as { pendingCount: number };
        setQueueCount(pendingCount);
        setFollowups((prev) => prev?.map((c, i) => (i === index ? { ...c, queued: true } : c)) ?? null);
        setToast(`Saved for later — Queue · ${pendingCount}`);
        setTimeout(() => setToast(null), 2500);
      } catch {
        setToast("Couldn't save that one — try again.");
        setTimeout(() => setToast(null), 2500);
      }
    },
    [interviewId],
  );

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

  /**
   * Post the session's accumulated Realtime usage before /complete. Skipped
   * entirely if no `response.done` event ever carried a `usage` object — we
   * genuinely saw nothing, so there is nothing true to report (posting
   * fabricated zeros would misrepresent that as "zero tokens used"). Best
   * effort: usage accounting must never block the end-of-session flow.
   */
  const postUsage = useCallback(async () => {
    const acc = usageRef.current;
    if (acc.responseCount === 0) return;
    try {
      await fetch(`/api/interviews/${interviewId}/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai_realtime",
          phase: "interview",
          model: realtimeModelRef.current ?? "gpt-realtime",
          inputTokens: acc.inputTokens,
          outputTokens: acc.outputTokens,
          totalTokens: acc.totalTokens,
          audioInputTokens: acc.audioInputTokens,
          textInputTokens: acc.textInputTokens,
          cachedInputTokens: acc.cachedInputTokens,
          audioOutputTokens: acc.audioOutputTokens,
          textOutputTokens: acc.textOutputTokens,
          raw: { responseCount: acc.responseCount, responses: acc.rawUsages },
        }),
      });
    } catch {
      // Network hiccup — usage is best-effort, never block ending the session.
    }
  }, [interviewId]);

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
      if (batchRef.current.hasPending()) await flushTranscript(); // one retry — closing words matter most
      if (blob) await uploadAudio(blob);
      await postUsage();

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
  }, [flushTranscript, interviewId, postUsage, router, stopRecorder, uploadAudio]);

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
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-4 text-[13px] sm:px-6">
        <div className="min-w-0">
          <span className="block truncate font-semibold text-[#F7F5F0]">{seriesTitle}</span>
          {handoff ? (
            <span className="text-[12px] text-[rgba(247,245,240,0.55)]">
              Talking with {subjectName}
            </span>
          ) : null}
        </div>
        {/* ● REC 00:14 — one mono pill, per the Talk-flow mockups. */}
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] font-medium tabular-nums text-[oklch(0.72_0.08_165)]">
          {connected ? (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[oklch(0.62_0.16_25)]" />
          ) : null}
          {connected
            ? `${mode === "flow" ? "FLOW" : mode === "quickfire" ? "QUICKFIRE" : "REC"} ${formatElapsed(elapsedSec)}`
            : "connecting…"}
        </div>
      </header>

      {/* center stage */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <div className={orbClass} aria-hidden />
        <div className="max-w-2xl">
          {mode === "flow" && followups ? (
            <div className="w-full max-w-md text-left">
              {toast ? (
                <div className="mx-auto mb-3 w-fit rounded-full border border-[oklch(0.72_0.08_165/0.45)] bg-[oklch(0.52_0.06_165/0.22)] px-4 py-2 text-[12.5px] font-semibold text-[oklch(0.85_0.05_165)]">
                  {toast}
                </div>
              ) : null}
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgba(240,237,230,0.5)]">
                Where next?
              </p>
              <div className="flex flex-col gap-2.5">
                {followups.map((card, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-[13px] border px-3.5 py-3 ${
                      card.queued
                        ? "border-[rgba(240,237,230,0.18)] bg-[rgba(240,237,230,0.08)] opacity-45"
                        : i === 0
                          ? "border-[oklch(0.72_0.08_165/0.5)] bg-[oklch(0.52_0.06_165/0.18)]"
                          : "border-[rgba(240,237,230,0.18)] bg-[rgba(240,237,230,0.08)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => answerFollowup(card.text)}
                      disabled={card.queued}
                      className={`min-w-0 flex-1 text-left font-serif text-[14.5px] leading-snug ${
                        card.queued ? "line-through" : ""
                      }`}
                    >
                      {card.text}
                    </button>
                    {card.queued ? (
                      <span aria-hidden className="shrink-0 text-[15px]">✓</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => answerFollowup(card.text)}
                          className="shrink-0 text-[12px] font-semibold text-[oklch(0.82_0.06_165)]"
                        >
                          Answer ›
                        </button>
                        <button
                          type="button"
                          aria-label="Save for later"
                          onClick={() => void queueFollowup(i, card.text)}
                          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-[1.5px] border-[rgba(240,237,230,0.35)] text-[16px] text-[rgba(240,237,230,0.8)]"
                        >
                          +
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-center text-[12px] text-[rgba(240,237,230,0.5)]">
                tap to answer · + saves for later
              </p>
            </div>
          ) : connected ? (
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
          {mode === "quickfire" && quickfireProgress ? (
            <p className="mt-2 text-[12px] font-medium tabular-nums text-[rgba(247,245,240,0.55)]">
              Question {Math.min(quickfireProgress.index + 1, quickfireProgress.total)} of{" "}
              {quickfireProgress.total}
            </p>
          ) : null}
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
      <footer className="flex flex-col items-center gap-4 px-5 pb-[max(32px,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-4 sm:gap-6">
          <SessionButton
            label={isPaused ? "Resume" : "Pause"}
            glyph={isPaused ? "▶" : "⏸"}
            onClick={togglePause}
            // UX polish only, not the invariant: this keeps the pause sheet
            // unreachable while cards are up in the common case. The actual
            // guarantee that Resume can't unfreeze the mic out from under a
            // pending card choice — regardless of ordering — lives in
            // togglePause's followupCallIdRef check.
            disabled={!connected || isEnding || (mode === "flow" && followups !== null)}
          />
          {mode === "flow" ? (
            <SessionButton
              label={`Queue · ${queueCount}`}
              glyph="≡"
              onClick={() => setDrawerOpen((v) => !v)}
              disabled={!connected || isEnding}
            />
          ) : (
            <SessionButton
              label="Skip question"
              glyph="→"
              onClick={skipQuestion}
              disabled={!connected || isPaused || isEnding}
            />
          )}
          <SessionButton
            label={isEnding ? "Wrapping up…" : mode === "flow" && followups ? "Stop here" : "I'm done"}
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

      {/* Pause (Talk-flow mockup 5e) — a bottom sheet over the dimmed stage.
          The mic is already muted by togglePause; this is the choice of what
          to do next, with the reassurance that nothing is at risk. */}
      {isPaused && !isEnding ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-[rgba(10,8,6,0.55)]">
          <div
            role="dialog"
            aria-label="Paused"
            className="flex flex-col gap-3 rounded-t-3xl bg-dark-2 px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-5"
          >
            <span aria-hidden className="mx-auto h-1 w-9 rounded-full bg-[rgba(240,237,230,0.2)]" />
            <p className="font-serif text-[21px] text-center text-[#F0EDE6]">Taking a break?</p>
            <button
              type="button"
              onClick={togglePause}
              className="rounded-pill bg-green py-4 text-[16px] font-semibold text-white hover:bg-green-deep"
            >
              ▶ Resume
            </button>
            <button
              type="button"
              onClick={() => {
                togglePause();
                skipQuestion();
              }}
              className="rounded-pill border border-[rgba(240,237,230,0.25)] py-3.5 text-[15px] text-[rgba(240,237,230,0.85)] hover:border-[rgba(240,237,230,0.5)]"
            >
              Skip this topic
            </button>
            <button
              type="button"
              onClick={() => void endSession()}
              className="rounded-pill border border-[rgba(240,237,230,0.25)] py-3.5 text-[15px] text-[rgba(240,237,230,0.85)] hover:border-[rgba(240,237,230,0.5)]"
            >
              I&apos;m done for today
            </button>
            <p className="pt-0.5 text-center text-xs text-[rgba(240,237,230,0.4)]">
              Everything so far is already saved
            </p>
          </div>
        </div>
      ) : null}
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
      className="flex w-[88px] flex-col items-center gap-2 text-center text-[12px] font-semibold leading-tight text-[rgba(247,245,240,0.85)] disabled:opacity-40"
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
