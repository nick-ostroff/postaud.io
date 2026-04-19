import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare quick-tunnel hostname during local dev so Twilio
  // (and your own phone) can reach the dev server without cross-origin block.
  // Tunnel URLs from `cloudflared tunnel --url http://localhost:3000` use
  // the *.trycloudflare.com domain.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
