import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare quick-tunnel hostname during local dev so Twilio
  // (and your own phone) can reach the dev server without cross-origin block.
  // Tunnel URLs from `cloudflared tunnel --url http://localhost:3000` use
  // the *.trycloudflare.com domain.
  allowedDevOrigins: ["*.trycloudflare.com"],

  async headers() {
    return [
      {
        // The service worker must never be served from cache, or a stale copy
        // can pin users to an old asset cache across deploys. It also has to
        // be allowed to control the whole origin, not just /.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
