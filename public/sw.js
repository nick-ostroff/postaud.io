/**
 * PostAud.io service worker.
 *
 * Scope is deliberately narrow. This is an auth-gated app with live voice
 * sessions, so the worker NEVER caches HTML or API responses:
 *
 *   - Caching authed HTML would leak one user's dashboard to the next person
 *     who signs in on the same device, and would serve stale knowledge bases.
 *   - Caching /api/* would break interviews, streaming, and auth callbacks.
 *
 * What it does do: keep the hashed, immutable build assets and the app icons
 * on disk (fast, offline-tolerant launches), and show a real "you're offline"
 * page instead of Safari's dinosaur when a navigation fails.
 *
 * Bump CACHE_VERSION to evict every old cache on the next activate.
 */
const CACHE_VERSION = "v1";
const ASSETS = `postaudio-assets-${CACHE_VERSION}`;
const SHELL = `postaudio-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // `reload` so a redeploy can't hand us the old offline page from the
      // HTTP cache.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([ASSETS, SHELL]);
      const names = await caches.keys();
      await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))));
      await self.clients.claim();
    })(),
  );
});

/** Hashed build output and our own icons — content-addressed, safe to keep. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/splash/") ||
    /^\/(icon-|apple-touch-icon).*\.png$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that isn't a plain same-origin GET goes straight to the network:
  // POSTs, API calls, auth callbacks, Supabase, the realtime voice transport.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Every page load hits the network — never a cached copy — so authed pages
  // stay private and current. Offline, we swap in the offline page.
  if (request.mode === "navigate") {
    event.respondWith(networkOnlyWithOfflineFallback(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkOnlyWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("You're offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}
