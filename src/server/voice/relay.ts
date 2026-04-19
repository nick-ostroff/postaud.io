import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { runInterview } from "./fsm-runner";

// The FSM runner attaches its message handler synchronously before doing any
// DB work, so we don't need the buffer/replay dance here. Twilio sends `setup`
// within ~10ms of WS open and closes the connection fast if the handler isn't
// already listening.
export async function handleRelayConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const sessionId = url.searchParams.get("session") ?? "";
  console.log("[voice/relay] handleRelayConnection session=", sessionId, "subproto=", req.headers["sec-websocket-protocol"], "ua=", req.headers["user-agent"]);

  ws.on("close", (code, reason) => {
    console.log("[voice/relay] ws close", code, reason.toString() || "(no reason)");
  });
  ws.on("error", (err) => {
    console.log("[voice/relay] ws error", err.message);
  });

  if (!sessionId) {
    ws.close(1008, "missing session id");
    return;
  }

  await runInterview({ ws, sessionId });
}
