import type { MetadataRoute } from "next";

/**
 * Installed-app identity. `start_url` is the dashboard rather than the
 * marketing home: someone who put this on their home screen has already
 * bought in, and the auth guard on /app sends them to sign-in if they need it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "PostAud.io — AI knowledge interviewer",
    short_name: "PostAud.io",
    description:
      "Voice-first AI interviews that build a living knowledge base — not just a transcript.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F5F0", // --paper
    theme_color: "#F7F5F0",
    categories: ["productivity", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
