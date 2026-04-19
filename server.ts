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
  // getUpgradeHandler exists on Next 14+ but must be called AFTER prepare().
  const upgradeHandler =
    typeof (app as unknown as { getUpgradeHandler?: () => unknown }).getUpgradeHandler === "function"
      ? ((app as unknown as { getUpgradeHandler: () => (req: unknown, socket: unknown, head: unknown) => void }).getUpgradeHandler())
      : null;

  const httpServer = createServer((req, res) => {
    const parsed = parse(req.url ?? "/", true);
    void handler(req, res, parsed);
  });

  // Disable permessage-deflate — some WS clients (incl. Twilio's Jetty) have
  // had flaky compat with it, and ConversationRelay's messages are tiny JSON.
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/api/voice/relay") {
      console.log("[voice/relay] upgrade from", req.socket.remoteAddress, "url:", req.url);
      wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("[voice/relay] upgraded, handing to handler");
        handleRelayConnection(ws, req).catch((err) => {
          console.error("[voice/relay] handler error", err);
          try { ws.close(1011, "server error"); } catch { /* noop */ }
        });
      });
    } else if (upgradeHandler) {
      // Let Next handle its own WebSocket upgrades (HMR / Turbopack).
      upgradeHandler(req, socket, head);
    }
  });

  httpServer.listen(port, () => {
    console.log(`> PostAud.io ready on http://${hostname}:${port} (WS: /api/voice/relay)`);
  });
});
