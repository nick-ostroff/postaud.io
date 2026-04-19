/**
 * Custom Next.js server that also handles the /api/voice/relay WebSocket
 * upgrade for Twilio ConversationRelay.
 *
 *   npm run dev  →  tsx server.ts
 *   npm start    →  node dist/server.js  (production, after tsc)
 *
 * Everything except the WebSocket path is handed off to Next's request
 * handler, so App Router behavior (HMR, route handlers, RSC) is unchanged.
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { handleRelayConnection } from "./src/server/voice/relay";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

void app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsed = parse(req.url ?? "/", true);
    void handler(req, res, parsed);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/api/voice/relay") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleRelayConnection(ws, req).catch((err) => {
          console.error("[voice/relay] handler error", err);
          try { ws.close(1011, "server error"); } catch { /* noop */ }
        });
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, () => {
    console.log(`> PostAud.io ready on http://${hostname}:${port} (WS: /api/voice/relay)`);
  });
});
