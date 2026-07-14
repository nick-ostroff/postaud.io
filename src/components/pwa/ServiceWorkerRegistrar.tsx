"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` (offline page + asset cache) on every page.
 *
 * Renders nothing. Two deliberate choices:
 *
 *  - Production only. A worker registered against localhost survives across
 *    branches and can serve stale assets into `next dev`, so in development we
 *    actively tear down any worker a previous production visit left behind.
 *  - No auto-reload when a new worker takes over. The worker never caches HTML,
 *    so the next navigation is fresh regardless — and yanking the page out from
 *    under someone mid-interview would cost them the session.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        // Offline support is a bonus, not a requirement — a failed
        // registration must never surface to the user.
        console.error("Service worker registration failed", error);
      });
  }, []);

  return null;
}
