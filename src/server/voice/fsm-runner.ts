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
 * Twilio closes the connection if the server doesn't respond to `setup` fast,
 * so the message handler must attach BEFORE we hit the DB. The TwiML's
 * `welcomeGreeting` plays the personalized intro via Twilio's own TTS, which
 * keeps Twilio occupied while we load the question list.
 *
 *   Twilio → us: setup, prompt{voicePrompt,last}, interrupt, dtmf, end, error
 *   us → Twilio: {type:"text", token, last}  → TTS-synthesized speech
 *                {type:"end"}                 → hang up the call
 */
export async function runInterview(args: {
  ws: WebSocket;
  sessionId: string;
}): Promise<void> {
  const { ws, sessionId } = args;
  const svc = serviceClient();

  let questions: Question[] = [];
  let questionIndex = -1;
  let closed = false;

  let resolveData: () => void = () => {};
  const dataReady = new Promise<void>((r) => {
    resolveData = r;
  });

  function sendText(text: string) {
    if (closed || ws.readyState !== ws.OPEN) {
      console.log("[voice/relay] sendText skipped: closed=", closed, "readyState=", ws.readyState);
      return;
    }
    const payload = JSON.stringify({ type: "text", token: text, last: true });
    console.log("[voice/relay] → text", `"${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`, "bytes=", payload.length);
    ws.send(payload, (err) => {
      if (err) console.error("[voice/relay] ws.send error", err.message);
    });
  }

  function sendEnd() {
    if (closed || ws.readyState !== ws.OPEN) return;
    console.log("[voice/relay] → end");
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

    const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    void fetch(`${base}/api/jobs/process-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch((err) => console.error("[voice/relay] pipeline kickoff failed", err));

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
          // TwiML's welcomeGreeting plays the intro via Twilio; we just need to
          // send the first question once the DB load completes.
          await dataReady;
          if (closed || ws.readyState !== ws.OPEN) return;
          if (questions.length === 0) {
            return finishInterview();
          }
          questionIndex = 0;
          askCurrent();
          return;
        }

        case "prompt": {
          await dataReady;
          if (questionIndex < 0 || questionIndex >= questions.length) return;
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
            await dataReady;
            if (questionIndex >= 0 && questionIndex < questions.length) {
              await persistAnswer(questionIndex, "");
              questionIndex += 1;
              if (questionIndex >= questions.length) return finishInterview();
              askCurrent();
            }
          }
          return;
        }

        case "interrupt":
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

  try {
    const { data: session } = await svc
      .from("interview_sessions")
      .select("id, request_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) {
      console.error("[voice/relay] session not found", sessionId);
      ws.close(1008, "session not found");
      return;
    }

    const { data: request } = await svc
      .from("interview_requests")
      .select("template_snapshot")
      .eq("id", session.request_id)
      .maybeSingle();
    if (!request) {
      console.error("[voice/relay] request not found", session.request_id);
      ws.close(1008, "request not found");
      return;
    }

    const snapshot = request.template_snapshot as {
      questions?: Question[];
    };
    questions = snapshot.questions ?? [];
    console.log("[voice/relay] loaded", questions.length, "questions for session", sessionId);
    resolveData();
  } catch (err) {
    console.error("[voice/relay] data load failed", err);
    try { ws.close(1011, "server error"); } catch { /* noop */ }
  }
}
