import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { serviceClient } from "@/db/service";
import { runInterview } from "./fsm-runner";

/**
 * Handler invoked by server.ts when Twilio ConversationRelay opens a
 * WebSocket to /api/voice/relay?session=<uuid>. Loads the session +
 * snapshot from the DB and hands control to the interview FSM.
 */
export async function handleRelayConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const sessionId = url.searchParams.get("session") ?? "";
  console.log("[voice/relay] handleRelayConnection session=", sessionId, "subproto=", req.headers["sec-websocket-protocol"], "ua=", req.headers["user-agent"]);

  // Wire close + error + raw-data logs FIRST so we see anything Twilio sends.
  ws.on("close", (code, reason) => {
    console.log("[voice/relay] ws close", code, reason.toString() || "(no reason)");
  });
  ws.on("error", (err) => {
    console.log("[voice/relay] ws error", err.message);
  });
  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      console.log("[voice/relay] binary message", (data as Buffer).length, "bytes");
    } else {
      console.log("[voice/relay] raw text:", data.toString().slice(0, 400));
    }
  });

  if (!sessionId) {
    ws.close(1008, "missing session id");
    return;
  }

  const svc = serviceClient();

  const { data: session } = await svc
    .from("interview_sessions")
    .select("id, request_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    ws.close(1008, "session not found");
    return;
  }

  const { data: request } = await svc
    .from("interview_requests")
    .select("template_snapshot, contact_id")
    .eq("id", session.request_id)
    .maybeSingle();
  if (!request) {
    ws.close(1008, "request not found");
    return;
  }

  const snapshot = request.template_snapshot as {
    name: string;
    intro_message?: string | null;
    questions: { id: string; prompt: string; max_seconds?: number | null }[];
  };

  const { data: contact } = await svc
    .from("contacts")
    .select("first_name")
    .eq("id", request.contact_id)
    .maybeSingle();

  await runInterview({
    ws,
    sessionId,
    firstName: contact?.first_name ?? "there",
    intro: snapshot.intro_message?.trim() ?? "",
    questions: snapshot.questions ?? [],
  });
}
