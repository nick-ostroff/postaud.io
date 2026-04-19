import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket } from "ws";
import { serviceClient } from "@/db/service";
import { runInterview } from "./fsm-runner";

// Twilio sends `setup` within ~10ms of WS open, but our DB loads below take
// ~100-300ms. Node's EventEmitter doesn't buffer, so attaching the FSM handler
// after the awaits would drop `setup` entirely — call connects, silence, hangup.
// Buffer messages here and replay them once the FSM is wired up.
export async function handleRelayConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const sessionId = url.searchParams.get("session") ?? "";
  console.log("[voice/relay] handleRelayConnection session=", sessionId, "subproto=", req.headers["sec-websocket-protocol"], "ua=", req.headers["user-agent"]);

  const pending: { data: RawData; isBinary: boolean }[] = [];
  const bufferHandler = (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      console.log("[voice/relay] binary message", (data as Buffer).length, "bytes");
    } else {
      console.log("[voice/relay] raw text:", data.toString().slice(0, 400));
    }
    pending.push({ data, isBinary });
  };
  ws.on("message", bufferHandler);
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

  ws.off("message", bufferHandler);

  await runInterview({
    ws,
    sessionId,
    firstName: contact?.first_name ?? "there",
    intro: snapshot.intro_message?.trim() ?? "",
    questions: snapshot.questions ?? [],
  });

  for (const m of pending) {
    console.log("[voice/relay] replaying buffered message, isBinary=", m.isBinary);
    ws.emit("message", m.data, m.isBinary);
  }
}
