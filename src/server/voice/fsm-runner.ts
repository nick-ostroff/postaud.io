import type { WebSocket } from "ws";
import { serviceClient } from "@/db/service";
import { env } from "@/lib/env";

type Question = { id: string; prompt: string; max_seconds?: number | null };

type IncomingMsg =
  | { type: "setup"; callSid: string }
  | { type: "prompt"; voicePrompt: string; last?: boolean }
  | { type: "interrupt" }
  | { type: "dtmf"; digit: string }
  | { type: "error"; description?: string }
  | { type: "end" };

/**
 * Drives the interview over a Twilio ConversationRelay WebSocket.
 *
 * Protocol (simplified, https://www.twilio.com/docs/voice/twiml/connect/conversationrelay):
 *   Twilio → us: setup, prompt{voicePrompt,last}, interrupt, dtmf, end, error
 *   us → Twilio: {type:"text", token, last}  → TTS-synthesized speech
 *                {type:"end"}                 → hang up the call
 *
 * We advance through questions on each finalized `prompt` (user finished
 * speaking). DTMF * or # also advances early. No AI follow-ups yet — those
 * are V3; for now the flow is rigid + scripted.
 */
export async function runInterview(args: {
  ws: WebSocket;
  sessionId: string;
  firstName: string;
  intro: string;
  questions: Question[];
}): Promise<void> {
  const { ws, sessionId, firstName, intro, questions } = args;
  const svc = serviceClient();

  let questionIndex = -1; // -1 = haven't asked anything yet
  let closed = false;

  function sendText(text: string) {
    if (closed || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "text", token: text, last: true }));
  }

  function sendEnd() {
    if (closed || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "end" }));
    closed = true;
    setTimeout(() => { try { ws.close(); } catch { /* noop */ } }, 500);
  }

  async function persistAnswer(index: number, transcript: string) {
    const q = questions[index];
    if (!q) return;
    await svc.from("call_events").insert({
      session_id: sessionId,
      event_type: "answer_recorded",
      question_id: q.id,
      payload: { q_index: index, transcript },
    });
  }

  function askCurrent() {
    const q = questions[questionIndex];
    if (!q) return;
    const preface = questionIndex === 0 ? "Here's the first question." : "Next question.";
    sendText(`${preface} ${q.prompt}`);
  }

  async function finishInterview() {
    sendText("That's everything. Thanks so much for taking the time. Your responses are on their way to the sender. Goodbye.");

    // Kick off the processing pipeline in the background.
    const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    void fetch(`${base}/api/jobs/process-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch((err) => console.error("[voice/relay] pipeline kickoff failed", err));

    // Give the TTS a moment to play the goodbye before we hang up.
    setTimeout(() => sendEnd(), 4000);
  }

  ws.on("message", (raw) => {
    let msg: IncomingMsg;
    const text = raw.toString();
    try {
      msg = JSON.parse(text) as IncomingMsg;
    } catch {
      console.log("[voice/relay] non-JSON message:", text.slice(0, 200));
      return;
    }
    console.log("[voice/relay] ←", msg.type, msg.type === "prompt" ? `"${(msg as { voicePrompt: string }).voicePrompt?.slice(0, 80)}" last=${(msg as { last?: boolean }).last}` : "");

    void (async () => {
      switch (msg.type) {
        case "setup": {
          // Greet + first question in one TTS pass so the call feels natural.
          const greeting = [
            `Hi ${firstName}.`,
            intro || "Thanks for calling. I'll ask you a few quick questions.",
            "This call is being recorded so the sender can review your answers.",
          ].join(" ");
          sendText(greeting);

          if (questions.length === 0) {
            return finishInterview();
          }

          questionIndex = 0;
          // Small pause so Twilio TTS finishes greeting before next text.
          setTimeout(() => askCurrent(), 800);
          return;
        }

        case "prompt": {
          if (questionIndex < 0 || questionIndex >= questions.length) return;
          // Only act on the final chunk of the turn.
          if (msg.last === false) return;

          const transcript = (msg.voicePrompt ?? "").trim();
          await persistAnswer(questionIndex, transcript);

          questionIndex += 1;
          if (questionIndex >= questions.length) {
            return finishInterview();
          }
          askCurrent();
          return;
        }

        case "dtmf": {
          if (msg.digit === "*" || msg.digit === "#") {
            if (questionIndex >= 0 && questionIndex < questions.length) {
              await persistAnswer(questionIndex, ""); // no transcript — they skipped
              questionIndex += 1;
              if (questionIndex >= questions.length) return finishInterview();
              askCurrent();
            }
          }
          return;
        }

        case "interrupt":
          // User spoke during our TTS; Twilio stops the TTS automatically.
          return;

        case "error":
          console.error("[voice/relay] twilio error", msg.description);
          return;

        case "end":
          closed = true;
          return;
      }
    })().catch((err) => console.error("[voice/relay] handler error", err));
  });

  ws.on("close", () => { closed = true; });
}
